import React, { useEffect, useState } from 'react';

export default function CriticalFindingsQueue() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch('/api/critical-findings-queue').then((res) => res.json()).then(setData).catch(() => setData(null));
  }, []);
  return (
    <div className="page">
      <h1>Critical Findings Queue</h1>
      <p>Prioritize urgent radiology findings, acknowledgement status, and escalation timing.</p>
      <div className="stats-grid">
        {data && Object.entries(data.summary).map(([key, value]) => <div className="stat-card" key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{value}</strong></div>)}
      </div>
      <div className="card">
        {(data?.findings || []).map((item) => <div key={item.study} style={{ padding: 12, borderBottom: '1px solid #e5e7eb' }}><strong>{item.study}</strong><div>{item.modality} - {item.finding} - {item.status}</div></div>)}
      </div>
    </div>
  );
}
