// Serves public/ as static files for local preview and for the browser tests.
// PHP does not run here: track.php answers 501, and the tests stub the Niu API instead.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const port = Number(process.env.PORT ?? 4326);

// The Content Security Policy of the host, read from .htaccess, so that the pages run here under the
// policy they get on the site, and the browser tests see anything it would block.
const htaccess = await readFile(join(root, '.htaccess'), 'utf8');
const policy = htaccess.match(/^\s*Header always set Content-Security-Policy "([^"]+)"\s*$/m)?.[1];
if (!policy) throw new Error('No Content-Security-Policy header found in public/.htaccess');

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-cache', 'content-security-policy': policy }).end(body);
}

createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(res, 400, 'Bad request\n');
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const path = normalize(join(root, pathname));
  // Like Apache on the host: nothing outside public/, no dotfiles such as .htaccess.
  if (!path.startsWith(root) || pathname.split('/').some((part) => part.startsWith('.'))) {
    return send(res, 404, 'Not found\n');
  }
  if (extname(path) === '.php') {
    return send(res, 501, 'PHP is not available on this server\n');
  }
  try {
    send(res, 200, await readFile(path), types[extname(path)] ?? 'application/octet-stream');
  } catch {
    send(res, 404, 'Not found\n');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Serving public/ at http://127.0.0.1:${port}/`);
});
