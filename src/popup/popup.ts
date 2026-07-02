import './popup.css';
import type { DetectionMethod, DiagnosticEntry, PdfSource, Settings } from '@/types';
import { getSettings, saveSettings } from '@/services/settings';
import { classifyScheme, looksLikePdfUrl, makeSourceId } from '@/services/detection';
import { sendRuntime } from '@/utils/messaging';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const els = {
  status: $('#statusLine'),
  list: $('#sourcesList') as HTMLUListElement,
  empty: $('#emptyState'),
  emptyTitle: $('#emptyTitle'),
  emptyHint: $('#emptyHint'),
  spinner: $('#spinner'),
  rescan: $('#rescan') as HTMLButtonElement,
  themeToggle: $('#themeToggle'),
  openOptions: $('#openOptions'),
  footerOptions: $('#footerOptions'),
  version: $('#versionLabel'),
  diagPanel: $('#diagPanel'),
  diagToggle: $('#diagToggle'),
  diagBody: $('#diagBody'),
  template: $('#sourceTemplate') as HTMLTemplateElement,
};

const METHOD_LABEL: Record<DetectionMethod, string> = {
  'direct-url': 'URL directa',
  blob: 'Blob',
  data: 'Data URL',
  object: 'Object',
  embed: 'Embed',
  iframe: 'Iframe',
  pdfjs: 'PDF.js',
  'chrome-viewer': 'Visor Chromium',
  fetch: 'Fetch',
  xhr: 'XHR',
  link: 'Enlace',
  dom: 'DOM',
};

let settings: Settings;
let activeTabId: number | undefined;
const rendered = new Map<string, PdfSource>();
let mediaQuery: MediaQueryList | undefined;

/* ------------------------------- Tema -------------------------------- */

function applyTheme(theme: Settings['theme']): void {
  const root = document.documentElement;
  if (theme === 'auto') {
    mediaQuery ??= window.matchMedia('(prefers-color-scheme: dark)');
    root.dataset.theme = mediaQuery.matches ? 'dark' : 'light';
  } else {
    root.dataset.theme = theme;
  }
}

async function cycleTheme(): Promise<void> {
  const order: Settings['theme'][] = ['auto', 'light', 'dark'];
  const next = order[(order.indexOf(settings.theme) + 1) % order.length]!;
  settings = await saveSettings({ theme: next });
  applyTheme(next);
  els.themeToggle.title = `Tema: ${next}`;
}

/* ----------------------------- Utilidades ---------------------------- */

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return 'tamaño desconocido';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/* --------------------------- Recolección ----------------------------- */

/** Fuerza un escaneo en el content script (si existe) e ignora fallos. */
async function triggerContentScan(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'content:collect-sources' });
  } catch {
    /* páginas restringidas (chrome://, store, etc.) no tienen content script */
  }
}

/** Sintetiza una fuente si la propia pestaña ES un PDF (visor nativo / URL .pdf). */
async function maybeAddTabSource(tab: chrome.tabs.Tab): Promise<void> {
  const url = tab.url || '';
  if (!looksLikePdfUrl(url) || classifyScheme(url) !== 'http') return;
  const source: PdfSource = {
    id: makeSourceId('direct-url', url),
    url,
    scheme: 'http',
    method: 'direct-url',
    mimeType: 'application/pdf',
    documentTitle: tab.title,
    frameId: 0,
    detectedAt: Date.now(),
  };
  await sendRuntime({ type: 'bg:register-source', source }).catch(() => void 0);
}

async function refreshSources(): Promise<PdfSource[]> {
  if (activeTabId == null) return [];
  const { sources } = await sendRuntime({ type: 'bg:get-sources', tabId: activeTabId });
  return sources;
}

/* ------------------------------ Render ------------------------------- */

function render(sources: PdfSource[]): void {
  let changed = false;
  for (const s of sources) {
    if (!rendered.has(s.id)) {
      rendered.set(s.id, s);
      els.list.appendChild(buildCard(s));
      changed = true;
    } else {
      // Actualiza metadatos que puedan haber llegado después (tamaño, nombre).
      rendered.set(s.id, { ...rendered.get(s.id)!, ...s });
    }
  }

  const count = rendered.size;
  if (count > 0) {
    els.list.hidden = false;
    els.empty.hidden = true;
    els.status.textContent = `${count} PDF${count > 1 ? 's' : ''} detectado${count > 1 ? 's' : ''}`;
  } else {
    els.status.textContent = 'Sin PDF en esta pestaña';
  }
  if (changed) sortCards();
}

function sortCards(): void {
  const items = [...els.list.children] as HTMLElement[];
  items
    .sort((a, b) => Number(b.dataset.detectedAt) - Number(a.dataset.detectedAt))
    .forEach((el) => els.list.appendChild(el));
}

function buildCard(source: PdfSource): HTMLElement {
  const node = els.template.content.firstElementChild!.cloneNode(true) as HTMLElement;
  node.dataset.id = source.id;
  node.dataset.detectedAt = String(source.detectedAt);

  const badge = node.querySelector<HTMLElement>('[data-role="badge"]')!;
  badge.textContent = METHOD_LABEL[source.method];
  badge.dataset.kind = source.method;

  const meta = node.querySelector<HTMLElement>('[data-role="meta"]')!;
  meta.textContent = formatSize(source.size);

  const name = node.querySelector<HTMLElement>('[data-role="name"]')!;
  const suggested = source.suggestedName || nameGuess(source);
  name.textContent = suggested;
  name.title = suggested;

  const url = node.querySelector<HTMLElement>('[data-role="url"]')!;
  url.textContent = source.url;
  url.title = source.url;

  const dlBtn = node.querySelector<HTMLButtonElement>('[data-action="download"]')!;
  const copyBtn = node.querySelector<HTMLButtonElement>('[data-action="copy"]')!;
  const openBtn = node.querySelector<HTMLButtonElement>('[data-action="open"]')!;
  const result = node.querySelector<HTMLElement>('[data-role="result"]')!;

  dlBtn.addEventListener('click', () => void doDownload(source, dlBtn, result));
  copyBtn.addEventListener('click', () => void doCopy(source, copyBtn));

  if (source.scheme === 'http') {
    openBtn.addEventListener('click', () => void chrome.tabs.create({ url: source.url }));
  } else {
    openBtn.disabled = true;
    openBtn.title = 'Los blob:/data: sólo existen en la página de origen';
  }

  return node;
}

function nameGuess(source: PdfSource): string {
  try {
    if (source.scheme === 'http') {
      const last = new URL(source.url).pathname.split('/').filter(Boolean).pop();
      if (last) return decodeURIComponent(last);
    }
  } catch {
    /* ignore */
  }
  return source.documentTitle || 'documento.pdf';
}

/* ------------------------------ Acciones ----------------------------- */

async function doDownload(source: PdfSource, btn: HTMLButtonElement, result: HTMLElement): Promise<void> {
  btn.classList.add('is-busy');
  result.hidden = true;
  try {
    const res = await sendRuntime({ type: 'bg:download', source, tabId: activeTabId });
    showDiagnostics(res.diagnostics);
    if (res.ok) {
      result.dataset.status = 'ok';
      result.textContent = `Descargado como “${res.filename}”${res.bytes ? ` · ${formatSize(res.bytes)}` : ''}`;
    } else {
      result.dataset.status = 'err';
      result.textContent = res.error || 'No se pudo descargar.';
    }
    result.hidden = false;
  } catch (err) {
    result.dataset.status = 'err';
    result.textContent = err instanceof Error ? err.message : String(err);
    result.hidden = false;
  } finally {
    btn.classList.remove('is-busy');
  }
}

async function doCopy(source: PdfSource, btn: HTMLButtonElement): Promise<void> {
  const original = btn.textContent;
  try {
    await navigator.clipboard.writeText(source.url);
    btn.textContent = 'Copiado ✓';
  } catch {
    btn.textContent = 'Error al copiar';
  }
  setTimeout(() => {
    btn.textContent = original;
  }, 1400);
}

/* ---------------------------- Diagnóstico ---------------------------- */

function showDiagnostics(entries: DiagnosticEntry[]): void {
  if (!entries.length) return;
  els.diagPanel.hidden = false;
  els.diagBody.innerHTML = '';
  for (const e of entries) {
    const row = document.createElement('div');
    row.className = 'diag__row';
    row.dataset.level = e.level;
    const stage = document.createElement('span');
    stage.className = 'diag__stage';
    stage.textContent = e.stage;
    const msg = document.createElement('span');
    msg.textContent = e.message;
    row.append(stage, msg);
    els.diagBody.appendChild(row);
  }
  if (settings.showDiagnostics) openDiag(true);
}

function openDiag(open: boolean): void {
  els.diagToggle.setAttribute('aria-expanded', String(open));
  els.diagBody.hidden = !open;
}

/* ------------------------------ Arranque ----------------------------- */

async function init(): Promise<void> {
  settings = await getSettings();
  applyTheme(settings.theme);
  els.version.textContent = `v${chrome.runtime.getManifest().version}`;

  els.themeToggle.addEventListener('click', () => void cycleTheme());
  const openOptions = () => chrome.runtime.openOptionsPage();
  els.openOptions.addEventListener('click', openOptions);
  els.footerOptions.addEventListener('click', (e) => {
    e.preventDefault();
    openOptions();
  });
  els.diagToggle.addEventListener('click', () =>
    openDiag(els.diagToggle.getAttribute('aria-expanded') !== 'true'),
  );
  els.rescan.addEventListener('click', () => void poll(true));

  const tab = await getActiveTab();
  activeTabId = tab?.id;
  if (!tab || activeTabId == null) {
    showEmpty('Pestaña no disponible', 'No se puede analizar esta pestaña.');
    return;
  }

  await maybeAddTabSource(tab);
  await triggerContentScan(activeTabId);
  await poll(false);
}

/** Sondea el registro varias veces para capturar detecciones tardías. */
async function poll(manual: boolean): Promise<void> {
  const delays = manual ? [0, 400, 1000] : [0, 500, 1200, 2500, 4000];
  for (const d of delays) {
    if (d) await new Promise((r) => setTimeout(r, d));
    const sources = await refreshSources();
    render(sources);
  }
  if (rendered.size === 0) {
    showEmpty(
      'No se detectó ningún PDF',
      'Abre o desplázate por el documento y pulsa “Volver a analizar”. Si está protegido por DRM o no se descarga completo, no es recuperable.',
    );
  }
}

function showEmpty(title: string, hint: string): void {
  els.spinner.style.display = 'none';
  els.emptyTitle.textContent = title;
  els.emptyHint.textContent = hint;
  els.rescan.hidden = false;
  els.empty.hidden = rendered.size > 0;
}

void init();
