import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import { ToastContainer, useToast } from '../components/Toast';

const typeConfig = {
  info: { color: '#007bff', icon: '\u2139\uFE0F', bg: 'rgba(0, 123, 255, 0.1)', border: '#007bff' },
  success: { color: '#28a745', icon: '\u2705', bg: 'rgba(40, 167, 69, 0.1)', border: '#28a745' },
  warning: { color: '#ffc107', icon: '\u26A0\uFE0F', bg: 'rgba(255, 193, 7, 0.1)', border: '#ffc107' },
  error: { color: '#dc3545', icon: '\u274C', bg: 'rgba(220, 53, 69, 0.1)', border: '#dc3545' },
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function Notifications() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const { toasts, addToast, removeToast } = useToast();

  const API = useCallback(() => axios.create({
    baseURL: 'http://localhost:3001',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  }), []);

  const fetchData = useCallback(async () => {
    try {
      const res = await API().get('/api/notifications');
      setItems(Array.isArray(res.data) ? res.data : res.data.notifications || res.data.data || []);
    } catch (err) {
      addToast('Failed to load notifications', 'error');
    } finally {
      setLoading(false);
    }
  }, [API, addToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleMarkRead = async (item) => {
    try {
      await API().put(`/api/notifications/${item.id}/read`);
      addToast('Notification marked as read', 'success');
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to update notification', 'error');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await API().put('/api/notifications/read-all');
      addToast('All notifications marked as read', 'success');
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to update notifications', 'error');
    }
  };

  const handleDelete = async (item) => {
    try {
      await API().delete(`/api/notifications/${item.id}`);
      addToast('Notification deleted', 'success');
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete notification', 'error');
    }
  };

  const filtered = items.filter(item => {
    if (filter === 'unread') return !item.read;
    if (filter === 'read') return item.read;
    return true;
  });

  const unreadCount = items.filter(i => !i.read).length;

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="page-content">
        <ToastContainer toasts={toasts} removeToast={removeToast} />

        <div className="page-header">
          <h1>Notifications {unreadCount > 0 && <span style={{
            fontSize: '0.9rem',
            backgroundColor: '#dc3545',
            color: '#fff',
            borderRadius: '12px',
            padding: '2px 10px',
            marginLeft: '8px',
            verticalAlign: 'middle'
          }}>{unreadCount} unread</span>}</h1>
          <div className="page-toolbar">
            {unreadCount > 0 && (
              <button className="btn btn-primary" onClick={handleMarkAllRead}>
                Mark All Read
              </button>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px' }}>
          {['all', 'unread', 'read'].map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              style={{
                padding: '8px 20px',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.9rem',
                backgroundColor: filter === tab ? '#4f46e5' : '#1e293b',
                color: filter === tab ? '#fff' : '#94a3b8',
                transition: 'all 0.2s',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'unread' && unreadCount > 0 && ` (${unreadCount})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-container"><div className="loading-spinner"></div></div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>No notifications</div>
            <p>You're all caught up!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filtered.map(item => {
              const cfg = typeConfig[item.type] || typeConfig.info;
              return (
                <div
                  key={item.id}
                  style={{
                    background: item.read ? '#1e293b' : cfg.bg,
                    border: `1px solid ${item.read ? '#334155' : cfg.border}`,
                    borderLeft: `4px solid ${cfg.border}`,
                    borderRadius: '8px',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '14px',
                    opacity: item.read ? 0.7 : 1,
                    transition: 'all 0.2s',
                  }}
                >
                  {/* Icon */}
                  <div style={{ fontSize: '1.5rem', flexShrink: 0, marginTop: '2px' }}>
                    {cfg.icon}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '1rem' }}>
                        {item.title}
                        {!item.read && (
                          <span style={{
                            display: 'inline-block',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: '#4f46e5',
                            marginLeft: '8px',
                            verticalAlign: 'middle'
                          }} />
                        )}
                      </span>
                      <span style={{ color: '#64748b', fontSize: '0.8rem', flexShrink: 0 }}>
                        {timeAgo(item.created_at || item.timestamp)}
                      </span>
                    </div>
                    <p style={{ color: '#94a3b8', margin: '0 0 10px 0', fontSize: '0.9rem', lineHeight: '1.4' }}>
                      {item.message}
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {!item.read && (
                        <button
                          onClick={() => handleMarkRead(item)}
                          style={{
                            padding: '4px 12px',
                            border: '1px solid #4f46e5',
                            borderRadius: '4px',
                            background: 'transparent',
                            color: '#4f46e5',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                          }}
                        >
                          Mark as Read
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(item)}
                        style={{
                          padding: '4px 12px',
                          border: '1px solid #64748b',
                          borderRadius: '4px',
                          background: 'transparent',
                          color: '#64748b',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default Notifications;
