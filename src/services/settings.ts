import { DEFAULT_SETTINGS, type Settings } from '@/types';

const KEY = 'settings';

/** Lee las preferencias, rellenando cualquier campo ausente con el valor por defecto. */
export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(KEY);
  const partial = (stored?.[KEY] ?? {}) as Partial<Settings>;
  return { ...DEFAULT_SETTINGS, ...partial };
}

/** Persiste un subconjunto de preferencias y devuelve el estado completo resultante. */
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = { ...current, ...patch };
  await chrome.storage.sync.set({ [KEY]: next });
  return next;
}

/** Suscribe a cambios en las preferencias. Devuelve función para desuscribir. */
export function onSettingsChanged(cb: (settings: Settings) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === 'sync' && changes[KEY]) {
      cb({ ...DEFAULT_SETTINGS, ...(changes[KEY].newValue as Partial<Settings>) });
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
