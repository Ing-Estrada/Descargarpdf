import type { PdfSource } from '@/types';

/**
 * Registro en memoria de PDFs detectados por pestaña. Vive en el service
 * worker; si éste se reinicia se vuelve a poblar cuando el content script
 * reenvía sus detecciones al abrir el popup.
 */
class SourceRegistry {
  private byTab = new Map<number, Map<string, PdfSource>>();

  add(tabId: number, source: PdfSource): void {
    if (tabId < 0) return;
    let map = this.byTab.get(tabId);
    if (!map) {
      map = new Map();
      this.byTab.set(tabId, map);
    }
    // Conserva el registro más informativo si llega un duplicado.
    const existing = map.get(source.id);
    map.set(source.id, mergeSources(existing, source));
  }

  addMany(tabId: number, sources: PdfSource[]): void {
    for (const s of sources) this.add(tabId, s);
  }

  get(tabId: number): PdfSource[] {
    const map = this.byTab.get(tabId);
    if (!map) return [];
    return [...map.values()].sort((a, b) => b.detectedAt - a.detectedAt);
  }

  clearTab(tabId: number): void {
    this.byTab.delete(tabId);
  }

  /** Limpia sólo las detecciones de un frame (útil al recargar el top frame). */
  clearForNavigation(tabId: number, frameId: number): void {
    if (frameId !== 0) return; // sólo la navegación del top frame vacía la pestaña
    this.byTab.delete(tabId);
  }
}

function mergeSources(a: PdfSource | undefined, b: PdfSource): PdfSource {
  if (!a) return b;
  return {
    ...a,
    ...b,
    mimeType: b.mimeType ?? a.mimeType,
    size: b.size ?? a.size,
    suggestedName: b.suggestedName ?? a.suggestedName,
    documentTitle: b.documentTitle ?? a.documentTitle,
    interceptorBlobUrl: b.interceptorBlobUrl ?? a.interceptorBlobUrl,
    detectedAt: Math.max(a.detectedAt, b.detectedAt),
  };
}

export const registry = new SourceRegistry();
