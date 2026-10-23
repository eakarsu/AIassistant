import React, { useEffect, useState } from 'react';
import Wave26bAIResult from './Wave26bAIResult';
export default function FeaturePackPanel() {
  const [tasks, setTasks] = useState([]); const [title, setTitle] = useState(''); const [err, setErr] = useState(''); const [ai, setAi] = useState(null);
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` });
  const load = () => fetch('/api/wave26b/tasks', { headers: headers() }).then((r) => r.json()).then((d) => setTasks(d.data || [])).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const create = async () => { const r = await fetch('/api/wave26b/tasks', { method: 'POST', headers: headers(), body: JSON.stringify({ title }) }); if (!r.ok) return setErr('Create failed'); setTitle(''); load(); };
  const done = async (id) => { await fetch(`/api/wave26b/tasks/${id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ status: 'done' }) }); load(); };
  const runAi = async (f) => { const r = await fetch(`/api/wave26b/ai/${f}`, { method: 'POST', headers: headers(), body: JSON.stringify({}) }); setAi(await r.json()); };
  return (<div style={{ padding: 16 }}><h2>Tasks, export & AI</h2>{err && <p role="alert">{err}</p>}
    <p><a href="/api/wave26b/records/export?format=csv">Export CSV</a>{' '}<a href="/api/wave26b/records/export?format=json">Export JSON</a></p>
    <input aria-label="Task title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task" /><button onClick={create} disabled={!title.trim()}>Add task</button>
    <ul>{tasks.map((t) => (<li key={t.id}>{t.title} — {t.status}{' '}{t.status !== 'done' && <button onClick={() => done(t.id)}>Mark done</button>}</li>))}</ul>
    <div><button onClick={() => runAi('patient-cohort-summary')}>Cohort summary</button>{' '}<button onClick={() => runAi('insurance-mix')}>Insurance mix</button>{' '}<button onClick={() => runAi('records-completeness')}>Records completeness</button><Wave26bAIResult result={ai} /></div>
  </div>);
}
