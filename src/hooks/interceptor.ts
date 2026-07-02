/**
 * Interceptor de red en el MUNDO PRINCIPAL (MAIN world).
 *
 * Se inyecta en `document_start` antes de que corran los scripts de la página,
 * de modo que puede envolver `fetch`, `XMLHttpRequest` y `URL.createObjectURL`
 * para descubrir PDFs que llegan al navegador de forma dinámica.
 *
 * NO tiene acceso a las APIs `chrome.*`; se comunica con el content script
 * (mundo aislado) exclusivamente mediante `window.postMessage`.
 *
 * Sólo observa recursos que YA fueron entregados al navegador. No descifra,
 * no rompe autenticación y no accede a nada que la página no tuviera ya.
 */
import {
  BRIDGE_SOURCE,
  type BridgeMessage,
  type BridgeRequest,
  type DetectionMethod,
  type PdfSource,
  type SourceScheme,
} from '@/types';
import { arrayBufferToBase64 } from '@/utils/base64';

// Evita doble instrumentación (all_frames + match_about_blank pueden solaparse).
const FLAG = '__pdfGrabberInterceptorInstalled__';
if (!(window as unknown as Record<string, unknown>)[FLAG]) {
  (window as unknown as Record<string, unknown>)[FLAG] = true;
  install();
}

interface HeldBlob {
  blob: Blob;
  owned: boolean; // true => la object URL la creamos nosotros y podemos revocarla
  at: number;
}

const MAX_HELD = 12;

function install(): void {
  /** Blobs retenidos para poder recuperar sus bytes al descargar. */
  const held = new Map<string, HeldBlob>();

  const hash = (s: string): string => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
    return (h >>> 0).toString(36);
  };
  const schemeOf = (u: string): SourceScheme =>
    u.startsWith('blob:') ? 'blob' : u.startsWith('data:') ? 'data' : /^https?:/i.test(u) ? 'http' : 'unknown';

  const looksPdf = (u: string): boolean => {
    if (!u) return false;
    if (/^data:application\/pdf/i.test(u)) return true;
    try {
      const url = new URL(u, location.href);
      return /\.pdf$/i.test(url.pathname) || /[?&](format|type|mime)=[^&]*pdf/i.test(url.search);
    } catch {
      return /\.pdf(\?|#|$)/i.test(u);
    }
  };

  const remember = (url: string, blob: Blob, owned: boolean): void => {
    held.set(url, { blob, owned, at: Date.now() });
    // Evicción de los más antiguos que hayamos creado nosotros.
    if (held.size > MAX_HELD) {
      const entries = [...held.entries()].sort((a, b) => a[1].at - b[1].at);
      for (const [key, val] of entries) {
        if (held.size <= MAX_HELD) break;
        if (val.owned) {
          try {
            URL.revokeObjectURL(key);
          } catch {
            /* ignore */
          }
          held.delete(key);
        }
      }
    }
  };

  const report = (args: {
    url: string;
    method: DetectionMethod;
    mimeType?: string;
    size?: number;
    interceptorBlobUrl?: string;
  }): void => {
    const source: PdfSource = {
      id: `${args.method}:${hash(args.interceptorBlobUrl || args.url)}`,
      url: args.url,
      scheme: schemeOf(args.url),
      method: args.method,
      mimeType: args.mimeType,
      size: args.size,
      documentTitle: document.title || undefined,
      detectedAt: Date.now(),
      interceptorBlobUrl: args.interceptorBlobUrl,
    };
    const msg: BridgeMessage = { source: BRIDGE_SOURCE, kind: 'pdf-detected', source_info: source };
    window.postMessage(msg, '*');
  };

  const contentTypeIsPdf = (ct: string | null): boolean => !!ct && /application\/(x-)?pdf/i.test(ct);

  /* ------------------------------ fetch ------------------------------ */
  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function patchedFetch(this: unknown, ...fetchArgs: Parameters<typeof fetch>) {
      const promise = originalFetch.apply(this, fetchArgs);
      const reqUrl = urlFromFetchArgs(fetchArgs);
      promise
        .then((res) => {
          try {
            const ct = res.headers.get('content-type');
            if (!contentTypeIsPdf(ct) && !looksPdf(reqUrl)) return;
            const clone = res.clone();
            clone
              .blob()
              .then((blob) => {
                const objectUrl = URL.createObjectURL(blob);
                remember(objectUrl, blob, true);
                report({
                  url: reqUrl || objectUrl,
                  method: 'fetch',
                  mimeType: ct || 'application/pdf',
                  size: blob.size,
                  interceptorBlobUrl: objectUrl,
                });
              })
              .catch(() => void 0);
          } catch {
            /* nunca romper el fetch original */
          }
        })
        .catch(() => void 0);
      return promise;
    } as typeof fetch;
  }

  /* --------------------------- XMLHttpRequest -------------------------- */
  const XHR = XMLHttpRequest.prototype;
  const originalOpen = XHR.open;
  const originalSend = XHR.send;

  interface TaggedXHR extends XMLHttpRequest {
    __pdfUrl?: string;
    __pdfMethod?: string;
  }

  XHR.open = function open(this: TaggedXHR, method: string, url: string | URL, ...rest: unknown[]) {
    this.__pdfUrl = typeof url === 'string' ? url : url.toString();
    this.__pdfMethod = method;
    // @ts-expect-error passthrough variádico hacia la firma original
    return originalOpen.call(this, method, url, ...rest);
  } as typeof XHR.open;

  XHR.send = function send(this: TaggedXHR, ...sendArgs: unknown[]) {
    const onDone = () => {
      try {
        if (this.status < 200 || this.status >= 300) return;
        const ct = this.getResponseHeader('content-type');
        const url = this.__pdfUrl || '';
        if (!contentTypeIsPdf(ct) && !looksPdf(url)) return;

        const resp: unknown = this.response;
        if (resp instanceof Blob) {
          const objectUrl = URL.createObjectURL(resp);
          remember(objectUrl, resp, true);
          report({ url: url || objectUrl, method: 'xhr', mimeType: ct || 'application/pdf', size: resp.size, interceptorBlobUrl: objectUrl });
        } else if (resp instanceof ArrayBuffer) {
          const blob = new Blob([resp], { type: 'application/pdf' });
          const objectUrl = URL.createObjectURL(blob);
          remember(objectUrl, blob, true);
          report({ url: url || objectUrl, method: 'xhr', mimeType: ct || 'application/pdf', size: blob.size, interceptorBlobUrl: objectUrl });
        } else {
          // No hay binario aprovechable: reporta la URL y deja que se baje luego.
          report({ url, method: 'xhr', mimeType: ct || undefined });
        }
      } catch {
        /* ignore */
      } finally {
        this.removeEventListener('loadend', onDone);
      }
    };
    this.addEventListener('loadend', onDone);
    // @ts-expect-error passthrough variádico hacia la firma original
    return originalSend.apply(this, sendArgs);
  } as typeof XHR.send;

  /* ----------------------- URL.createObjectURL ----------------------- */
  const originalCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function createObjectURL(obj: Blob | MediaSource): string {
    const objectUrl = originalCreate(obj as Blob);
    try {
      if (obj instanceof Blob && /application\/(x-)?pdf/i.test(obj.type)) {
        // La object URL pertenece a la página: la observamos pero NO la revocamos.
        remember(objectUrl, obj, false);
        report({ url: objectUrl, method: 'blob', mimeType: obj.type, size: obj.size, interceptorBlobUrl: objectUrl });
      }
    } catch {
      /* ignore */
    }
    return objectUrl;
  } as typeof URL.createObjectURL;

  /* ------------------------ PDF.js (visor) --------------------------- */
  detectPdfJs(report);

  /* ---------------- Puente: petición de bytes de un blob ------------- */
  window.addEventListener('message', (ev: MessageEvent) => {
    if (ev.source !== window) return;
    const data = ev.data as BridgeRequest | undefined;
    if (!data || data.source !== BRIDGE_SOURCE || data.kind !== 'request-blob-bytes') return;

    const { requestId, blobUrl } = data;
    const respond = (payload: Partial<BridgeMessage>) =>
      window.postMessage({ source: BRIDGE_SOURCE, kind: 'blob-bytes-result', requestId, ...payload } as BridgeMessage, '*');

    const entry = held.get(blobUrl);
    const source = entry?.blob
      ? Promise.resolve(entry.blob)
      : fetch(blobUrl).then((r) => r.blob()); // blob del propio origen

    source
      .then((blob) => blob.arrayBuffer())
      .then((buf) =>
        respond({ base64: arrayBufferToBase64(buf), mimeType: entry?.blob.type || 'application/pdf', size: buf.byteLength }),
      )
      .catch((err) => respond({ error: err instanceof Error ? err.message : String(err) }));
  });
}

function urlFromFetchArgs(args: Parameters<typeof fetch>): string {
  const input = args[0];
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return '';
}

/** Sondea `window.PDFViewerApplication` (PDF.js / visor de Firefox integrado). */
function detectPdfJs(report: (args: { url: string; method: DetectionMethod; mimeType?: string }) => void): void {
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    const app = (window as unknown as { PDFViewerApplication?: { url?: string; _docFilename?: string } }).PDFViewerApplication;
    if (app?.url) {
      report({ url: app.url, method: 'pdfjs', mimeType: 'application/pdf' });
      clearInterval(timer);
    } else if (tries > 20) {
      clearInterval(timer);
    }
  }, 400);
}
