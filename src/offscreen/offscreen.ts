/**
 * Documento offscreen: crea y revoca object URLs a partir de bytes de PDF.
 *
 * El service worker no puede usar `URL.createObjectURL`; este documento oculto
 * sí. Recibe base64, materializa un Blob y devuelve una object URL que el
 * worker pasa a `chrome.downloads.download`.
 */
import { base64ToUint8Array } from '@/utils/base64';

interface CreateMsg {
  target: 'offscreen';
  type: 'offscreen:create-object-url';
  base64: string;
  mimeType: string;
}
interface RevokeMsg {
  target: 'offscreen';
  type: 'offscreen:revoke';
  objectUrl: string;
}
type OffscreenMsg = CreateMsg | RevokeMsg;

chrome.runtime.onMessage.addListener((message: OffscreenMsg, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return false;

  if (message.type === 'offscreen:create-object-url') {
    try {
      const bytes = base64ToUint8Array(message.base64);
      const blob = new Blob([bytes as unknown as BlobPart], {
        type: message.mimeType || 'application/pdf',
      });
      const objectUrl = URL.createObjectURL(blob);
      sendResponse({ objectUrl });
    } catch (err) {
      sendResponse({ error: err instanceof Error ? err.message : String(err) });
    }
    return false;
  }

  if (message.type === 'offscreen:revoke') {
    try {
      URL.revokeObjectURL(message.objectUrl);
    } catch {
      /* ignore */
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
