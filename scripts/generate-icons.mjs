/**
 * Genera los iconos PNG (16/48/128) sin dependencias externas.
 *
 * Dibuja el logotipo (cuadrado redondeado con degradado + flecha de descarga)
 * con supermuestreo para bordes suaves, y codifica el PNG a mano usando zlib.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const outDir = fileURLToPath(new URL('../icons', import.meta.url));
const SIZES = [16, 48, 128];
const SS = 4; // factor de supermuestreo

/* --------------------------- Utilidades color -------------------------- */

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

const TOP = [255, 146, 105]; // #ff9269
const BOTTOM = [228, 87, 46]; // #e4572e
const WHITE = [255, 255, 255];

/* ------------------------- Geometría normalizada ----------------------- */

function insideRoundedRect(x, y, m, r) {
  const lo = m;
  const hi = 1 - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  // Esquinas
  const cx = x < lo + r ? lo + r : x > hi - r ? hi - r : x;
  const cy = y < lo + r ? lo + r : y > hi - r ? hi - r : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function insideArrow(x, y) {
  // Vástago
  if (x >= 0.44 && x <= 0.56 && y >= 0.2 && y <= 0.5) return true;
  // Cabeza (triángulo apuntando hacia abajo)
  if (y >= 0.46 && y <= 0.68) {
    const t = (y - 0.46) / (0.68 - 0.46); // 0 arriba .. 1 punta
    const halfWidth = lerp(0.2, 0.0, t);
    if (Math.abs(x - 0.5) <= halfWidth) return true;
  }
  // Bandeja / base
  if (x >= 0.26 && x <= 0.74 && y >= 0.76 && y <= 0.84) return true;
  return false;
}

/* ------------------------------ Render --------------------------------- */

function renderPixel(nx, ny) {
  // Devuelve [r,g,b,a] (0..255) para una posición normalizada.
  if (!insideRoundedRect(nx, ny, 0.06, 0.22)) return [0, 0, 0, 0];
  if (insideArrow(nx, ny)) return [...WHITE, 255];
  const [r, g, b] = mix(TOP, BOTTOM, ny);
  return [r, g, b, 255];
}

function renderImage(size) {
  const data = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const nx = (px + (sx + 0.5) / SS) / size;
          const ny = (py + (sy + 0.5) / SS) / size;
          const [pr, pg, pb, pa] = renderPixel(nx, ny);
          const af = pa / 255;
          r += pr * af;
          g += pg * af;
          b += pb * af;
          a += pa;
        }
      }
      const n = SS * SS;
      const alpha = a / n;
      const off = (py * size + px) * 4;
      // Color premultiplicado promediado -> "des-premultiplicar".
      const norm = alpha > 0 ? n / a : 0;
      data[off] = Math.round(r * norm);
      data[off + 1] = Math.round(g * norm);
      data[off + 2] = Math.round(b * norm);
      data[off + 3] = Math.round(alpha);
    }
  }
  return data;
}

/* ---------------------------- Codificar PNG ---------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profundidad de bits
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compresión
  ihdr[11] = 0; // filtro
  ihdr[12] = 0; // entrelazado

  // Datos con byte de filtro (0) por fila.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* -------------------------------- Main --------------------------------- */

await mkdir(outDir, { recursive: true });
for (const size of SIZES) {
  const png = encodePng(size, renderImage(size));
  const path = fileURLToPath(new URL(`../icons/icon${size}.png`, import.meta.url));
  await writeFile(path, png);
  console.log(`[icons] icon${size}.png (${png.length} bytes)`);
}
console.log('[icons] listo');
