import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const data = new Map();
globalThis.localStorage = {
  getItem: (key) => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, String(value)),
  removeItem: (key) => data.delete(key),
};

const core = await import('../js/core.js');
const packages = await import('../js/package-core.js');
const sampleUnit = JSON.parse(fs.readFileSync(new URL('../data/unit-03.json', import.meta.url)));
const example = {
  format: 'vocablab-content-package',
  version: 1,
  id: 'demo-content',
  title: 'Review example',
  audit: { includedUnits: [3], scope: 'Verified demonstration only' },
  sourceNotice: 'Examples are original.',
  units: [{
    ...sampleUnit,
    id: 'demo-u03',
    number: 3,
    learningObjectives: ['Identify body parts in everyday speech.'],
    items: sampleUnit.items.map((item) => ({ ...item })),
  }],
};

test('package parsing preserves objectives, provenance and root audit', () => {
  const parsed = packages.parseContentPackage(example);
  assert.equal(parsed.units.length, 1);
  assert.equal(parsed.units[0].learningObjectives.length, 1);
  assert.deepEqual(parsed.units[0].sourceAudit, example.audit);
  assert.equal(parsed.units[0].sourceNotice, example.sourceNotice);
  const exported = packages.exportContentPackage(parsed, parsed.units);
  assert.deepEqual(exported.audit, example.audit);
  assert.deepEqual(packages.parseContentPackage(exported).units[0].sourceAudit, example.audit);
});

test('publish, replace, and backups retain progress and imported metadata', () => {
  const parsed = packages.parseContentPackage(example);
  assert.deepEqual(packages.publishMany(parsed.units, 'replace'), { added: 1, updated: 0, skipped: 0 });
  const unit = core.library()['demo-u03'];
  assert.deepEqual(unit.sourceAudit, example.audit);
  assert.equal(unit.learningObjectives.length, 1);
  const item = unit.items[0];
  core.record(unit.id, item.id, 'listening', true);
  assert.deepEqual(packages.publishMany(parsed.units, 'replace'), { added: 0, updated: 1, skipped: 0 });
  assert.equal(core.profile(unit.id, item.id).listening.attempts, 1);
  core.importBackup(core.makeBackup());
  assert.equal(core.profile(unit.id, item.id).listening.attempts, 1);
  assert.equal(core.library()[unit.id].learningObjectives.length, 1);
});

test('invalid or duplicated imports never partially publish', () => {
  const first = packages.parseContentPackage(example).units[0];
  const before = JSON.stringify(core.library());
  assert.throws(() => packages.publishMany([first, first], 'replace'), /Duplicate unit ID/);
  assert.throws(() => packages.publishMany([
    first,
    { ...first, id: 'new-unit', items: [{ id: 'bad id', word: 'test', pt: 'teste' }] },
  ], 'replace'));
  assert.equal(JSON.stringify(core.library()), before);
});

test('legacy single-unit JSON is still accepted', () => {
  const legacy = packages.parseContentPackage(sampleUnit);
  assert.equal(legacy.units[0].id, sampleUnit.id);
  assert.equal(legacy.units[0].items.length, sampleUnit.items.length);
});

test('reserved IDs are rejected', () => {
  assert.throws(() => core.validateUnit({ ...sampleUnit, id: '__proto__' }));
});
