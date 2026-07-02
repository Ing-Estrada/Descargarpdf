/**
 * Modo desarrollo: compila los tres pases en modo --watch y mantiene los
 * recursos estáticos sincronizados en dist/. Recarga la extensión en el
 * navegador manualmente (o con una utilidad de auto-reload) tras cada cambio.
 */
import { spawn } from 'node:child_process';
import { cp, copyFile, mkdir, rm } from 'node:fs/promises';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const p = (rel) => fileURLToPath(new URL(rel, root));
const viteBin = p('node_modules/vite/bin/vite.js');

async function copyStatic() {
  await mkdir(p('dist'), { recursive: true });
  await copyFile(p('manifest.json'), p('dist/manifest.json'));
  await cp(p('icons'), p('dist/icons'), { recursive: true });
}

await rm(p('dist'), { recursive: true, force: true });
await copyStatic();

const env = { ...process.env, PDFGRABBER_WATCH: '1' };
const passes = [
  ['build', '--watch'],
  ['build', '--watch', '--mode', 'content'],
  ['build', '--watch', '--mode', 'interceptor'],
];

const children = passes.map((args) =>
  spawn(process.execPath, [viteBin, ...args], { env, stdio: 'inherit' }),
);

// Re-copia el manifest/iconos si cambian.
watch(p('manifest.json'), () => copyStatic().catch(() => void 0));
try {
  watch(p('icons'), () => copyStatic().catch(() => void 0));
} catch {
  /* la carpeta icons puede no soportar watch recursivo en todos los SO */
}

console.log('[dev] Observando cambios. Recarga la extensión en el navegador tras cada build.');

const shutdown = () => {
  for (const c of children) c.kill();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
