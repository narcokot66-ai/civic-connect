import React, { useState } from 'react';
import axios from 'axios';
import { translations } from '../translations';

export default function Login() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [lang, setLang] = useState(localStorage.getItem('appLang') || 'en');
  
  const t = translations[lang];
  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullname, setFullname] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegistering) {
        // Registration API call (Role locked to 'citizen' for security)
        await axios.post(`http://${window.location.hostname}:8000/register`, {
          fullname,
          email,
          password,
          role: 'citizen'
        });
        
        setIsRegistering(false);
        setLoading(false);
        alert('Account created successfully! Please sign in.');
      } else {
        // Login API call
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);

        const response = await axios.post(`http://${window.location.hostname}:8000/login`, formData, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });
     
const { 
  access_token, 
  role: userRole, 
  fullname: userFullname, 
  email: userEmail, 
  department: userDept, 
  id: userId 
} = response.data;

const isMobile =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
  window.innerWidth <= 768;

if (isMobile && (userRole === 'AUTHORITY' || userRole === 'ADMIN')) {
  setLoading(false);
  alert('Access Restricted: Authority and Admin portals are only accessible on a Desktop/PC.');
  return;
}
localStorage.setItem('token', access_token);
localStorage.setItem('role', userRole);
localStorage.setItem('name', userFullname || '');
localStorage.setItem('userName', userFullname || '');
localStorage.setItem('email', userEmail || '');
localStorage.setItem('userEmail', userEmail || '');
localStorage.setItem('userId', userId || '');

// Store the assigned department dynamically (lowercased)
// Extract department cleanly from API response
const fetchedDept = response.data.department_name || response.data.department || response.data.dept || response.data.user?.department || userDept || '';

const finalDept = fetchedDept || '';

if (finalDept) {
  localStorage.setItem('department', finalDept.toLowerCase());
} else {
  localStorage.setItem('department', '');
}

window.location.href = '/dashboard';
      }
    } catch (err) {
  setLoading(false);
  const detail = err.response?.data?.detail || err.message || String(err);
  setError(`Debug: ${typeof detail === 'object' ? JSON.stringify(detail) : detail}`);
}
  };
  
  return (
    <div style={{ fontFamily: '"Inter", system-ui, -apple-system, sans-serif', minHeight: '100vh', display: 'flex', background: '#f8fafc', overflow: 'hidden' }}>
      
      {/* CSS Keyframe Animations & Micro-interactions */}
      <style>{`
        @keyframes slideFadeIn {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes pulseGlow {
          0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.25; }
          50% { transform: scale(1.1) rotate(6deg); opacity: 0.45; }
        }

        .animated-form {
          animation: slideFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .smooth-input {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .smooth-input:focus {
          border-color: #4f46e5 !important;
          box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.12);
          background: #ffffff !important;
        }

        .action-btn {
          transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.2s ease;
        }

        .action-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(79, 70, 229, 0.3) !important;
        }

        .action-btn:active {
          transform: translateY(0);
        }

        .toggle-btn {
          transition: opacity 0.2s ease;
        }

        .toggle-btn:hover {
          text-decoration: underline;
          opacity: 0.85;
        }
      `}</style>

      {/* Left Decorative Brand Panel */}
<div style={{
  flex: 1,
  background: 'linear-gradient(135deg, #3d2314 0%, #5c3a21 50%, #7c4a2a 100%)',
  color: 'white',
  padding: '60px',
  flexDirection: 'column',
  justifyContent: 'space-between',
  position: 'relative',
  overflow: 'hidden',
  display: window.innerWidth < 768 ? 'none' : 'flex'
}}>
  
  {/* Top Logo Header */}
  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', zIndex: 2 }}>
    <div style={{ background: 'rgba(255,255,255,0.15)', padding: '10px 16px', borderRadius: '12px', fontWeight: '800' }}>
      C
    </div>
    <span style={{ fontSize: '20px', fontWeight: '700' }}>Civic Connect</span>
  </div>

  {/* Main Dynamic Headline & Subtitle */}
  <div style={{ maxWidth: '480px', zIndex: 2 }}>
    <h1 style={{ fontSize: '36px', fontWeight: '800', lineHeight: 1.2, marginBottom: '20px' }}>
      {isRegistering ? t.brandTitleRegister : t.brandTitleLogin}
    </h1>
    <p style={{ fontSize: '15px', lineHeight: 1.6, opacity: 0.85 }}>
      {isRegistering ? t.brandDescRegister : t.brandDescLogin}
    </p>
  </div>

  {/* Footer Copyright Text */}
  <div style={{ fontSize: '12px', opacity: 0.6, zIndex: 2 }}>
    {t.copyright}
  </div>

</div>

      {/* Right Form Container */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#833e1e' }}>
        
        {/* Animated Container Card */}
        <div 
          key={isRegistering ? 'register' : 'login'} 
          className="animated-form" 
          style={{ position: 'relative', width: '100%', maxWidth: '420px', background: 'white', padding: '40px', borderRadius: '24px' }}
        >
          {/* LANGUAGE SELECTOR DROPDOWN */}
<div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10 }}>
  <select
    value={lang}
    onChange={(e) => {
      const selectedLang = e.target.value;
      setLang(selectedLang);
      localStorage.setItem('appLang', selectedLang);
    }}
    style={{
      background: '#8194a8',
      border: '1px solid #000000',
      padding: '6px 12px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: '600',
      color: '#334155',
      cursor: 'pointer',
      outline: 'none'
    }}
  >
    <option value="en">🌐 English</option>
    <option value="kok">🏖️ कोंकणी</option>
  </select>
</div>
          <div style={{ marginBottom: '28px' }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em' }}>
              {isRegistering ? t.createAccount : t.welcome}
            </h2>
            <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
              {isRegistering ? t.registerSubtitle : t.loginSubtitle}
            </p>
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '12px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: '600', marginBottom: '20px' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {isRegistering && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>{t.fullName}</label>
                <input 
                  className="smooth-input"
                  type="text" 
                  placeholder="John Cruz" 
                  value={fullname}
                  onChange={(e) => setFullname(e.target.value)}
                  required
                  style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc', outline: 'none' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>{t.email}</label>
              <input 
                className="smooth-input"
                type="email" 
                placeholder="name@example.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>{t.password}</label>
              <input 
                className="smooth-input"
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc', outline: 'none' }}
              />
            </div>

            <button 
              className="action-btn"
              type="submit" 
              disabled={loading}
              style={{ background: '#5c3a21', color: 'white', border: 'none', padding: '14px', borderRadius: '12px', cursor: 'pointer', fontWeight: '700', fontSize: '15px', marginTop: '6px', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)' }}
            >
              {loading ? '...' : (isRegistering ? t.signUp : t.signIn)}
            </button>
          </form>

          <p style={{ textAlign: 'center', margin: '24px 0 0 0', fontSize: '14px', color: '#64748b' }}>
            {isRegistering ? t.alreadyHaveAccount : t.noAccount}{' '}
            <button 
              type="button"
              className="toggle-btn"
              onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
              style={{ background: 'none', border: 'none', color: '#664427', textDecoration: 'none', fontWeight: '700', cursor: 'pointer', padding: 0, fontSize: '14px' }}
            >
              {isRegistering ? t.signInLink : t.registerLink}
            </button>
          </p>

        </div>
      </div>

    </div>
  );
}