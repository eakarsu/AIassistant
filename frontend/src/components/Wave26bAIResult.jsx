import React from 'react';
export function formatValue(v){ if(v===false) return 'false'; if(v===0) return '0'; if(v===''||v===null||v===undefined) return '(empty)'; if(typeof v==='object') return JSON.stringify(v); return String(v); }
export default function Wave26bAIResult({ result }) {
  if (!result) return null;
  return (
    <div>
      <p>{result.aiGenerated ? 'AI generated' : 'Deterministic fallback (no provider configured)'} — {result.source || ''}</p>
      {(result.sections || []).map((s, i) => (
        <div key={i}><strong>{s.label}</strong><div>{formatValue(s.value)}</div></div>
      ))}
    </div>
  );
}
