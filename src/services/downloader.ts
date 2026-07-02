import type { DownloadResult, PdfPayload, PdfSource, Settings } from '@/types';
import { Diagnostics } from '@/utils/logger';
import { buildFilename } from '@/utils/filename';
import { fetchUrlToPayload, responseToPayload } from '@/services/fetcher';
import { sendToTab } from '@/utils/messaging';

/** Por encima de este tamaño evitamos cargar el PDF en memoria y delegamos en el gestor de descargas. */
const DIRECT_DOWNLOAD_THRESHOLD = 64 * 1024 * 1024; // 64 MiB
const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';

let offscreenCreating: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  // API moderna (Chrome 116+)
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
    });
    if (contexts.length > 0) return;
  } else if (await chrome.offscreen.hasDocument?.()) {
    return;
  }

  if (offscreenCreating) {
    await offscreenCreating;
    return;
  }
  offscreenCreating = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: [chrome.offscreen.Reason.BLOBS],
      justification: 'Convertir bytes de PDF en object URLs descargables localmente.',
    })
    .catch((err: unknown) => {
      // Otra llamada concurrente pudo crearlo primero.
      if (!String(err).includes('Only a single offscreen')) throw err;
    })
    .finally(() => {
      offscreenCreating = null;
    });
  await offscreenCreating;
}

/** Pide al documento offscreen que cree un object URL a partir de los bytes. */
async function createObjectUrlInOffscreen(payload: PdfPayload): Promise<string> {
  await ensureOffscreen();
  const response = (await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'offscreen:create-object-url',
    base64: payload.base64,
    mimeType: payload.mimeType,
  })) as { objectUrl?: string; error?: string };
  if (!response?.objectUrl) {
    throw new Error(response?.error || 'El documento offscreen no devolvió un object URL');
  }
  return response.objectUrl;
}

function revokeObjectUrlInOffscreen(objectUrl: string): void {
  chrome.runtime
    .sendMessage({ target: 'offscreen', type: 'offscreen:revoke', objectUrl })
    .catch(() => void 0);
}

/** Lanza chrome.downloads.download y resuelve con el downloadId. */
function startDownload(options: chrome.downloads.DownloadOptions): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(options, (downloadId) => {
      const err = chrome.runtime.lastError;
      if (err || downloadId == null) {
        reject(new Error(err?.message || 'chrome.downloads.download no devolvió id'));
        return;
      }
      resolve(downloadId);
    });
  });
}

/** Espera a que la descarga termine (o falle) para poder revocar el object URL. */
function whenDownloadSettles(downloadId: number, onSettled: () => void): void {
  const listener = (delta: chrome.downloads.DownloadDelta) => {
    if (delta.id !== downloadId) return;
    if (delta.state?.current === 'complete' || delta.state?.current === 'interrupted') {
      chrome.downloads.onChanged.removeListener(listener);
      onSettled();
    }
  };
  chrome.downloads.onChanged.addListener(listener);
  // Red de seguridad: revoca a los 5 min aunque no lleguen eventos.
  setTimeout(() => {
    chrome.downloads.onChanged.removeListener(listener);
    onSettled();
  }, 5 * 60 * 1000);
}

/** Descarga a partir de bytes ya en memoria, vía documento offscreen. */
async function downloadFromBytes(
  payload: PdfPayload,
  filename: string,
  saveAs: boolean,
  diag: Diagnostics,
): Promise<DownloadResult> {
  diag.info('offscreen', `Creando object URL (${payload.size} bytes)`);
  const objectUrl = await createObjectUrlInOffscreen(payload);
  try {
    const downloadId = await startDownload({
      url: objectUrl,
      filename,
      saveAs,
      conflictAction: 'uniquify',
    });
    diag.info('download', `Descarga iniciada (#${downloadId}) como "${filename}"`);
    whenDownloadSettles(downloadId, () => revokeObjectUrlInOffscreen(objectUrl));
    return { ok: true, downloadId, filename, bytes: payload.size, diagnostics: diag.snapshot() };
  } catch (err) {
    revokeObjectUrlInOffscreen(objectUrl);
    throw err;
  }
}

/** Descarga directa delegando en el navegador (usa la sesión/cookies del usuario). */
async function downloadDirect(
  url: string,
  filename: string,
  saveAs: boolean,
  diag: Diagnostics,
): Promise<DownloadResult> {
  diag.info('download', `Descarga directa vía gestor del navegador: ${filename}`);
  const downloadId = await startDownload({ url, filename, saveAs, conflictAction: 'uniquify' });
  return { ok: true, downloadId, filename, diagnostics: diag.snapshot() };
}

/**
 * Orquesta la descarga de una fuente según su esquema:
 *  - data:  → decodifica en el worker → offscreen.
 *  - blob:  → pide los bytes al content script (mismo origen) → offscreen.
 *  - http:  → intenta fetch+validación en el worker → offscreen;
 *             si es muy grande o falla, cae a descarga directa.
 */
export async function downloadSource(
  source: PdfSource,
  tabId: number | undefined,
  settings: Settings,
): Promise<DownloadResult> {
  const diag = new Diagnostics('downloader', settings.verboseLogging);
  diag.info('start', `Fuente ${source.method} (${source.scheme}) → ${source.url.slice(0, 140)}`);

  try {
    // --- blob: sólo el content script del origen puede leerlo ---
    if (source.scheme === 'blob') {
      if (tabId == null) throw new Error('No hay pestaña asociada para resolver el blob.');
      diag.info('blob', 'Solicitando bytes al content script del documento…');
      const res = await sendToTab(tabId, { type: 'content:resolve-bytes', source }, source.frameId);
      for (const e of res.diagnostics) diag[e.level](e.stage, e.message);
      if (!res.payload) {
        throw new Error(res.error || 'El content script no pudo leer el blob.');
      }
      const filename = finalName(source, res.payload, settings);
      return await downloadFromBytes(res.payload, filename, settings.askWhereToSave, diag);
    }

    // --- data: se decodifica sin red ---
    if (source.scheme === 'data') {
      const payload = await fetchUrlToPayload(source.url, diag); // maneja data: internamente
      const filename = finalName(source, payload, settings);
      return await downloadFromBytes(payload, filename, settings.askWhereToSave, diag);
    }

    // --- http(s) ---
    diag.info('http', 'Comprobando cabeceras…');
    const res = await fetch(source.url, { credentials: 'include' });
    if (!res.ok) throw new Error(`El servidor respondió ${res.status} ${res.statusText}`);

    const length = Number(res.headers.get('content-length') || 0);
    if (length > DIRECT_DOWNLOAD_THRESHOLD) {
      // Demasiado grande para pasar por memoria; deja que el navegador lo baje.
      await res.body?.cancel();
      diag.warn('http', `Archivo grande (${length} bytes): se usa descarga directa.`);
      const filename = finalName(source, undefined, settings);
      return await downloadDirect(source.url, filename, settings.askWhereToSave, diag);
    }

    // Reutiliza la misma respuesta para validar firma y extraer nombre.
    const payload = await responseToPayload(res, source.url, diag);
    const filename = finalName(source, payload, settings);
    return await downloadFromBytes(payload, filename, settings.askWhereToSave, diag);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    diag.error('download', message);
    return { ok: false, error: message, diagnostics: diag.snapshot() };
  }
}

function finalName(source: PdfSource, payload: PdfPayload | undefined, settings: Settings): string {
  const enriched: PdfSource = payload
    ? { ...source, suggestedName: payload.suggestedName ?? source.suggestedName }
    : source;
  return buildFilename(enriched, settings);
}
