/**
 * Empaqueta dist/ en un .zip conforme a la especificación ZIP (separadores '/',
 * nombres UTF-8), apto para subir a Chrome Web Store, Edge Add-ons y Opera.
 *
 * Escrito con Node puro (zlib) para evitar el bug de Compress-Archive en
 * Windows PowerShell 5.1, que genera rutas con '\' y rompe el paquete.
 */
import { readFile, writeFile, readdir, stat, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const p = (rel) => fileURLToPath(new URL(rel, root));

const pkg = JSON.parse(await readFile(p('package.json'), 'utf8'));
const outName = `pdf-grabber-v${pkg.version}.zip`;
const distDir = p('dist');

try {
  await access(p('dist/manifest.json'), constants.F_OK);
} catch {
  console.error('[package] No existe dist/. Ejecuta primero: npm run build');
  process.exit(1);
}

/* --------------------------- Recorrer dist/ --------------------------- */

async function walk(dir, base = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = `${dir}/${entry.name}`;
    const rel = base ? `${base}/${entry.name}` : entry.name; // siempre '/'
    if (entry.isDirectory()) {
      out.push(...(await walk(abs, rel)));
    } else if (entry.isFile()) {
      out.push({ name: rel, data: await readFile(abs), mtime: (await stat(abs)).mtime });
    }
  }
  return out;
}

/* ------------------------------ CRC32 -------------------------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const y = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((y - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/* ------------------------------ Escribir ZIP ------------------------- */

const files = (await walk(distDir)).sort((a, b) => a.name.localeCompare(b.name));
const locals = [];
const centrals = [];
let offset = 0;

for (const f of files) {
  const nameBuf = Buffer.from(f.name, 'utf8');
  const crc = crc32(f.data);
  const compressed = deflateRawSync(f.data, { level: 9 });
  const { time, day } = dosDateTime(f.mtime);
  const FLAG_UTF8 = 0x0800;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // firma local file header
  local.writeUInt16LE(20, 4); // versión necesaria
  local.writeUInt16LE(FLAG_UTF8, 6); // flags (nombre UTF-8)
  local.writeUInt16LE(8, 8); // método: deflate
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(day, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(f.data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28); // extra len
  locals.push(local, nameBuf, compressed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); // firma central directory
  central.writeUInt16LE(20, 4); // versión creador
  central.writeUInt16LE(20, 6); // versión necesaria
  central.writeUInt16LE(FLAG_UTF8, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(time, 12);
  central.writeUInt16LE(day, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(f.data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30); // extra len
  central.writeUInt16LE(0, 32); // comment len
  central.writeUInt16LE(0, 34); // disk
  central.writeUInt16LE(0, 36); // internal attrs
  central.writeUInt32LE(0, 38); // external attrs
  central.writeUInt32LE(offset, 42); // offset del local header
  centrals.push(central, nameBuf);

  offset += local.length + nameBuf.length + compressed.length;
}

const centralBuf = Buffer.concat(centrals);
const localBuf = Buffer.concat(locals);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(centralBuf.length, 12);
eocd.writeUInt32LE(localBuf.length, 16);
eocd.writeUInt16LE(0, 20);

await writeFile(p(outName), Buffer.concat([localBuf, centralBuf, eocd]));
console.log(`[package] Creado ${outName} (${files.length} archivos, ${(localBuf.length + centralBuf.length + eocd.length)} bytes)`);
