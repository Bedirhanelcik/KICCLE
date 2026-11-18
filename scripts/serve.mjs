// Tiny dependency-free static server for the project root.
// Usage: node scripts/serve.mjs [port]   (or PORT=8080 npm run serve)
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 5173);
const HOST = process.env.HOST ?? '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
};

export function startServer(port = PORT, host = HOST) {
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = normalize(join(ROOT, rel));
      if (file !== ROOT && !file.startsWith(ROOT + sep)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      const st = statSync(file, { throwIfNoEntry: false });
      if (!st || !st.isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'content-length': st.size,
        // `no-cache` still lets the browser keep the entry and revalidate, and
        // nothing here sends an ETag or Last-Modified for it to revalidate
        // against -- which is how an edited stylesheet kept being served from
        // the old copy while the file on disk said something else. This is a
        // development server; never store anything.
        'cache-control': 'no-store, must-revalidate',
        'x-content-type-options': 'nosniff',
      });
      if (req.method === 'HEAD') return res.end();
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(400).end('Bad request');
    }
  });
  return new Promise((r) => server.listen(port, host, () => r(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await startServer();
  const { port } = server.address();
  console.log(`KICCLE serving ${ROOT} at http://${HOST}:${port}/`);
}
