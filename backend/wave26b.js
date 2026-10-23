'use strict';
function csvCell(v){ if(v===null||v===undefined) return ''; const s=typeof v==='object'?JSON.stringify(v):String(v); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }
function toCsv(rows, cols){ const c=cols||(rows[0]?Object.keys(rows[0]):[]); if(!c.length) return ''; return [c.join(','), ...rows.map(r=>c.map(k=>csvCell(r[k])).join(','))].join('\n'); }
function providerConfigured(env){ env=env||process.env; return Boolean((env.OPENROUTER_API_KEY&&env.OPENROUTER_API_KEY!=='your_openrouter_api_key_here'&&env.OPENROUTER_API_KEY!=='your_openrouter_key_here')||env.OPENAI_API_KEY); }
const num=v=>{ const n=Number(v); return Number.isFinite(n)?n:0; };
function formatValue(v){ if(v===false) return 'false'; if(v===0) return '0'; if(v===''||v===null||v===undefined) return '(empty)'; if(typeof v==='object') return JSON.stringify(v); return String(v); }

function cohortSummary(rows){ rows=rows||[]; const by={}; rows.forEach(r=>{by[r.gender||'unknown']=(by[r.gender||'unknown']||0)+1;});
 return {feature:'patient-cohort-summary',aiGenerated:false,source:'deterministic-fallback',sections:[{label:'Patients reviewed',value:rows.length},{label:'By gender',value:by},{label:'Gender recorded',value:rows.filter(r=>r.gender).length},{label:'Has patients',value:rows.length>0}]}; }
function insuranceMix(rows){ rows=rows||[]; const by={}; rows.forEach(r=>{by[r.insurance_provider||'unknown']=(by[r.insurance_provider||'unknown']||0)+1;});
 return {feature:'insurance-mix',aiGenerated:false,source:'deterministic-fallback',sections:[{label:'Patients reviewed',value:rows.length},{label:'By insurance provider',value:by},{label:'Without insurance provider',value:rows.filter(r=>!r.insurance_provider).length}]}; }
function recordsCompleteness(rows){ rows=rows||[]; const missing=k=>rows.filter(r=>!r[k]).length;
 return {feature:'records-completeness',aiGenerated:false,source:'deterministic-fallback',sections:[{label:'Patients reviewed',value:rows.length},{label:'Missing phone',value:missing('phone')},{label:'Missing email',value:missing('email')},{label:'Complete contact records',value:rows.length-missing('phone')-missing('email')>=0?rows.filter(r=>r.phone&&r.email).length:0}]}; }
module.exports={toCsv,providerConfigured,formatValue,cohortSummary,insuranceMix,recordsCompleteness,FEATURES:{'patient-cohort-summary':cohortSummary,'insurance-mix':insuranceMix,'records-completeness':recordsCompleteness}};
