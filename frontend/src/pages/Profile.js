import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import { ToastContainer, useToast } from '../components/Toast';

function Profile() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileForm, setProfileForm] = useState({ name: '', email: '' });
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  const API = useCallback(() => axios.create({
    baseURL: 'http://localhost:3001',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  }), []);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await API().get('/api/auth/profile');
      const userData = res.data.user || res.data;
      setUser(userData);
      setProfileForm({ name: userData.name || '', email: userData.email || '' });
    } catch (err) {
      addToast('Failed to load profile', 'error');
    } finally {
      setLoading(false);
    }
  }, [API, addToast]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await API().put('/api/auth/profile', profileForm);
      addToast('Profile updated successfully', 'success');
      fetchProfile();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to update profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      addToast('New passwords do not match', 'error');
      return;
    }
    if (passwordForm.new_password.length < 6) {
      addToast('New password must be at least 6 characters', 'error');
      return;
    }
    setSavingPassword(true);
    try {
      await API().put('/api/auth/change-password', {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      addToast('Password changed successfully', 'success');
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to change password', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="page-content">
        <ToastContainer toasts={toasts} removeToast={removeToast} />

        <div className="page-header">
          <h1>Profile & Settings</h1>
        </div>

        {loading ? (
          <div className="loading-container"><div className="loading-spinner"></div></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', alignItems: 'start' }}>
            {/* Left: Profile Card */}
            <div style={{
              background: '#1e293b',
              borderRadius: '12px',
              padding: '32px 24px',
              textAlign: 'center',
              border: '1px solid #334155',
            }}>
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: '2rem',
                fontWeight: 700,
                color: '#fff',
              }}>
                {(user?.name || '?').charAt(0).toUpperCase()}
              </div>
              <h2 style={{ color: '#e2e8f0', margin: '0 0 4px 0', fontSize: '1.3rem' }}>{user?.name || '-'}</h2>
              <p style={{ color: '#94a3b8', margin: '0 0 12px 0', fontSize: '0.9rem' }}>{user?.email || '-'}</p>
              <span style={{
                display: 'inline-block',
                padding: '4px 14px',
                borderRadius: '12px',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#fff',
                backgroundColor: user?.role === 'admin' ? '#6f42c1' : '#007bff',
                marginBottom: '16px',
              }}>
                {user?.role || '-'}
              </span>
              <div style={{ borderTop: '1px solid #334155', paddingTop: '16px', marginTop: '8px' }}>
                <p style={{ color: '#64748b', fontSize: '0.8rem', margin: 0 }}>
                  Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}
                </p>
              </div>
            </div>

            {/* Right: Forms */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Update Profile Form */}
              <div style={{
                background: '#1e293b',
                borderRadius: '12px',
                padding: '24px',
                border: '1px solid #334155',
              }}>
                <h3 style={{ color: '#e2e8f0', margin: '0 0 20px 0' }}>Update Profile</h3>
                <form onSubmit={handleProfileUpdate}>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', color: '#94a3b8', marginBottom: '6px', fontSize: '0.9rem' }}>Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={profileForm.name}
                      onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid #334155',
                        background: '#0f172a',
                        color: '#e2e8f0',
                        fontSize: '0.95rem',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', color: '#94a3b8', marginBottom: '6px', fontSize: '0.9rem' }}>Email</label>
                    <input
                      type="email"
                      className="form-control"
                      value={profileForm.email}
                      onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid #334155',
                        background: '#0f172a',
                        color: '#e2e8f0',
                        fontSize: '0.95rem',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={savingProfile}
                    style={{ padding: '10px 24px' }}>
                    {savingProfile ? 'Saving...' : 'Save Profile'}
                  </button>
                </form>
              </div>

              {/* Change Password Form */}
              <div style={{
                background: '#1e293b',
                borderRadius: '12px',
                padding: '24px',
                border: '1px solid #334155',
              }}>
                <h3 style={{ color: '#e2e8f0', margin: '0 0 20px 0' }}>Change Password</h3>
                <form onSubmit={handlePasswordChange}>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', color: '#94a3b8', marginBottom: '6px', fontSize: '0.9rem' }}>Current Password</label>
                    <input
                      type="password"
                      className="form-control"
                      value={passwordForm.current_password}
                      onChange={e => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid #334155',
                        background: '#0f172a',
                        color: '#e2e8f0',
                        fontSize: '0.95rem',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', color: '#94a3b8', marginBottom: '6px', fontSize: '0.9rem' }}>New Password</label>
                    <input
                      type="password"
                      className="form-control"
                      value={passwordForm.new_password}
                      onChange={e => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid #334155',
                        background: '#0f172a',
                        color: '#e2e8f0',
                        fontSize: '0.95rem',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', color: '#94a3b8', marginBottom: '6px', fontSize: '0.9rem' }}>Confirm New Password</label>
                    <input
                      type="password"
                      className="form-control"
                      value={passwordForm.confirm_password}
                      onChange={e => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid #334155',
                        background: '#0f172a',
                        color: '#e2e8f0',
                        fontSize: '0.95rem',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={savingPassword}
                    style={{ padding: '10px 24px' }}>
                    {savingPassword ? 'Changing...' : 'Change Password'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Profile;
