import React, { useState, useEffect } from 'react';

const API_BASE = `http://${window.location.hostname}:8000`;

export default function FieldWorkerApp() {
  const [officerStatus, setOfficerStatus] = useState('No Response');
  const [officerName, setOfficerName] = useState('Loading...');
  const [memberId, setMemberId] = useState(null);
  const [syncMessage, setSyncMessage] = useState('');

  const department = (localStorage.getItem('department') || 'electricity').trim().toLowerCase();
  const savedUserName = (localStorage.getItem('userName') || '').trim();

  // 1. Fetch active officers from MySQL roster with a 5-second timeout
  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const loadOfficerRecord = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/team/${encodeURIComponent(department)}`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const team = await res.json();
          if (team && team.length > 0) {
            const me = savedUserName
              ? team.find((m) => m.name.trim().toLowerCase() === savedUserName.toLowerCase())
              : team[0];

            const target = me || team[0];
            setMemberId(target.id);
            setOfficerName(target.name);
            setOfficerStatus(target.status);
          } else {
            setOfficerName('No Officers in Roster');
          }
        } else {
          setOfficerName('Roster Load Error');
        }
      } catch (err) {
        console.error('Failed to load officer status:', err);
        setOfficerName(err.name === 'AbortError' ? 'Connection Timeout' : 'Backend Unreachable');
      }
    };

    loadOfficerRecord();

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [savedUserName, department]);

  // 2. Send status update to FastAPI when officer taps a button on mobile
  const handleStatusChange = async (newStatus) => {
    setOfficerStatus(newStatus);
    setSyncMessage('Syncing...');

    if (!memberId) {
      setSyncMessage('member not found in the list');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/team/${memberId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          requester_name: officerName,
        }),
      });

      if (res.ok) {
        setSyncMessage('Synced with HQ');
        setTimeout(() => setSyncMessage(''), 2000);
      } else {
        const errData = await res.json().catch(() => ({}));
        setSyncMessage(`Sync failed: ${errData.detail || 'Unauthorized'}`);
      }
    } catch (err) {
      console.error('Error syncing status:', err);
      setSyncMessage('Network error');
    }
  };

  return (
    <div style={{
      maxWidth: '430px',
      margin: '0 auto',
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      fontFamily: 'system-ui, sans-serif',
      padding: '20px',
      boxSizing: 'border-box'
    }}>
      {/* Mobile Header */}
      <div style={{
        backgroundColor: '#0f172a',
        color: '#ffffff',
        padding: '16px',
        borderRadius: '16px',
        marginBottom: '20px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
      }}>
        <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '600' }}>
          CivicConnect Field Duty
        </div>
        <h2 style={{ margin: '4px 0 0 0', fontSize: '1.25rem' }}>{officerName}</h2>
        <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '2px' }}>
          DEPT: {department.toUpperCase()}
        </div>
      </div>

      {/* Current Operational Status Card */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        padding: '16px',
        border: '1px solid #e2e8f0',
        marginBottom: '20px'
      }}>
        <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>LIVE STATUS OVERVIEW</div>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          borderRadius: '20px',
          fontSize: '1rem',
          fontWeight: '700',
          marginTop: '10px',
          backgroundColor: officerStatus === 'Available' ? '#ecfdf5' : officerStatus === 'Busy' ? '#fefce8' : officerStatus === 'No Response' ? '#f1f5f9' : '#fef2f2',
          color: officerStatus === 'Available' ? '#059669' : officerStatus === 'Busy' ? '#ca8a04' : officerStatus === 'No Response' ? '#475569' : '#dc2626',
          border: `1px solid ${officerStatus === 'Available' ? '#a7f3d0' : officerStatus === 'Busy' ? '#fef08a' : officerStatus === 'No Response' ? '#cbd5e1' : '#fecaca'}`
        }}>
          <span>{officerStatus === 'Available' ? '🟢' : officerStatus === 'Busy' ? '🟡' : officerStatus === 'No Response' ? '⚪' : '🔴'}</span>
          <span>{officerStatus.toUpperCase()}</span>
        </div>

        {syncMessage && (
          <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: '600', marginTop: '8px' }}>
            ✓ {syncMessage}
          </div>
        )}
      </div>

      {/* One-Tap Duty Status Action Buttons */}
      <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#1e293b', marginBottom: '10px' }}>
        UPDATE YOUR DUTY STATUS
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button
          id="btn-status-available"
          onClick={() => handleStatusChange('Available')}
          style={{
            padding: '16px',
            borderRadius: '12px',
            border: '2px solid #10b981',
            backgroundColor: officerStatus === 'Available' ? '#10b981' : '#ffffff',
            color: officerStatus === 'Available' ? '#ffffff' : '#047857',
            fontSize: '1rem',
            fontWeight: '700',
            cursor: 'pointer',
            textAlign: 'left'
          }}
        >
          🟢 Available for Dispatch
        </button>

        <button
          id="btn-status-busy"
          onClick={() => handleStatusChange('Busy')}
          style={{
            padding: '16px',
            borderRadius: '12px',
            border: '2px solid #f59e0b',
            backgroundColor: officerStatus === 'Busy' ? '#f59e0b' : '#ffffff',
            color: officerStatus === 'Busy' ? '#ffffff' : '#b45309',
            fontSize: '1rem',
            fontWeight: '700',
            cursor: 'pointer',
            textAlign: 'left'
          }}
        >
          🟡 On-Site / Busy
        </button>

        <button
          id="btn-status-Shift Ended"
          onClick={() => handleStatusChange('Shift Ended')}
          style={{
            padding: '16px',
            borderRadius: '12px',
            border: '2px solid #ef4444',
            backgroundColor: officerStatus === 'Shift Ended' ? '#ef4444' : '#ffffff',
            color: officerStatus === 'Shift Ended' ? '#ffffff' : '#b91c1c',
            fontSize: '1rem',
            fontWeight: '700',
            cursor: 'pointer',
            textAlign: 'left'
          }}
        >
          🔴 Off-Duty / Shift Ended
        </button>
      </div>
    </div>
  );
}