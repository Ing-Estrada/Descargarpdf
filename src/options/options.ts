import './options.css';
import { DEFAULT_SETTINGS, type PdfSource, type Settings } from '@/types';
import { getSettings, saveSettings } from '@/services/settings';
import { buildFilename } from '@/utils/filename';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const theme = $('#theme') as HTMLSelectElement;
const pattern = $('#pattern') as HTMLInputElement;
const patternPreview = $('#patternPreview');
const askWhere = $('#askWhere') as HTMLInputElement;
const keepBlobs = $('#keepBlobs') as HTMLInputElement;
const showDiag = $('#showDiag') as HTMLInputElement;
const verbose = $('#verbose') as HTMLInputElement;
const reset = $('#reset') as HTMLButtonElement;
const savedNote = $('#savedNote');
const ver = $('#ver');

/** Fuente ficticia para previsualizar el patrón de nombre. */
const SAMPLE: PdfSource = {
  id: 'sample',
  url: 'https://ejemplo.com/documentos/informe-anual.pdf',
  scheme: 'http',
  method: 'direct-url',
  suggestedName: 'informe-anual.pdf',
  documentTitle: 'Informe anual',
  detectedAt: Date.now(),
};

function applyTheme(value: Settings['theme']): void {
  const root = document.documentElement;
  if (value === 'auto') {
    root.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } else {
    root.dataset.theme = value;
  }
}

function currentFromForm(): Settings {
  return {
    theme: theme.value as Settings['theme'],
    filenamePattern: pattern.value.trim() || '{name}',
    askWhereToSave: askWhere.checked,
    keepInterceptedBlobs: keepBlobs.checked,
    showDiagnostics: showDiag.checked,
    verboseLogging: verbose.checked,
  };
}

function updatePreview(): void {
  patternPreview.textContent = buildFilename(SAMPLE, currentFromForm());
}

let saveTimer: number | undefined;
function persist(): void {
  const next = currentFromForm();
  applyTheme(next.theme);
  updatePreview();
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    await saveSettings(next);
    savedNote.hidden = false;
    window.setTimeout(() => {
      savedNote.hidden = true;
    }, 1400);
  }, 250);
}

function fillForm(s: Settings): void {
  theme.value = s.theme;
  pattern.value = s.filenamePattern;
  askWhere.checked = s.askWhereToSave;
  keepBlobs.checked = s.keepInterceptedBlobs;
  showDiag.checked = s.showDiagnostics;
  verbose.checked = s.verboseLogging;
  applyTheme(s.theme);
  updatePreview();
}

async function init(): Promise<void> {
  ver.textContent = `v${chrome.runtime.getManifest().version}`;
  fillForm(await getSettings());

  for (const el of [theme, pattern, askWhere, keepBlobs, showDiag, verbose]) {
    el.addEventListener('change', persist);
  }
  pattern.addEventListener('input', () => {
    updatePreview();
    persist();
  });

  reset.addEventListener('click', async () => {
    await saveSettings(DEFAULT_SETTINGS);
    fillForm(DEFAULT_SETTINGS);
    savedNote.hidden = false;
    window.setTimeout(() => {
      savedNote.hidden = true;
    }, 1400);
  });
}

void init();
