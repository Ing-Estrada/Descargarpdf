import type { PdfPayload, PdfSource } from '@/types';
import type { Diagnostics } from '@/utils/logger';
import { arrayBufferToBase64, parseDataUrl } from '@/utils/base64';
import { nameFromContentDisposition, nameFromUrl, sanitizeFilename } from '@/utils/filename';

/** Los primeros bytes de todo PDF válido: "%PDF-". */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];

function looksLikePdfBytes(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_MAGIC.length) return false;
  // Algunos servidores anteponen BOM/espacios; buscamos la firma en los primeros 1024 bytes.
  const limit = Math.min(bytes.length - PDF_MAGIC.length, 1024);
  for (let i = 0; i <= limit; i++) {
    let match = true;
    for (let j = 0; j < PDF_MAGIC.length; j++) {
      if (bytes[i + j] !== PDF_MAGIC[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

/**
 * Convierte una `Response` en un `PdfPayload`.
 * Valida la firma %PDF- para no ofrecer descargas de HTML de error disfrazado.
 */
export async function responseToPayload(
  res: Response,
  fallbackUrl: string,
  diag: Diagnostics,
): Promise<PdfPayload> {
  if (!res.ok) {
    throw new Error(`El servidor respondió ${res.status} ${res.statusText}`);
  }
  const contentType = res.headers.get('content-type') || '';
  const disposition = res.headers.get('content-disposition');
  diag.info('fetch', `Respuesta ${res.status}, content-type: ${contentType || 'desconocido'}`);

  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const mimeIsPdf = /application\/(x-)?pdf/i.test(contentType);
  const magicIsPdf = looksLikePdfBytes(bytes);

  if (!mimeIsPdf && !magicIsPdf) {
    throw new Error(
      'El recurso no parece un PDF (ni el content-type ni la firma %PDF- coinciden). ' +
        'Puede tratarse de una página de error, un login o contenido protegido.',
    );
  }
  if (!magicIsPdf) {
    diag.warn('validate', 'El content-type dice PDF pero falta la firma %PDF-; se descarga igualmente.');
  }

  const nameFromHeader = nameFromContentDisposition(disposition);
  const suggestedName = sanitizeFilename(nameFromHeader || nameFromUrl(fallbackUrl) || 'documento');

  return {
    base64: arrayBufferToBase64(buffer),
    mimeType: mimeIsPdf ? contentType.split(';')[0]!.trim() : 'application/pdf',
    suggestedName,
    size: bytes.byteLength,
  };
}

/**
 * Obtiene los bytes de una URL http(s)/blob usando `fetch` en el contexto actual.
 * - En el service worker / páginas de extensión: sirve para http(s) (los host
 *   permissions evitan CORS).
 * - En el content script: sirve para blob: del propio documento y data:.
 */
export async function fetchUrlToPayload(
  url: string,
  diag: Diagnostics,
  init?: RequestInit,
): Promise<PdfPayload> {
  if (url.startsWith('data:')) {
    return dataUrlToPayload(url, diag);
  }
  diag.info('fetch', `Solicitando ${truncate(url)}`);
  const res = await fetch(url, { credentials: 'include', ...init });
  return responseToPayload(res, url, diag);
}

/** Decodifica una data URL directamente, sin red. */
export function dataUrlToPayload(dataUrl: string, diag: Diagnostics): PdfPayload {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new Error('data URL malformada');
  diag.info('data', `data URL, mime ${parsed.mime}`);
  const size = Math.floor((parsed.base64.length * 3) / 4);
  return {
    base64: parsed.base64,
    mimeType: parsed.mime.includes('pdf') ? 'application/pdf' : parsed.mime,
    suggestedName: sanitizeFilename('documento'),
    size,
  };
}

/**
 * Estrategia de obtención según el esquema de la fuente. Devuelve el payload o
 * lanza un error descriptivo. El llamador decide en qué contexto ejecutarla.
 */
export async function resolveSourceInThisContext(
  source: PdfSource,
  diag: Diagnostics,
): Promise<PdfPayload> {
  switch (source.scheme) {
    case 'data':
      return dataUrlToPayload(source.url, diag);
    case 'blob':
      // El blob: pertenece al origen del documento; sólo el content script
      // (mismo origen) o el interceptor pueden leerlo.
      return fetchUrlToPayload(source.interceptorBlobUrl || source.url, diag);
    case 'http':
      return fetchUrlToPayload(source.url, diag);
    default:
      throw new Error(`Esquema no soportado: ${source.url}`);
  }
}

function truncate(s: string, n = 120): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export { looksLikePdfBytes };
