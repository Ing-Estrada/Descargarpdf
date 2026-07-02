import type { DiagnosticEntry } from '@/types';

/**
 * Logger ligero con dos responsabilidades:
 *  - Escribir en consola sólo cuando `verbose` está activo.
 *  - Acumular entradas de diagnóstico para el panel del popup.
 */
export class Diagnostics {
  private entries: DiagnosticEntry[] = [];
  private verbose: boolean;
  private readonly prefix: string;

  constructor(prefix: string, verbose = false) {
    this.prefix = `[PDFGrabber:${prefix}]`;
    this.verbose = verbose;
  }

  setVerbose(v: boolean): void {
    this.verbose = v;
  }

  private push(level: DiagnosticEntry['level'], stage: string, message: string): void {
    const entry: DiagnosticEntry = { ts: Date.now(), level, stage, message };
    this.entries.push(entry);
    if (this.verbose || level === 'error') {
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.debug;
      fn(`${this.prefix} [${stage}] ${message}`);
    }
  }

  info(stage: string, message: string): void {
    this.push('info', stage, message);
  }

  warn(stage: string, message: string): void {
    this.push('warn', stage, message);
  }

  error(stage: string, message: string): void {
    this.push('error', stage, message);
  }

  /** Copia inmutable de las entradas acumuladas. */
  snapshot(): DiagnosticEntry[] {
    return this.entries.slice();
  }

  clear(): void {
    this.entries = [];
  }
}
