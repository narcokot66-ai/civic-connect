import React, { useState } from 'react';
import axios from 'axios';


export default function Login() {
  const [isRegistering, setIsRegistering] = useState(false);
  
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
        await axios.post('http://localhost:8000/register', {
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

        const response = await axios.post('http://localhost:8000/login', formData, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });

        const { access_token, role: userRole, fullname: userFullname } = response.data;
        localStorage.setItem('token', access_token);
        localStorage.setItem('role', userRole);
        localStorage.setItem('fullname', userFullname);

        window.location.href = '/dashboard';
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Authentication failed. Please check your credentials.');
      setLoading(false);
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
        boxShadow: 'inset -10px 0 20px rgba(0,0,0,0.05)',
        position: 'relative',
        overflow: 'hidden',
        display: window.innerWidth < 768 ? 'none' : 'flex'
      }}>
        {/* Background Ambient Pulse Glow */}
        <div style={{
          position: 'absolute',
          top: '-15%',
          left: '-15%',
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 70%)',
          borderRadius: '50%',
          animation: 'pulseGlow 9s ease-in-out infinite',
          pointerEvents: 'none'
        }} />

        {/* Top Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', zIndex: 2 }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.2)', backdropFilter: 'blur(12px)', color: 'white', width: '44px', height: '44px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '20px', border: '1px solid rgba(255,255,255,0.3)' }}>
            C
          </div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', letterSpacing: '-0.02em' }}>Civic Connect</h2>
        </div>

        {/* Dynamic Copy */}
        <div style={{ maxWidth: '440px', zIndex: 2 }}>
          <h1 style={{ fontSize: '38px', fontWeight: '800', lineHeight: '1.2', margin: '0 0 16px 0', letterSpacing: '-0.03em' }}>
            {isRegistering ? 'Join the Municipal Network' : 'Civic Issue Management and Resolution System'}
          </h1>
          <p style={{ fontSize: '15px', lineHeight: '1.6', opacity: 0.9, margin: 0 }}>
            {isRegistering 
              ? 'Create an account to report local infrastructure issues, track progress, or manage regional workflows.'
              : 'Empowering citizens and authorities to track, manage, and resolve local infrastructure and civic issues efficiently in real-time.'}
          </p>
        </div>

        {/* Footer */}
        <p style={{ fontSize: '13px', opacity: 0.75, margin: 0, zIndex: 2 }}>
          © 2026 Civic Connect Portal. All rights reserved.
        </p>
      </div>

      {/* Right Form Container */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#f8fafc' }}>
        
        {/* Animated Container Card */}
        <div 
          key={isRegistering ? 'register' : 'login'} 
          className="animated-form" 
          style={{ width: '100%', maxWidth: '420px', background: 'white', padding: '40px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 20px 30px -10px rgba(0, 0, 0, 0.05), 0 10px 15px -5px rgba(0, 0, 0, 0.03)' }}
        >
          <div style={{ marginBottom: '28px' }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em' }}>
              {isRegistering ? 'Create an account' : 'Welcome back'}
            </h2>
            <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
              {isRegistering ? 'Enter your details to get started with Civic Connect.' : 'Please enter your credentials to access your portal.'}
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
                <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>Full Name</label>
                <input 
                  className="smooth-input"
                  type="text" 
                  placeholder="John Doe" 
                  value={fullname}
                  onChange={(e) => setFullname(e.target.value)}
                  required
                  style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc', outline: 'none' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>Email Address</label>
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
              <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>Password</label>
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
              {loading ? (isRegistering ? 'Creating account...' : 'Signing in...') : (isRegistering ? 'Sign Up' : 'Sign In')}
            </button>
          </form>

          <p style={{ textAlign: 'center', margin: '24px 0 0 0', fontSize: '14px', color: '#64748b' }}>
            {isRegistering ? 'Already have an account? ' : "Don't have an account? "}
            <button 
              type="button"
              className="toggle-btn"
              onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
              style={{ background: 'none', border: 'none', color: '#664427', textDecoration: 'none', fontWeight: '700', cursor: 'pointer', padding: 0, fontSize: '14px' }}
            >
              {isRegistering ? 'Sign In' : 'Register'}
            </button>
          </p>

        </div>
      </div>

    </div>
  );
}