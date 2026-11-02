// Tiny zero-dependency dev server.
//   /            -> website/
//   /studio/     -> tools/3d-studio/  (three.js render studio)
//   POST /save   -> writes rendered images into website/assets/3d/
// Usage: node tools/server.js   (PORT env var optional, default 5173)

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'website');
const STUDIO = path.join(__dirname, '3d-studio');
const OUT = path.join(SITE, 'assets', '3d');
const PORT = Number(process.env.PORT) || 5173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

function inside(base, file) {
  const rel = path.relative(base, file);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'POST' && url.pathname === '/save') {
      const name = (url.searchParams.get('name') || '').replace(/[^a-z0-9._-]/gi, '');
      if (!name || !/\.(png|webp|jpg)$/i.test(name)) {
        res.writeHead(400);
        return res.end('bad name');
      }
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        fs.mkdirSync(OUT, { recursive: true });
        const buf = Buffer.concat(chunks);
        fs.writeFileSync(path.join(OUT, name), buf);
        console.log(`saved ${name} (${(buf.length / 1024).toFixed(0)} KB)`);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      });
      return;
    }

    let base = SITE;
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/fonts/segoeuib.ttf') {
      // Only used by the studio to extrude currency symbols into 3D geometry.
      return send(res, 'C:/Windows/Fonts/segoeuib.ttf');
    }
    if (rel === '/studio') {
      res.writeHead(301, { Location: '/studio/' });
      return res.end();
    }
    if (rel.startsWith('/studio/')) {
      base = STUDIO;
      rel = rel.slice('/studio'.length);
    }
    let file = path.join(base, rel);
    if (rel.endsWith('/')) file = path.join(file, 'index.html');
    if (file !== base && !inside(base, file)) {
      res.writeHead(403);
      return res.end('forbidden');
    }
    send(res, file);
  })
  .listen(PORT, () => console.log(`Dev server running at http://localhost:${PORT}`));

function send(res, file) {
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err2, data) => {
      if (err2) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 not found');
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  });
}
