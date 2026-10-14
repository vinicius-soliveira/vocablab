/** Lazy loading of read-only vocabulary packages from the web server. */
import { parseContentPackage } from './package-core.js';

const manifestURL = new URL('../database/manifest.json', import.meta.url);

function validPath(value) {
  return typeof value === 'string' && value.startsWith('database/') &&
    value.endsWith('.json') && !value.includes('?') && !value.includes('#') &&
    !value.split('/').some(part => !part || part === '.' || part === '..');
}

export async function loadCatalog() {
  const response = await fetch(manifestURL);
  if (!response.ok) throw new Error(`Could not fetch vocabulary catalog (HTTP ${response.status}).`);
  const data = await response.json();
  if (data?.format !== 'vocablab-catalog' || data.version !== 1 || !Array.isArray(data.units)) {
    throw new Error('Invalid vocabulary catalog format.');
  }
  const seen = new Set();
  for (const item of data.units) {
    if (!item || !/^[A-Za-z0-9_-]+$/.test(item.id || '') || !validPath(item.path) || seen.has(item.id)) {
      throw new Error(`Invalid or duplicated catalog entry: ${item?.id ?? '(missing ID)'}`);
    }
    seen.add(item.id);
  }
  return data.units;
}

export async function loadCatalogUnit(entry) {
  if (!entry || !validPath(entry.path)) throw new Error('Invalid catalog file path.');
  const response = await fetch(new URL('../' + entry.path, import.meta.url));
  if (!response.ok) throw new Error(`Could not fetch the vocabulary package (HTTP ${response.status}).`);
  const parsed = parseContentPackage(await response.json());
  const unit = parsed.units.find(candidate => candidate.id === entry.id);
  if (!unit) throw new Error(`Unit ${entry.id} is missing from ${entry.path}.`);
  return unit;
}
