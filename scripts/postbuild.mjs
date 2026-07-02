/**
 * Copia los recursos estáticos (manifest.json e iconos) a dist/ tras los
 * tres pases de Vite, y verifica que los artefactos clave existan.
 */
import { cp, copyFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const p = (rel) => fileURLToPath(new URL(rel, root));

await copyFile(p('manifest.json'), p('dist/manifest.json'));
await cp(p('icons'), p('dist/icons'), { recursive: true });
console.log('[postbuild] manifest.json e icons/ copiados a dist/');

// Verificación de artefactos esperados.
const required = [
  'dist/manifest.json',
  'dist/assets/background.js',
  'dist/assets/content.js',
  'dist/assets/interceptor.js',
  'dist/src/popup/popup.html',
  'dist/src/options/options.html',
  'dist/src/offscreen/offscreen.html',
  'dist/icons/icon128.png',
];

let ok = true;
for (const rel of required) {
  try {
    await access(p(rel), constants.F_OK);
  } catch {
    ok = false;
    console.error(`[postbuild] FALTA: ${rel}`);
  }
}

if (!ok) {
  console.error('[postbuild] La compilación está incompleta.');
  process.exit(1);
}
console.log('[postbuild] Verificación OK. Carga dist/ como extensión sin empaquetar.');
