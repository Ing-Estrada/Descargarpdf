/**
 * Tipos compartidos por todos los contextos de la extensión
 * (service worker, content script, interceptor, popup, options, offscreen).
 *
 * Este archivo es la ÚNICA fuente de verdad del protocolo de mensajes.
 */

/** Cómo se descubrió / de dónde proviene un PDF. */
export type DetectionMethod =
  | 'direct-url' // La pestaña ES el PDF (visor nativo / URL .pdf)
  | 'blob' // blob: URL
  | 'data' // data:application/pdf;base64,...
  | 'object' // <object type="application/pdf">
  | 'embed' // <embed type="application/pdf">
  | 'iframe' // <iframe src="...pdf">
  | 'pdfjs' // Visor PDF.js / Mozilla PDF Viewer
  | 'chrome-viewer' // Visor PDF nativo de Chromium
  | 'fetch' // Interceptado desde window.fetch
  | 'xhr' // Interceptado desde XMLHttpRequest
  | 'link' // Enlace <a href="...pdf">
  | 'dom'; // Heurística genérica del DOM

/** Contexto en el que reside el recurso, útil para decidir cómo obtener los bytes. */
export type SourceScheme = 'http' | 'blob' | 'data' | 'unknown';

/** Un candidato de PDF detectado. `id` es estable dentro de una pestaña. */
export interface PdfSource {
  id: string;
  url: string;
  scheme: SourceScheme;
  method: DetectionMethod;
  /** MIME reportado (si se conoce). */
  mimeType?: string;
  /** Tamaño en bytes (si se conoce). */
  size?: number;
  /** Nombre sugerido derivado de URL / Content-Disposition. */
  suggestedName?: string;
  /** Título del frame/documento donde se detectó. */
  documentTitle?: string;
  /** ID del frame de Chrome donde vive el recurso (0 = top). */
  frameId?: number;
  /** Marca temporal (epoch ms) de detección. */
  detectedAt: number;
  /**
   * Sólo para interceptados: el interceptor MAIN-world mantiene vivo un
   * Blob y expone su object URL para poder recuperar los bytes después.
   */
  interceptorBlobUrl?: string;
}

/** Bytes de un PDF codificados para transporte por mensajería (base64 sin cabecera). */
export interface PdfPayload {
  base64: string;
  mimeType: string;
  suggestedName: string;
  size: number;
}

/** Resultado de un intento de descarga, con datos de diagnóstico. */
export interface DownloadResult {
  ok: boolean;
  downloadId?: number;
  filename?: string;
  bytes?: number;
  error?: string;
  /** Traza de diagnóstico legible para el panel. */
  diagnostics: DiagnosticEntry[];
}

export interface DiagnosticEntry {
  ts: number;
  level: 'info' | 'warn' | 'error';
  stage: string;
  message: string;
}

/** Preferencias persistidas en chrome.storage.sync. */
export interface Settings {
  theme: 'auto' | 'light' | 'dark';
  /**
   * Patrón para el nombre por defecto. Tokens soportados:
   * {title} {host} {date} {time} {name}
   */
  filenamePattern: string;
  /** Pregunta la ruta de guardado (saveAs) al descargar. */
  askWhereToSave: boolean;
  /** Mantener vivos los blobs interceptados (usa algo de memoria). */
  keepInterceptedBlobs: boolean;
  /** Mostrar el panel de diagnóstico expandido por defecto. */
  showDiagnostics: boolean;
  /** Registrar trazas detalladas en consola. */
  verboseLogging: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  filenamePattern: '{name}',
  askWhereToSave: false,
  keepInterceptedBlobs: true,
  showDiagnostics: false,
  verboseLogging: false,
};

/* -------------------------------------------------------------------------- */
/*                              Protocolo de mensajes                          */
/* -------------------------------------------------------------------------- */

/** Origen usado en window.postMessage entre interceptor (MAIN) y content (ISOLATED). */
export const BRIDGE_SOURCE = 'pdf-grabber@bridge' as const;

/** Mensajes MAIN-world → ISOLATED-world vía window.postMessage. */
export type BridgeMessage =
  | { source: typeof BRIDGE_SOURCE; kind: 'pdf-detected'; source_info: PdfSource }
  | { source: typeof BRIDGE_SOURCE; kind: 'blob-bytes-result'; requestId: string; base64?: string; mimeType?: string; size?: number; error?: string };

/** Peticiones ISOLATED-world → MAIN-world vía window.postMessage. */
export type BridgeRequest =
  | { source: typeof BRIDGE_SOURCE; kind: 'request-blob-bytes'; requestId: string; blobUrl: string };

/**
 * Mensajes runtime (chrome.runtime.sendMessage) entre popup/background/content.
 * Cada uno declara su forma de respuesta en el mapa `RuntimeResponses`.
 */
export type RuntimeMessage =
  | { type: 'content:collect-sources' }
  | { type: 'content:resolve-bytes'; source: PdfSource }
  | { type: 'bg:get-sources'; tabId?: number }
  | { type: 'bg:download'; source: PdfSource; tabId?: number }
  | { type: 'bg:register-source'; source: PdfSource }
  | { type: 'bg:ping' };

export interface RuntimeResponses {
  'content:collect-sources': { sources: PdfSource[] };
  'content:resolve-bytes': { payload?: PdfPayload; error?: string; diagnostics: DiagnosticEntry[] };
  'bg:get-sources': { sources: PdfSource[] };
  'bg:download': DownloadResult;
  'bg:register-source': { ok: boolean };
  'bg:ping': { ok: boolean; version: string };
}

export type ResponseFor<T extends RuntimeMessage> = T['type'] extends keyof RuntimeResponses
  ? RuntimeResponses[T['type']]
  : never;
