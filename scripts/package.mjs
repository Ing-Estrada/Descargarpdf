/**
 * Empaqueta dist/ en un .zip listo para subir a las tiendas de extensiones.
 * Usa Compress-Archive (Windows) o `zip` (macOS/Linux); no requiere dependencias.
 */
import { spawnSync } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const p = (rel) => fileURLToPath(new URL(rel, root));

const pkg = JSON.parse(await readFile(p('package.json'), 'utf8'));
const outName = `pdf-grabber-v${pkg.version}.zip`;

try {
  await access(p('dist/manifest.json'), constants.F_OK);
} catch {
  console.error('[package] No existe dist/. Ejecuta primero: npm run build');
  process.exit(1);
}

let result;
if (process.platform === 'win32') {
  result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path 'dist/*' -DestinationPath '${outName}' -Force`,
    ],
    { stdio: 'inherit', cwd: p('.') },
  );
} else {
  result = spawnSync('zip', ['-r', outName, '.'], { stdio: 'inherit', cwd: p('dist') });
  // Cuando se usa `zip` dentro de dist/, mueve el archivo al root.
  if (result.status === 0) {
    spawnSync('mv', [p(`dist/${outName}`), p(outName)], { stdio: 'inherit' });
  }
}

if (!result || result.status !== 0) {
  console.error('[package] Falló el empaquetado.');
  process.exit(1);
}
console.log(`[package] Creado ${outName}`);
