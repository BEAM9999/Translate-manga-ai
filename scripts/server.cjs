const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 3000;
const DIST_DIR = path.resolve(__dirname, '..', 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.zip': 'application/zip',
};

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse path
  let reqUrl;
  try {
    reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  let pathname = decodeURIComponent(reqUrl.pathname);
  if (pathname === '/') {
    pathname = '/index.html';
  }

  let filePath = path.join(DIST_DIR, pathname);

  // Security check: ensure filePath is inside DIST_DIR
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // SPA Fallback to index.html for non-asset routes
      filePath = path.join(DIST_DIR, 'index.html');
    }

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        res.end('Internal Server Error');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': content.length,
        'Cache-Control': 'no-cache',
      });
      res.end(content);
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  ➜  Server running at http://localhost:${PORT}/\n`);
  fs.appendFileSync(path.resolve(__dirname, 'server_runtime.log'), `[${new Date().toISOString()}] Server listening on port ${PORT}\n`);
});

// Diagnostic logging
const logFile = path.resolve(__dirname, 'server_runtime.log');
process.on('exit', (code) => {
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] Process exit with code: ${code}\n`);
});
process.on('SIGINT', () => {
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] Received SIGINT\n`);
});
process.on('SIGTERM', () => {
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] Received SIGTERM\n`);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] Uncaught Exception: ${err?.stack || err}\n`);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] Unhandled Rejection: ${reason}\n`);
});

// Keep process active
setInterval(() => {}, 60000);

