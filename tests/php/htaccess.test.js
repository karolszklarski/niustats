import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { request } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { PHP_VERSION } from './php-version.js';

const CONTAINER = 'niustats-apache-test';
const PORT = 8093;

const publicPath = fileURLToPath(new URL('../../public', import.meta.url));
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function send(path, { host = 'niustats.com', method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const options = { host: '127.0.0.1', port: PORT, path, method, headers: { host, ...headers } };
    const outgoing = request(options, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        text += chunk;
      });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, text }));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

before(async () => {
  try {
    docker('rm', '-f', CONTAINER);
  } catch {
  }
  docker(
    'run', '--rm', '--detach', '--name', CONTAINER,
    '--publish', `127.0.0.1:${PORT}:80`,
    '--volume', `${publicPath}:/site:ro`,
    `php:${PHP_VERSION}-apache`, 'sh', '-c',
    [
      'a2enmod -q rewrite headers',
      "sed -i 's/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf",
      'cp -r /site/. /var/www/html/',
      "sed -i '/%{HTTPS}/d' /var/www/html/.htaccess",
      'mkdir /var/www/html/unchanged',
      'cp -r /site/. /var/www/html/unchanged/',
      'mkdir /var/www/html/.git',
      'echo secret > /var/www/html/.git/config',
      'exec apache2-foreground',
    ].join(' && '),
  );
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await send('/robots.txt')).status === 200) break;
    } catch {
    }
    if (attempt === 100) throw new Error(`Apache did not start:\n${docker('logs', CONTAINER)}`);
    await sleep(200);
  }
});

after(() => {
  docker('rm', '-f', CONTAINER);
});

test('redirects plain HTTP to https://niustats.com, keeping the path', async () => {
  const { status, headers } = await send('/unchanged/pull.html');
  assert.equal(status, 301);
  assert.equal(headers.location, 'https://niustats.com/pull.html');
});

test('redirects the www address to the one without www', async () => {
  const { status, headers } = await send('/pull.html', { host: 'www.niustats.com' });
  assert.equal(status, 301);
  assert.equal(headers.location, 'https://niustats.com/pull.html');
});

test('has browsers check every file each time, as file names carry no version', async () => {
  for (const path of ['/', '/pull.html', '/data.html', '/js/index.js', '/vendor/chart.umd.min.js', '/favicon.ico', '/robots.txt']) {
    const { status, headers } = await send(path);
    assert.equal(status, 200, path);
    assert.equal(headers['cache-control'], 'no-cache', path);
    assert.equal(headers.expires, undefined, path);
  }
});

test('answers 304 for a file that has not changed', async () => {
  const { headers } = await send('/js/index.js');
  const { status } = await send('/js/index.js', { headers: { 'if-modified-since': headers['last-modified'] } });
  assert.equal(status, 304);
});

test('does not list the files of a directory', async () => {
  assert.equal((await send('/js/')).status, 403);
});

test('hides .git, which a copy of the site made by hand could bring along', async () => {
  for (const path of ['/.git', '/.git/', '/.git/config']) {
    const { status, text } = await send(path);
    assert.equal(status, 404, path);
    assert.doesNotMatch(text, /secret/, path);
  }
});

const SECURITY_HEADERS = {
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self' https://www.googletagmanager.com",
    "connect-src 'self' https://account-fk.niu.com https://app-api-fk.niu.com https://www.googletagmanager.com https://*.google-analytics.com https://*.google.com",
    "img-src 'self' https://www.googletagmanager.com https://*.google-analytics.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; '),
};

test('sends the security headers with pages, files, errors and redirects', async () => {
  const requests = [
    ['/', 200],
    ['/pull.html', 200],
    ['/js/pull.js', 200],
    ['/missing.html', 404],
    ['/.git/config', 404],
    ['/js/', 403],
    ['/unchanged/pull.html', 301],
    ['/track.php', 400, { method: 'POST' }],
  ];
  for (const [path, expectedStatus, options] of requests) {
    const { status, headers } = await send(path, options);
    assert.equal(status, expectedStatus, path);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) assert.equal(headers[name], value, `${name} of ${path}`);
  }
  const { status, headers } = await send('/pull.html', { host: 'www.niustats.com' });
  assert.equal(status, 301);
  assert.equal(headers['content-security-policy'], SECURITY_HEADERS['content-security-policy']);
});

test('does not name the PHP version', async () => {
  const { headers } = await send('/track.php', { method: 'POST' });
  assert.equal(headers['x-powered-by'], undefined);
});

test('runs track.php', async () => {
  const { status, text } = await send('/track.php', { method: 'POST' });
  assert.equal(status, 400);
  assert.deepEqual(JSON.parse(text), { data: [], status: -1, desc: 'Invalid page' });
});
