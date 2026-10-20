import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const main = new URL('../js/main.js', import.meta.url);
const home = new URL('../index.html', import.meta.url);

test('Vocabulary Lab startup does not require the removed legacy minimal-pairs dataset', async () => {
  const source = await readFile(main, 'utf8');
  const bootstrap = source.split('async function start() {')[1]?.split('\nfunction setup()')[0];
  assert.ok(bootstrap, 'Vocabulary Lab start() must exist');
  assert.doesNotMatch(bootstrap, /minimal-pairs\.json|Could not load pronunciation exercises/);
  assert.match(await readFile(home, 'utf8'), /href="pronunciation\.html"/);
});
