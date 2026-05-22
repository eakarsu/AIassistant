import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:3001';

export default function IntentHeatmap() {
  const [data, setData] = useState({ matrix: [], hours: [], intents: [], max_count: 0, total_turns: 0, top_intents: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hover, setHover] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(`${API_BASE}/api/custom-views/intent-heatmap`);
      setData(r.data || {});
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load heatmap');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cellColor = (count) => {
    if (!count) return '#0b1220';
    const max = Math.max(1, data.max_count || 1);
    const t = Math.min(1, count / max);
    // teal → magenta ramp
    const r = Math.round(15 + t * 240);
    const g = Math.round(118 - t * 70);
    const b = Math.round(110 + t * 130);
    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <div data-testid="intent-heatmap-card" style={card}>
      <div style={headerRow}>
        <div>
          <h3 style={h3}>Intent × Hour Heatmap</h3>
          <p style={subtle}>
            {data.total_turns || 0} turns across {data.intents?.length || 0} intents · max cell={data.max_count || 0}
          </p>
        </div>
        <button onClick={load} disabled={loading} style={btn}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, color: '#cbd5e1' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>intent \\ hour</th>
              {(data.hours || []).map((h) => (
                <th key={h} style={th}>{String(h).padStart(2, '0')}</th>
              ))}
              <th style={{ ...th, textAlign: 'right' }}>total</th>
            </tr>
          </thead>
          <tbody>
            {(data.matrix || []).map((row) => {
              const total = row.counts.reduce((a, b) => a + b, 0);
              return (
                <tr key={row.intent}>
                  <td style={{ ...td, color: '#e2e8f0', fontWeight: 600 }}>{row.intent}</td>
                  {row.counts.map((c, i) => (
                    <td
                      key={i}
                      onMouseEnter={() => setHover({ intent: row.intent, hour: i, count: c })}
                      onMouseLeave={() => setHover(null)}
                      style={{
                        ...td,
                        background: cellColor(c),
                        color: c > (data.max_count || 0) / 2 ? '#0b1220' : '#cbd5e1',
                        cursor: 'pointer',
                        textAlign: 'center',
                        minWidth: 24,
                      }}
                    >{c || ''}</td>
                  ))}
                  <td style={{ ...td, textAlign: 'right', color: '#a3e635' }}>{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={subtle}>Top intents:</div>
        {(data.top_intents || []).map((ti) => (
          <span key={ti.intent} style={pill}>{ti.intent} · {ti.total}</span>
        ))}
        {hover && (
          <span style={{ ...subtle, marginLeft: 'auto' }}>
            hover: {hover.intent} @ {String(hover.hour).padStart(2, '0')}:00 → {hover.count}
          </span>
        )}
      </div>
    </div>
  );
}

const card = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: 14 };
const headerRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 };
const h3 = { margin: 0, color: '#e2e8f0' };
const subtle = { margin: '4px 0 0', color: '#94a3b8', fontSize: 12 };
const btn = { padding: '6px 10px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, cursor: 'pointer' };
const errorBox = { color: '#fecaca', background: '#7f1d1d', padding: 8, borderRadius: 6, marginBottom: 8, fontSize: 12 };
const th = { padding: '6px 8px', borderBottom: '1px solid #1e293b', color: '#94a3b8', fontWeight: 500 };
const td = { padding: '4px 6px', borderBottom: '1px solid #0b1220' };
const pill = { padding: '2px 8px', background: '#1e293b', color: '#a3e635', borderRadius: 999, fontSize: 11, border: '1px solid #334155' };
