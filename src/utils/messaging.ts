import type { ResponseFor, RuntimeMessage } from '@/types';

/**
 * Envía un mensaje runtime tipado y resuelve con la respuesta correcta.
 * Envuelve la API basada en callbacks y normaliza `chrome.runtime.lastError`.
 */
export function sendRuntime<T extends RuntimeMessage>(message: T): Promise<ResponseFor<T>> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(response as ResponseFor<T>);
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** Igual que `sendRuntime` pero dirigido a un content script de una pestaña. */
export function sendToTab<T extends RuntimeMessage>(
  tabId: number,
  message: T,
  frameId?: number,
): Promise<ResponseFor<T>> {
  return new Promise((resolve, reject) => {
    try {
      const options = frameId != null ? { frameId } : undefined;
      chrome.tabs.sendMessage(tabId, message, options as chrome.tabs.MessageSendOptions, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(response as ResponseFor<T>);
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** Espera una respuesta a un mensaje puente (postMessage) con el `requestId` dado. */
export function waitForBridge<T>(
  predicate: (data: unknown) => data is T,
  timeoutMs = 8000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('Tiempo de espera agotado esperando respuesta del interceptor'));
    }, timeoutMs);

    function onMessage(ev: MessageEvent) {
      if (ev.source !== window) return;
      if (predicate(ev.data)) {
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(ev.data);
      }
    }

    window.addEventListener('message', onMessage);
  });
}

/** Genera un id corto y único (suficiente para correlacionar mensajes). */
export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
