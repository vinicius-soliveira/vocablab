/** Local fetch of grammar catalog and lazy-loaded unit files. */
import {validateGrammarManifest, validateGrammarUnit, validGrammarPath} from './schema.js';
const base = new URL('../../grammar/', import.meta.url);
export async function loadGrammarCatalog(fetcher = fetch) {
  const response = await fetcher(new URL('manifest.json', base));
  if (!response.ok) throw new Error(`Grammar catalog unavailable (HTTP ${response.status}).`);
  return validateGrammarManifest(await response.json());
}
export async function loadGrammarUnit(entry, fetcher = fetch) {
  if (!entry || !validGrammarPath(entry.path)) throw new Error('Invalid grammar unit path.');
  const response = await fetcher(new URL('../../' + entry.path, import.meta.url));
  if (!response.ok) throw new Error(`Grammar unit unavailable (HTTP ${response.status}).`);
  const unit = validateGrammarUnit(await response.json());
  if (unit.id !== entry.id || unit.topicId !== entry.topicId ||
      unit.level !== entry.level || unit.exercises.length !== entry.exerciseCount) {
    throw new Error(`Grammar catalog/unit mismatch for ${entry.id}.`);
  }
  return unit;
}
