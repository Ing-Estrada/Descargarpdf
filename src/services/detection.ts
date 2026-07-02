import type { DetectionMethod, PdfSource, SourceScheme } from '@/types';

/** Hash corto y determinista (djb2) para generar ids estables. */
function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

export function makeSourceId(method: DetectionMethod, url: string): string {
  return `${method}:${hash(url)}`;
}

export function classifyScheme(url: string): SourceScheme {
  if (url.startsWith('blob:')) return 'blob';
  if (url.startsWith('data:')) return 'data';
  if (/^https?:/i.test(url)) return 'http';
  return 'unknown';
}

/** ¿La URL aparenta apuntar a un PDF? (heurística por extensión / mime en query). */
export function looksLikePdfUrl(url: string): boolean {
  if (!url) return false;
  if (/^data:application\/pdf/i.test(url)) return true;
  if (url.startsWith('blob:')) return true; // se confirma al obtener los bytes
  try {
    const u = new URL(url, location.href);
    if (/\.pdf$/i.test(u.pathname)) return true;
    // Algunos endpoints exponen ?format=pdf, ?type=application/pdf, etc.
    const q = u.search.toLowerCase();
    if (/[?&](format|type|mime|content-?type)=[^&]*pdf/.test(q)) return true;
    return false;
  } catch {
    return /\.pdf(\?|#|$)/i.test(url);
  }
}

function typeIsPdf(el: Element): boolean {
  const t = (el.getAttribute('type') || '').toLowerCase();
  return t === 'application/pdf' || t === 'application/x-pdf';
}

/**
 * Detecta el visor PDF.js / Mozilla PDF Viewer a partir de marcadores del DOM.
 * (La confirmación por `window.PDFViewerApplication` la hace el interceptor.)
 */
export function detectPdfJsViewer(doc: Document): PdfSource | null {
  const marker = doc.querySelector(
    '.pdfViewer, #viewer.pdfViewer, #viewerContainer, #outerContainer #viewer',
  );
  if (!marker) return null;
  // Intenta localizar la URL real del documento.
  const meta = doc.querySelector('meta[name="pdfjs:documentUrl"]')?.getAttribute('content');
  const url = meta || doc.querySelector<HTMLAnchorElement>('#download, a[download]')?.href || location.href;
  return base({
    url,
    method: 'pdfjs',
    documentTitle: doc.title,
  });
}

interface BaseArgs {
  url: string;
  method: DetectionMethod;
  mimeType?: string;
  documentTitle?: string;
}

function base(args: BaseArgs): PdfSource {
  const abs = toAbsolute(args.url);
  return {
    id: makeSourceId(args.method, abs),
    url: abs,
    scheme: classifyScheme(abs),
    method: args.method,
    mimeType: args.mimeType,
    documentTitle: args.documentTitle,
    detectedAt: Date.now(),
  };
}

function toAbsolute(url: string): string {
  if (/^(blob:|data:|https?:)/i.test(url)) return url;
  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
}

/**
 * Escanea un documento en busca de PDFs incrustados o enlazados.
 * Cubre object / embed / iframe / <a> hacia .pdf.
 */
export function scanDom(doc: Document): PdfSource[] {
  const found = new Map<string, PdfSource>();
  const add = (s: PdfSource | null) => {
    if (s && s.url && !found.has(s.id)) found.set(s.id, s);
  };

  // <embed type="application/pdf" src="...">
  doc.querySelectorAll<HTMLEmbedElement>('embed').forEach((el) => {
    const src = el.getAttribute('src') || '';
    if (typeIsPdf(el) || looksLikePdfUrl(src)) {
      add(base({ url: src || location.href, method: 'embed', mimeType: 'application/pdf', documentTitle: doc.title }));
    }
  });

  // <object type="application/pdf" data="...">
  doc.querySelectorAll<HTMLObjectElement>('object').forEach((el) => {
    const src = el.getAttribute('data') || '';
    if (typeIsPdf(el) || looksLikePdfUrl(src)) {
      add(base({ url: src || location.href, method: 'object', mimeType: 'application/pdf', documentTitle: doc.title }));
    }
  });

  // <iframe src="...pdf">
  doc.querySelectorAll<HTMLIFrameElement>('iframe').forEach((el) => {
    const src = el.getAttribute('src') || '';
    if (looksLikePdfUrl(src)) {
      add(base({ url: src, method: 'iframe', documentTitle: doc.title }));
    }
  });

  // <a href="...pdf"> (enlaces directos)
  doc.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((el) => {
    const href = el.getAttribute('href') || '';
    if (looksLikePdfUrl(href)) {
      add(base({ url: href, method: 'link', documentTitle: doc.title }));
    }
  });

  // Visor PDF.js embebido en este documento
  add(detectPdfJsViewer(doc));

  return [...found.values()];
}

/**
 * Determina si el propio documento ES un PDF (visor nativo de Chromium).
 * En ese caso el content script corre sobre una página cuyo contentType es
 * application/pdf, o cuya URL apunta directamente a un .pdf.
 */
export function detectSelfAsPdf(doc: Document): PdfSource | null {
  const ct = (doc.contentType || '').toLowerCase();
  const isPdfDoc = ct === 'application/pdf' || ct === 'application/x-pdf';
  if (isPdfDoc || (looksLikePdfUrl(location.href) && classifyScheme(location.href) !== 'unknown')) {
    return base({
      url: location.href,
      method: isPdfDoc ? 'chrome-viewer' : 'direct-url',
      mimeType: 'application/pdf',
      documentTitle: doc.title || undefined,
    });
  }
  return null;
}
