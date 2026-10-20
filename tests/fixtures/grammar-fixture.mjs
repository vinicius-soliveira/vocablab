/** Tests only: no content from a published textbook or from the published database grammar units. */
import {GRAMMAR_COLLECTIONS,grammarCatalogEntry} from '../../js/grammar/collections.js';
export function exampleUnit(id='eg1-u001',level='A1') {
  return {format:'vocablab-grammar-unit',version:1,id,title:'Example Grammar Lesson',level,topicId:'test-subject',summary:'A test-only lesson with simple exercises.',
    learningObjectives:['Use simple sentence forms.','Check verb agreement.'],
    explanation:[{heading:'Basic forms',body:'The verb changes to agree with the subject.',example:'She is ready.'}],
    comparisons:[{title:'Positive and negative',left:{label:'Positive',example:'She is ready.',note:'Affirmative form.'},right:{label:'Negative',example:'She is not ready.',note:'Negative form.'}}],
    examples:[{sentence:'They are here.',note:'Plural form.'},{sentence:'I am ready.',note:'First-person form.'}],
    commonMistakes:[{incorrect:'She are ready.',correct:'She is ready.',why:'Use is with she.'},{incorrect:'I is ready.',correct:'I am ready.',why:'Use am with I.'}],
    studyTips:['Identify the subject before selecting the verb.'],
    exercises:Array.from({length:12},(_,i)=>i%3===0?{id:`written-${String(i+1).padStart(2,'0')}`,type:'multiple-choice',prompt:'Select the correct verb.',feedback:'Use is with she.',choices:['is','are','am'],answerIndex:0}:
      i%3===1?{id:`written-${String(i+1).padStart(2,'0')}`,type:'gap-fill',prompt:'She ___ ready.',acceptedAnswers:['is'],feedback:'Use is.'}:
      {id:`written-${String(i+1).padStart(2,'0')}`,type:'error-correction',prompt:'Correct: She are ready.',acceptedAnswers:['She is ready.'],feedback:'Use is with she.'}),
    speakingExercises:Array.from({length:3},(_,i)=>({id:`sp-${String(i+1).padStart(2,'0')}`,prompt:'Say that she is ready.',acceptedAnswers:['She is ready.'],feedback:'Use is with she.'})),
    listeningExercises:[{id:'li-01',type:'multiple-choice',audioText:'She is ready to start.',prompt:'Which verb did you hear?',choices:['is','are','am'],answerIndex:0,feedback:'The correct verb is is.'},
      {id:'li-02',type:'multiple-choice',audioText:'They are here today.',prompt:'Which verb did you hear?',choices:['am','are','is'],answerIndex:1,feedback:'The correct verb is are.'},
      {id:'li-03',type:'gap-fill',audioText:'I am very happy today.',prompt:'Write the verb you heard.',acceptedAnswers:['am'],feedback:'The correct verb is am.'}]
  };
}
export function fixtureEntry(unit=exampleUnit(),collectionId='english-grammar-1'){
  return grammarCatalogEntry(unit,`database/English_Grammar_${collectionId.at(-1)}/${unit.id}.json`);
}
export function fixtureManifest(units=[fixtureEntry()]) {
  return {format:'vocablab-grammar-catalog',version:1,
    collections:GRAMMAR_COLLECTIONS.map(c=>({id:c.id,title:c.title,level:c.level,book:c.book,edition:c.edition,unitCount:units.filter(x=>x.collectionId===c.id).length})), units};
}
