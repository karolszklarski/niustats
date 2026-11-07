// public/.ovhconfig sets the PHP version of this site on the host (OVHcloud). The host takes the engine, the
// environment and the container from its own file in the root of the hosting account, and by reports on the
// OVHcloud forum a site file that contradicts that one can stop PHP, so this file repeats those settings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PHP_VERSION } from '../php/php-version.js';

const settings = Object.fromEntries(
  readFileSync(new URL('../../public/.ovhconfig', import.meta.url), 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split('=')),
);

test('public/.ovhconfig sets the PHP version the tests run on', () => {
  assert.equal(settings['app.engine.version'], PHP_VERSION.split('.').slice(0, 2).join('.'));
});

test('public/.ovhconfig repeats the settings of the host', () => {
  const { 'app.engine.version': version, ...rest } = settings;
  assert.deepEqual(rest, {
    'http.firewall': 'security',
    'container.image': 'stable64',
    'app.engine': 'php',
    environment: 'production',
  });
});
