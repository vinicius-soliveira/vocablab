/** Deterministic, machine-readable pre-publication diagnostic report. */
const issue=(severity,text)=>{
  const match=/^([^:]+):\s*(.*)$/.exec(text);
  return {severity,code:severity==='error'?'CONTENT_VALIDATION':'CONTENT_WARNING',location:match?.[1]??'',message:match?.[2]??text};
};
export function auditReport(plan){
  const errors=plan.errors.map(x=>issue('error',x));
  const warnings=plan.warnings.map(x=>issue('warning',x));
  return {
    format:'vocablab-content-audit',version:1,
    bookId:plan.book.id,book:plan.book.title,provider:plan.provider,
    expectedUnits:plan.expected,foundUnits:plan.units,files:plan.files,
    passed:errors.length===0,
    summary:{errors:errors.length,warnings:warnings.length},
    issues:[...errors,...warnings],
  };
}
