/**
 * Servidor estático mínimo (sin dependencias) para el banco de pruebas.
 *
 *   node test/serve.mjs        → http://localhost:8080/test.html
 *   node test/serve.mjs 9000   → puerto personalizado
 *
 * Sirve sobre http:// (no file://) para que fetch/XHR y los content scripts
 * funcionen sin restricciones. Con ?cd=1 añade Content-Disposition para
 * probar la extracción de nombre desde cabecera.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join, normalize } from 'node:path';

const dir = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.argv[2]) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.pdf': 'application/pdf',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/test.html';

    // Resuelve dentro de dir/ y bloquea escapes con ../
    const file = normalize(join(dir, path));
    if (!file.startsWith(normalize(dir))) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const data = await readFile(file);
    const type = MIME[extname(path).toLowerCase()] || 'application/octet-stream';

    const headers = { 'Content-Type': type };
    if (url.searchParams.has('cd')) {
      headers['Content-Disposition'] = 'attachment; filename="informe-desde-cabecera.pdf"';
    }
    res.writeHead(200, headers).end(data);
  } catch {
    res.writeHead(404).end('No encontrado');
  }
});

server.listen(port, () => {
  console.log(`[serve] Banco de pruebas en http://localhost:${port}/test.html`);
  console.log('[serve] Ctrl+C para detener.');
});
