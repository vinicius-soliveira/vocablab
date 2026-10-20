/** Stable book/collection identities. No changes to existing localStorage keys. */
export const GRAMMAR_COLLECTIONS = Object.freeze([
  Object.freeze({id:'english-grammar-1',title:'English Grammar 1',level:'A1–A2',levels:['A1','A2'],unitPrefix:'eg1-',folder:'English_Grammar_1',book:'English Grammar 1',edition:''}),
  Object.freeze({id:'english-grammar-2',title:'English Grammar 2',level:'B1–B2',levels:['B1','B2'],unitPrefix:'eg2-',folder:'English_Grammar_2',book:'English Grammar 2',edition:''}),
  Object.freeze({id:'english-grammar-3',title:'English Grammar 3',level:'C1–C2',levels:['C1','C2'],unitPrefix:'eg3-',folder:'English_Grammar_3',book:'English Grammar 3',edition:''})
]);
export const grammarCollection = id => GRAMMAR_COLLECTIONS.find(x=>x.id===id) || null;
/** Only known collection directories and safe, stable egN-uNNN filenames. */
export function grammarPathInfo(path) {
  if(typeof path!=='string')return null;
  const match=/^database\/(English_Grammar_([123]))\/(eg([123])-u([0-9]{3}))\.json$/.exec(path);
  if(!match)return null;
  const collection=grammarCollection(`english-grammar-${match[2]}`);
  if(!collection || collection.folder!==match[1] || collection.unitPrefix!==`eg${match[4]}-`)return null;
  return {collectionId:collection.id,id:match[3],number:Number(match[5])};
}
export function grammarCatalogEntry(unit,path) {
  const info=grammarPathInfo(path);
  if(!info || info.id!==unit.id)throw new Error(`Invalid grammar collection or unit path: ${path}`);
  const collection=grammarCollection(info.collectionId);
  if(!collection.levels.includes(unit.level))throw new Error(`${unit.id}: expected a ${collection.level} level, received ${unit.level}`);
  return {id:unit.id,title:unit.title,level:unit.level,topicId:unit.topicId,collectionId:info.collectionId,number:info.number,
    exerciseCount:unit.exercises.length,speakingCount:unit.speakingExercises?.length||0,listeningCount:unit.listeningExercises?.length||0,path};
}
export function selectGrammarCollection(catalog,id) {
  return id==='all'?catalog:catalog.filter(unit=>unit.collectionId===id);
}
