import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(join(root, 'database', 'manifest.json'), 'utf8'));

test('catalog includes valid and uniquely identified units', () => {
  assert.equal(manifest.format, 'vocablab-catalog');
  assert.equal(manifest.version, 1);
  assert.ok(manifest.units.length > 0);
  assert.equal(new Set(manifest.units.map(u => u.id)).size, manifest.units.length);
});

test('catalog paths lead to their declared source units', async () => {
  const parsed = new Map();
  for (const unit of manifest.units) {
    if (!parsed.has(unit.path)) {
      assert.match(unit.path, /^database\/[^?#]+\.json$/);
      assert.ok(!unit.path.split('/').includes('..'));
      const obj = JSON.parse(await readFile(join(root, unit.path), 'utf8'));
      parsed.set(unit.path, Array.isArray(obj.units) ? obj.units : [obj]);
    }
    const actual = parsed.get(unit.path).find(u => u.id === unit.id);
    assert.ok(actual, unit.id);
    assert.equal(actual.items.length, unit.itemsCount, unit.id);
  }
});
