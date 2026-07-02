/**
 * Conversión ArrayBuffer <-> base64 apta para transporte por chrome.runtime
 * (que serializa mensajes y no admite binarios de forma fiable entre contextos).
 *
 * Se procesa por bloques para no reventar la pila con `String.fromCharCode(...arr)`
 * en PDFs grandes.
 */

const CHUNK = 0x8000; // 32 KiB por bloque

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Extrae `{ mime, base64 }` de una data URL (`data:mime;base64,....`). */
export function parseDataUrl(dataUrl: string): { mime: string; base64: string } | null {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const mime = match[1] || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const data = match[3] ?? '';
  const base64 = isBase64 ? data : btoa(decodeURIComponent(data));
  return { mime, base64 };
}
