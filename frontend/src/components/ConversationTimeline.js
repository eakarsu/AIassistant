import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:3001';

function fmtTime(s) {
  try { return new Date(s).toLocaleString(); } catch { return String(s); }
}

export default function ConversationTimeline() {
  const [data, setData] = useState({ lanes: [], events: [], window: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [limit, setLimit] = useState(12);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(`${API_BASE}/api/custom-views/conversation-timeline`, { params: { limit } });
      setData(r.data || { lanes: [], events: [] });
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => { load(); }, [load]);

  const { lanes, events } = data;

  const range = useMemo(() => {
    if (!events.length) return { start: Date.now(), end: Date.now() + 1, span: 1 };
    const start = new Date(events[0].at).getTime();
    const end = new Date(events[events.length - 1].at).getTime();
    return { start, end, span: Math.max(1, end - start) };
  }, [events]);

  const intentColor = (intent) => {
    const palette = ['#0ea5e9', '#22c55e', '#eab308', '#f97316', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e', '#3b82f6', '#a3e635', '#facc15'];
    let h = 0; for (let i = 0; i < intent.length; i++) h = (h * 31 + intent.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  };

  return (
    <div data-testid="conversation-timeline-card" style={card}>
      <div style={headerRow}>
        <div>
          <h3 style={h3}>Conversation Timeline</h3>
          <p style={subtle}>
            {lanes.length} conversations · {events.length} turns
            {data.window ? ` · ${fmtTime(data.window.start)} → ${fmtTime(data.window.end)}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={subtle}>Conversations</label>
          <input
            type="number" min={3} max={24} value={limit}
            onChange={(e) => setLimit(Math.max(3, Math.min(24, Number(e.target.value) || 12)))}
            style={input}
          />
          <button onClick={load} disabled={loading} style={btn}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ overflowX: 'auto', border: '1px solid #1e293b', borderRadius: 8, background: '#0b1220', padding: 12 }}>
        {lanes.map((lane) => {
          const laneEvents = events.filter((e) => e.conv_id === lane.id);
          return (
            <div key={lane.id} style={{ display: 'flex', alignItems: 'center', minHeight: 38, marginBottom: 6 }}>
              <div style={{ width: 220, color: '#cbd5e1', fontSize: 12, paddingRight: 8 }}>
                <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{lane.title}</div>
                <div style={{ color: '#64748b', fontSize: 10 }}>{lane.model}</div>
              </div>
              <div style={{ position: 'relative', flex: 1, height: 26, background: '#111827', borderRadius: 4 }}>
                {laneEvents.map((ev) => {
                  const t = new Date(ev.at).getTime();
                  const x = ((t - range.start) / range.span) * 100;
                  return (
                    <div
                      key={ev.turn_id}
                      onClick={() => setSelected(ev)}
                      title={`${ev.role}/${ev.intent} · ${fmtTime(ev.at)}`}
                      style={{
                        position: 'absolute',
                        left: `calc(${x}% - 5px)`,
                        top: ev.role === 'user' ? 4 : 12,
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: intentColor(ev.intent),
                        border: ev.role === 'user' ? '2px solid #f1f5f9' : '1px solid #0f172a',
                        cursor: 'pointer',
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
        {!lanes.length && !loading && <div style={{ color: '#64748b' }}>No conversations.</div>}
      </div>

      {selected && (
        <div style={{ marginTop: 10, padding: 10, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6 }}>
          <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>
            {selected.role.toUpperCase()} · {selected.intent}
          </div>
          <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>{selected.preview}</div>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
            {fmtTime(selected.at)} · tokens={selected.tokens}{selected.latency_ms ? ` · latency=${selected.latency_ms}ms` : ''}
          </div>
        </div>
      )}
    </div>
  );
}

const card = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: 14 };
const headerRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 };
const h3 = { margin: 0, color: '#e2e8f0' };
const subtle = { margin: '4px 0 0', color: '#94a3b8', fontSize: 12 };
const input = { width: 70, padding: '6px 8px', background: '#0b1220', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6 };
const btn = { padding: '6px 10px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, cursor: 'pointer' };
const errorBox = { color: '#fecaca', background: '#7f1d1d', padding: 8, borderRadius: 6, marginBottom: 8, fontSize: 12 };
