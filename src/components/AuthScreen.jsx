import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, ensureProfile } from '../../supabaseClient';

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const mainColor = '#ee6060';

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signup') {
        if (!username.trim()) throw new Error('Username required');
        if (username.length < 3) throw new Error('Username too short');
        if (confirmPassword !== password) throw new Error('Passwords do not match');
      }

      let result;
      if (mode === 'signup') {
        result = await supabase.auth.signUp({ email, password, options: { data: { username } } });
      } else {
        result = await supabase.auth.signInWithPassword({ email, password });
      }
      if (result.error) throw result.error;
      const user = result.data.user;
      if (user) {
        await ensureProfile(user);
        if (mode === 'signup' && username) {
          // Update profile display name with chosen username
            await supabase.from('profiles').update({ display_name: username }).eq('user_id', user.id);
        }
        onAuth(user);
      } else {
        setError('Check your email to confirm.');
      }
    } catch (err) {
      setError(err.message || 'Auth error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="d-flex align-items-center justify-content-center min-vh-100" style={{background:'linear-gradient(180deg,#343541 0%,#202123 100%)'}}>
      <div style={{maxWidth:480,width:'100%',perspective:'1000px'}}>
        <motion.div 
          className="auth-card shadow-lg" 
          style={{
            maxWidth:480,width:'100%',borderRadius:24,
            minHeight:520,position:'relative',transformStyle:'preserve-3d'
          }}
          animate={{ rotateY: mode === 'signup' ? 180 : 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        >
          {/* Front face - Sign In */}
          <div className="p-4 p-md-5" style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0,
            backfaceVisibility: 'hidden',
            transform: 'rotateY(0deg)',
            background:'rgba(255,255,255,0.08)',
            backdropFilter:'blur(12px)',
            border:'1px solid rgba(255,255,255,0.15)',
            borderRadius:24
          }}>
            <h2 className="mb-3 fw-bold" style={{color:'#fff',fontSize:'1.9rem'}}>TUNIA</h2>
            <p className="text-secondary mb-4" style={{fontSize:'0.95rem'}}>Sign in to start chatting in Tunisian Darija.</p>
            <form onSubmit={submit} className="needs-validation" noValidate>
              <div className="mb-3">
                <label className="form-label text-light">Email</label>
                <input type="email" className="form-control" required disabled={loading}
                  value={email} onChange={e=>setEmail(e.target.value)} style={{direction:'ltr'}} />
              </div>
              <div className="mb-3">
                <label className="form-label text-light">Password</label>
                <input type="password" className="form-control" required minLength={6} disabled={loading}
                  value={password} onChange={e=>setPassword(e.target.value)} />
              </div>
              {error && <div className="alert alert-danger py-2 small">{error}</div>}
              <button type="submit" className="btn w-100 fw-semibold" disabled={loading}
                style={{background:mainColor,color:'#fff',border:'none',padding:'12px 14px',borderRadius:14,boxShadow:'0 4px 16px rgba(238,96,96,0.35)'}}>
                {loading ? 'Please wait…' : 'Sign in'}
              </button>
            </form>
            <div className="mt-4 d-flex justify-content-between align-items-center">
              <span className="text-secondary" style={{fontSize:'0.85rem'}}>
                Don't have an account?
              </span>
              <button className="btn btn-sm btn-outline-light" type="button" disabled={loading}
                onClick={()=>setMode('signup')}
                style={{borderRadius:30,padding:'4px 14px',fontSize:'0.75rem',border:'1px solid #666',background:'rgba(255,255,255,0.05)'}}>
                Create one
              </button>
            </div>
          </div>

          {/* Back face - Sign Up */}
          <div className="p-4 p-md-5" style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0,
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            background:'rgba(255,255,255,0.08)',
            backdropFilter:'blur(12px)',
            border:'1px solid rgba(255,255,255,0.15)',
            borderRadius:24
          }}>
            <h2 className="mb-3 fw-bold" style={{color:'#fff',fontSize:'1.9rem'}}>TUNIA</h2>
            <p className="text-secondary mb-4" style={{fontSize:'0.95rem'}}>Sign up to start chatting in Tunisian Darija.</p>
            <form onSubmit={submit} className="needs-validation" noValidate>
              <div className="mb-3">
                <label className="form-label text-light">Username</label>
                <input type="text" className="form-control" required minLength={3} maxLength={40} disabled={loading}
                  value={username} onChange={e=>setUsername(e.target.value.replace(/\s+/g,'').toLowerCase())} />
              </div>
              <div className="mb-3">
                <label className="form-label text-light">Email</label>
                <input type="email" className="form-control" required disabled={loading}
                  value={email} onChange={e=>setEmail(e.target.value)} style={{direction:'ltr'}} />
              </div>
              <div className="mb-3">
                <label className="form-label text-light">Password</label>
                <input type="password" className="form-control" required minLength={6} disabled={loading}
                  value={password} onChange={e=>setPassword(e.target.value)} />
              </div>
              <div className="mb-3">
                <label className="form-label text-light">Confirm Password</label>
                <input type="password" className="form-control" required minLength={6} disabled={loading}
                  value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} />
              </div>
              {error && <div className="alert alert-danger py-2 small">{error}</div>}
              <button type="submit" className="btn w-100 fw-semibold" disabled={loading}
                style={{background:mainColor,color:'#fff',border:'none',padding:'12px 14px',borderRadius:14,boxShadow:'0 4px 16px rgba(238,96,96,0.35)'}}>
                {loading ? 'Please wait…' : 'Create account'}
              </button>
            </form>
            <div className="mt-4 d-flex justify-content-between align-items-center">
              <span className="text-secondary" style={{fontSize:'0.85rem'}}>
                Already have an account?
              </span>
              <button className="btn btn-sm btn-outline-light" type="button" disabled={loading}
                onClick={()=>setMode('signin')}
                style={{borderRadius:30,padding:'4px 14px',fontSize:'0.75rem',border:'1px solid #666',background:'rgba(255,255,255,0.05)'}}>
                Sign in
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
