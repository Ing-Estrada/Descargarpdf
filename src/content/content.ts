/**
 * Content script (mundo AISLADO).
 *
 * Responsabilidades:
 *  1. Escanear el DOM en busca de PDFs incrustados (object/embed/iframe/enlaces).
 *  2. Recibir del interceptor (MAIN world) los PDFs detectados dinámicamente.
 *  3. Registrar todo hallazgo en el service worker (registro por pestaña).
 *  4. Resolver los bytes de un blob:/data: cuando el worker lo pide para descargar.
 */
import {
  BRIDGE_SOURCE,
  type BridgeMessage,
  type BridgeRequest,
  type PdfPayload,
  type PdfSource,
  type RuntimeMessage,
} from '@/types';
import { scanDom, detectSelfAsPdf } from '@/services/detection';
import { dataUrlToPayload } from '@/services/fetcher';
import { Diagnostics } from '@/utils/logger';
import { sendRuntime, uid, waitForBridge } from '@/utils/messaging';
import { nameFromUrl, sanitizeFilename } from '@/utils/filename';
import { arrayBufferToBase64 } from '@/utils/base64';

const seen = new Set<string>();

function register(source: PdfSource): void {
  if (seen.has(source.id)) return;
  seen.add(source.id);
  void sendRuntime({ type: 'bg:register-source', source }).catch(() => void 0);
}

/* --------------------------- Escaneo del DOM --------------------------- */

function runScan(): void {
  try {
    const self = detectSelfAsPdf(document);
    if (self) register(self);
    for (const s of scanDom(document)) register(s);
  } catch {
    /* el escaneo nunca debe tirar la página */
  }
}

function watchDom(): void {
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    // Agrupa ráfagas de mutaciones en un solo escaneo.
    setTimeout(() => {
      scheduled = false;
      runScan();
    }, 300);
  });
  observer.observe(document.documentElement || document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'data', 'type', 'href'],
  });
}

/* ---------------- Puente con el interceptor (MAIN world) --------------- */

window.addEventListener('message', (ev: MessageEvent) => {
  if (ev.source !== window) return;
  const data = ev.data as BridgeMessage | undefined;
  if (!data || data.source !== BRIDGE_SOURCE) return;
  if (data.kind === 'pdf-detected') {
    register(data.source_info);
  }
  // 'blob-bytes-result' lo consume waitForBridge en resolveBlobBytes.
});

/**
 * Pide al interceptor los bytes de un blob que él retiene, o los lee
 * directamente por fetch (el content script comparte el origen del documento).
 */
async function resolveBlobBytes(source: PdfSource, diag: Diagnostics): Promise<PdfPayload> {
  const blobUrl = source.interceptorBlobUrl || source.url;
  const requestId = uid();

  // 1) Vía interceptor (funciona incluso si el blob fue revocado por la página
  //    pero el interceptor mantiene el Blob vivo).
  const request: BridgeRequest = { source: BRIDGE_SOURCE, kind: 'request-blob-bytes', requestId, blobUrl };
  const pending = waitForBridge(
    (d): d is Extract<BridgeMessage, { kind: 'blob-bytes-result' }> =>
      typeof d === 'object' &&
      d !== null &&
      (d as BridgeMessage).source === BRIDGE_SOURCE &&
      (d as BridgeMessage).kind === 'blob-bytes-result' &&
      (d as { requestId?: string }).requestId === requestId,
    6000,
  );
  window.postMessage(request, '*');

  try {
    const result = await pending;
    if (result.base64) {
      diag.info('bridge', `Bytes recibidos del interceptor (${result.size ?? 0} b)`);
      return toPayload(source, result.base64, result.mimeType || 'application/pdf', result.size ?? 0);
    }
    if (result.error) diag.warn('bridge', `Interceptor: ${result.error}`);
  } catch (e) {
    diag.warn('bridge', e instanceof Error ? e.message : String(e));
  }

  // 2) Fallback: fetch directo del blob desde el mismo origen.
  diag.info('blob', 'Leyendo el blob por fetch en el contexto de la página…');
  const res = await fetch(blobUrl);
  if (!res.ok) throw new Error(`No se pudo leer el blob (${res.status}).`);
  const buf = await res.arrayBuffer();
  return toPayload(source, arrayBufferToBase64(buf), res.headers.get('content-type') || 'application/pdf', buf.byteLength);
}

function toPayload(source: PdfSource, base64: string, mimeType: string, size: number): PdfPayload {
  const name = sanitizeFilename(source.suggestedName || nameFromUrl(source.url) || source.documentTitle || 'documento');
  return { base64, mimeType: mimeType.includes('pdf') ? 'application/pdf' : mimeType, suggestedName: name, size };
}

/* ------------------------- Mensajes del worker ------------------------ */

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === 'content:collect-sources') {
    runScan();
    // Devuelve lo que este frame conoce; el registro real vive en el worker.
    sendResponse({ sources: [] });
    return false;
  }

  if (message.type === 'content:resolve-bytes') {
    const diag = new Diagnostics('content', false);
    (async () => {
      try {
        const src = message.source;
        const payload =
          src.scheme === 'data' ? dataUrlToPayload(src.url, diag) : await resolveBlobBytes(src, diag);
        sendResponse({ payload, diagnostics: diag.snapshot() });
      } catch (err) {
        diag.error('resolve', err instanceof Error ? err.message : String(err));
        sendResponse({ error: err instanceof Error ? err.message : String(err), diagnostics: diag.snapshot() });
      }
    })();
    return true; // respuesta asíncrona
  }

  return false;
});

/* ------------------------------ Arranque ------------------------------ */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    runScan();
    watchDom();
  });
} else {
  runScan();
  watchDom();
}
// Reintento tardío para SPAs que montan el visor después de cargar.
setTimeout(runScan, 1500);
