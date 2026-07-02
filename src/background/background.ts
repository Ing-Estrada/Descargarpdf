/**
 * Service worker (Manifest V3).
 *
 * Centraliza:
 *  - El registro de PDFs detectados por pestaña.
 *  - El menú contextual "Descargar PDF".
 *  - La orquestación de descargas (delegando en fetcher/offscreen).
 *  - La insignia (badge) del icono con el número de PDFs detectados.
 */
import type { PdfSource, RuntimeMessage } from '@/types';
import { registry } from '@/services/registry';
import { downloadSource } from '@/services/downloader';
import { getSettings } from '@/services/settings';
import { classifyScheme, looksLikePdfUrl, makeSourceId } from '@/services/detection';

const MENU_ID = 'pdf-grabber-download';
const VERSION = chrome.runtime.getManifest().version;

/* ------------------------------ Insignia ------------------------------ */

function updateBadge(tabId: number): void {
  const count = registry.get(tabId).length;
  const text = count > 0 ? String(Math.min(count, 99)) : '';
  chrome.action.setBadgeText({ tabId, text }).catch(() => void 0);
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#e4572e' }).catch(() => void 0);
}

/* --------------------------- Menú contextual --------------------------- */

function createMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Descargar PDF',
      contexts: ['page', 'frame', 'link', 'image'],
    });
  });
}

chrome.runtime.onInstalled.addListener(createMenus);
chrome.runtime.onStartup.addListener(createMenus);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  const source = resolveContextSource(info, tab.id);
  if (!source) {
    notify('No se encontró ningún PDF en este elemento.');
    return;
  }
  const settings = await getSettings();
  const result = await downloadSource(source, tab.id, settings);
  if (!result.ok) notify(result.error || 'La descarga falló.');
});

/**
 * Deduce la mejor fuente a partir del clic derecho:
 * enlace .pdf → frame .pdf → única fuente registrada → URL de la página.
 */
function resolveContextSource(info: chrome.contextMenus.OnClickData, tabId: number): PdfSource | null {
  const now = Date.now();
  const frameId = info.frameId ?? 0;

  if (info.linkUrl && looksLikePdfUrl(info.linkUrl)) {
    return mk(info.linkUrl, 'link', frameId, now);
  }
  if (info.srcUrl && looksLikePdfUrl(info.srcUrl)) {
    return mk(info.srcUrl, 'embed', frameId, now);
  }
  if (info.frameUrl && looksLikePdfUrl(info.frameUrl)) {
    return mk(info.frameUrl, 'iframe', frameId, now);
  }

  const known = registry.get(tabId);
  if (known.length === 1) return known[0]!;
  // Coincidencia por frame si hay varias.
  const byFrame = known.find((s) => s.frameId === frameId);
  if (byFrame) return byFrame;

  if (info.pageUrl && looksLikePdfUrl(info.pageUrl)) {
    return mk(info.pageUrl, 'direct-url', 0, now);
  }
  return known[0] ?? null;
}

function mk(url: string, method: PdfSource['method'], frameId: number, at: number): PdfSource {
  return {
    id: makeSourceId(method, url),
    url,
    scheme: classifyScheme(url),
    method,
    frameId,
    detectedAt: at,
  };
}

/* ----------------------------- Mensajería ----------------------------- */

chrome.runtime.onMessage.addListener((message: RuntimeMessage & { target?: string }, sender, sendResponse) => {
  // Los mensajes dirigidos al documento offscreen no son para el worker.
  if (message?.target === 'offscreen') return false;

  switch (message.type) {
    case 'bg:ping': {
      sendResponse({ ok: true, version: VERSION });
      return false;
    }

    case 'bg:register-source': {
      const tabId = sender.tab?.id;
      if (tabId != null) {
        const stamped: PdfSource = { ...message.source, frameId: sender.frameId ?? message.source.frameId ?? 0 };
        registry.add(tabId, stamped);
        updateBadge(tabId);
      }
      sendResponse({ ok: true });
      return false;
    }

    case 'bg:get-sources': {
      const tabId = message.tabId;
      sendResponse({ sources: tabId != null ? registry.get(tabId) : [] });
      return false;
    }

    case 'bg:download': {
      (async () => {
        const settings = await getSettings();
        const result = await downloadSource(message.source, message.tabId, settings);
        sendResponse(result);
      })();
      return true; // respuesta asíncrona
    }

    default:
      return false;
  }
});

/* ------------------------- Ciclo de vida pestañas ---------------------- */

chrome.tabs.onRemoved.addListener((tabId) => registry.clearTab(tabId));

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Al navegar el top frame a otra URL, limpia las detecciones previas.
  if (changeInfo.url || changeInfo.status === 'loading') {
    registry.clearForNavigation(tabId, 0);
    updateBadge(tabId);
  }
});

/* ------------------------------ Utilidades ---------------------------- */

function notify(message: string): void {
  // Sin permiso "notifications": se registra y se refleja vía badge de error.
  console.warn(`[PDFGrabber] ${message}`);
  chrome.action.setBadgeText({ text: '!' }).catch(() => void 0);
  chrome.action.setBadgeBackgroundColor({ color: '#b00020' }).catch(() => void 0);
}
