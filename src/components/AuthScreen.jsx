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
  const [info, setInfo] = useState(null);
  const [isGrowing, setIsGrowing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [checkEmailOpen, setCheckEmailOpen] = useState(false);
  const [checkEmailAddress, setCheckEmailAddress] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const mainColor = '#ee6060';

  const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

  const toDarijaAuthError = (err) => {
    const msg = String(err?.message || '').trim();
    const m = msg.toLowerCase();

    if (!msg) return 'صار مشكل. جرّب مرة أخرى.';

    if (m === 'user_already_registered') return 'الإيميل هذا مسجّل قبل. اعمل تسجيل الدخول.';

    // Supabase common auth messages
    if (m.includes('email not confirmed')) return 'الإيميل موش مفعّل. ادخل للإيميل وكمّل التفعيل.';
    if (m.includes('invalid login credentials')) return 'الإيميل ولا كلمة السرّ غالطين.';
    if (m.includes('user already registered') || m.includes('already registered') || m.includes('user already exists'))
      return 'الإيميل هذا مسجّل قبل. اعمل تسجيل الدخول.';
    if (m.includes('password should be at least') || m.includes('password is too short') || m.includes('at least 6'))
      return 'كلمة السرّ لازمها تكون 6 حروف على الأقل.';
    if (m.includes('signup is disabled')) return 'التسجيل مسكّر توّا. جرّب بعد.';
    if (m.includes('rate limit') || m.includes('too many requests')) return 'برشا محاولات. استنى شوية وعاود.';
    if (m.includes('invalid email')) return 'الإيميل موش صحيح. ثبّت فيه.';
    if (m.includes('email address is invalid')) return 'الإيميل موش صحيح. ثبّت فيه.';
    if (m.includes('jwt expired') || m.includes('token has expired')) return 'السيشن وفات. اعمل تسجيل الدخول من جديد.';

    // Our own / UI validation strings (in case we throw them)
    if (m.includes('passwords do not match')) return 'كلمتي السرّ موش كيف كيف.';
    if (m.includes('username required')) return 'لازم تكتب اسم مستخدم.';

    // Default: don’t show raw English strings
    return 'صار مشكل. ثبّت من المعطيات وعاود جرّب.';
  };

  const emailSuggestion = (() => {
    const e = normalizeEmail(email);
    const at = e.lastIndexOf('@');
    if (at < 0) return null;
    const local = e.slice(0, at);
    const domain = e.slice(at + 1);
    if (!local || !domain) return null;
    const map = {
      'gmail.con': 'gmail.com',
      'gmai.com': 'gmail.com',
      'gmial.com': 'gmail.com',
      'gmal.com': 'gmail.com',
      'hotnail.com': 'hotmail.com',
      'hotmai.com': 'hotmail.com',
      'hotmail.con': 'hotmail.com',
      'outlook.con': 'outlook.com',
      'yaho.com': 'yahoo.com',
      'yahho.com': 'yahoo.com',
      'yahoo.con': 'yahoo.com'
    };
    const suggested = map[domain];
    if (!suggested) return null;
    return `${local}@${suggested}`;
  })();

  React.useEffect(() => {
    if (!resendCooldown) return;
    const t = setInterval(() => setResendCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);
  
  // Disable initial animation
  React.useEffect(() => {
    // Give time for the component to be fully rendered
    const timer = setTimeout(() => setInitialLoad(false), 300);
    return () => clearTimeout(timer);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const normalizedEmail = normalizeEmail(email);

      if (mode === 'signup') {
        if (!username.trim()) throw new Error('لازم تكتب اسم مستخدم');
        if (username.length < 3) throw new Error('اسم المستخدم قصير برشا');
        if (!normalizedEmail) throw new Error('لازم تكتب الإيميل');
        if (confirmPassword !== password) throw new Error('كلمتي السرّ موش كيف كيف');
      }

      let result;
      if (mode === 'signup') {
        result = await supabase.auth.signUp({ email: normalizedEmail, password, options: { data: { username } } });
        // Check if email already exists (Supabase may return success even if email exists)
        if (result.data?.user && result.data.user.identities?.length === 0) {
          throw new Error('USER_ALREADY_REGISTERED');
        }
      } else {
        result = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      }
      if (result.error) throw result.error;
      const user = result.data.user;
      if (mode === 'signup') {
        setCheckEmailAddress(normalizedEmail);
        setCheckEmailOpen(true);
        setInfo(null);
        return;
      }
      if (user) {
        await ensureProfile(user);
        onAuth(user);
      } else {
        setError('تفقد الإيميل متاعك وكمّل التفعيل.');
      }
    } catch (err) {
      setError(toDarijaAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    const targetEmail = String(checkEmailAddress || email || '').trim().toLowerCase();
    if (!targetEmail) return;
    if (resendCooldown > 0) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: targetEmail });
      if (error) throw error;
      setInfo('بعتنالِك إيميل التفعيل مرة أخرى.');
      setResendCooldown(30);
    } catch (err) {
      setError(toDarijaAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const closeCheckEmail = () => {
    if (loading) return;
    setCheckEmailOpen(false);
    setPassword('');
    setConfirmPassword('');
    // After signup, guide user back to sign-in
    setMode('signin');
  };

  return (
    <div className="d-flex align-items-center justify-content-center min-vh-100" style={{background:'linear-gradient(180deg,#343541 0%,#202123 100%)'}}>
      <AnimatePresence>
        {checkEmailOpen && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={closeCheckEmail}
          >
            <motion.div
              className="confirm-modal"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h6>تفقد الإيميل متاعك</h6>
              <p>
                بعثنالِك رسالة تفعيل. افتح الإيميل وكمّل التفعيل، وبعدها اعمل تسجيل دخول.
                <br />
                كان ما لقيتهاش، شوف الـ Spam/Promotions.
              </p>
              {checkEmailAddress && (
                <div className="small" style={{ color: '#d1d1d1', direction: 'ltr', textAlign: 'center', marginBottom: 10 }}>
                  {checkEmailAddress}
                </div>
              )}
              {error && <div className="alert alert-danger py-2 small">{error}</div>}
              {info && <div className="alert alert-info py-2 small">{info}</div>}
              <div className="confirm-actions">
                <button className="btn-cancel" onClick={closeCheckEmail} disabled={loading}>مريقل</button>
                <button className="btn-primary" onClick={resendVerification} disabled={loading}>
                  {loading ? '…' : 'عاود ابعث'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{maxWidth:480,width:'100%',perspective:'1000px',display:'flex',alignItems:'center',justifyContent:'center',minHeight:'700px'}}>
        <motion.div 
          className="auth-card shadow-lg" 
          style={{
            maxWidth:480,width:'100%',borderRadius:24,
            position:'relative',transformStyle:'preserve-3d',
            height: 520 // Default height for initial render
          }}
          initial={{ 
            rotateY: 0, 
            height: 520
          }}
          animate={{ 
            rotateY: mode === 'signup' ? 180 : 0,
            height: (mode === 'signup' && !isGrowing) ? 700 : (mode === 'signin' && isGrowing) ? 520 : (mode === 'signup') ? 700 : 520
          }}
          transition={initialLoad ? { duration: 0 } : { 
            rotateY: { duration: 0.6, ease: "easeInOut", delay: mode === 'signup' ? 0.4 : 0 },
            height: { 
              duration: 0.4, 
              ease: "easeOut",
              delay: mode === 'signin' ? 0.6 : 0
            }
          }}
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
            borderRadius:24,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}>
            <h2 className="mb-3 fw-bold" style={{color:'#fff',fontSize:'1.9rem'}}>TunIA</h2>
            <p className="text-secondary mb-4" style={{fontSize:'0.95rem'}}>ادخل لحسابك باش تبدا تحكي.</p>
            <form onSubmit={submit} className="needs-validation" noValidate>
              <div className="mb-3">
                <label className="form-label text-light">الإيميل</label>
                <input type="email" className="form-control" required disabled={loading}
                  value={email} onChange={e=>setEmail(e.target.value)} style={{direction:'ltr'}} />
                {emailSuggestion && (
                  <div className="small mt-2" style={{ color: '#d1d1d1' }}>
                    تقصد <span style={{ direction: 'ltr', display: 'inline-block' }}>{emailSuggestion}</span>؟
                    <button
                      type="button"
                      className="btn btn-sm btn-link"
                      style={{ color: '#fff', padding: '0 6px' }}
                      onClick={() => setEmail(emailSuggestion)}
                      disabled={loading}
                    >
                      صلّح
                    </button>
                  </div>
                )}
              </div>
              <div className="mb-3">
                <label className="form-label text-light">كلمة السرّ</label>
                <input type="password" className="form-control" required minLength={6} disabled={loading}
                  value={password} onChange={e=>setPassword(e.target.value)} />
              </div>
              {error && <div className="alert alert-danger py-2 small">{error}</div>}
              {info && <div className="alert alert-info py-2 small">{info}</div>}
              <button type="submit" className="btn w-100 fw-semibold" disabled={loading}
                style={{background:mainColor,color:'#fff',border:'none',padding:'12px 14px',borderRadius:14,boxShadow:'0 4px 16px rgba(238,96,96,0.35)'}}>
                {loading ? 'استنى شوية…' : 'تسجيل الدخول'}
              </button>
              <button type="button" className="btn btn-link w-100 mt-2" disabled={loading || !email || resendCooldown > 0}
                onClick={resendVerification} style={{color:'#fff'}}>
                {resendCooldown > 0 ? `عاود ابعث بعد ${resendCooldown}s` : 'عاود ابعث إيميل التفعيل'}
              </button>
            </form>
            <div className="mt-4 d-flex justify-content-between align-items-center">
              <span className="text-secondary" style={{fontSize:'0.85rem'}}>
                ما عندكش حساب؟
              </span>
              <button className="btn btn-sm btn-outline-light" type="button" disabled={loading}
                onClick={() => {
                  setIsGrowing(true);
                  setTimeout(() => {
                    setMode('signup');
                    setTimeout(() => setIsGrowing(false), 50);
                  }, 400); // Wait for height animation to finish before flipping
                }}
                style={{borderRadius:30,padding:'4px 14px',fontSize:'0.75rem',border:'1px solid #666',background:'rgba(255,255,255,0.05)'}}>
                اعمل حساب
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
            transform: 'rotateY(180deg)',
            backfaceVisibility: 'hidden',
            background:'rgba(255,255,255,0.08)',
            backdropFilter:'blur(12px)',
            border:'1px solid rgba(255,255,255,0.15)',
            borderRadius:24,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <h2 className="mb-3 fw-bold" style={{color:'#fff',fontSize:'1.9rem'}}>TunIA</h2>
            <p className="text-secondary mb-4" style={{fontSize:'0.95rem'}}>اعمل حساب جديد.</p>
            <form onSubmit={submit} className="needs-validation d-flex flex-column flex-grow-1" noValidate>
              <div>
                <div className="mb-3">
                  <label className="form-label text-light">اسم المستخدم</label>
                  <input type="text" className="form-control" required minLength={3} maxLength={40} disabled={loading}
                    value={username} onChange={e=>setUsername(e.target.value.replace(/\s+/g,'').toLowerCase())} />
                </div>
                <div className="mb-3">
                  <label className="form-label text-light">الإيميل</label>
                  <input type="email" className="form-control" required disabled={loading}
                    value={email} onChange={e=>setEmail(e.target.value)} style={{direction:'ltr'}} />
                  {emailSuggestion && (
                    <div className="small mt-2" style={{ color: '#d1d1d1' }}>
                      تقصد <span style={{ direction: 'ltr', display: 'inline-block' }}>{emailSuggestion}</span>؟
                      <button
                        type="button"
                        className="btn btn-sm btn-link"
                        style={{ color: '#fff', padding: '0 6px' }}
                        onClick={() => setEmail(emailSuggestion)}
                        disabled={loading}
                      >
                        صلّح
                      </button>
                    </div>
                  )}
                </div>
                <div className="mb-3">
                  <label className="form-label text-light">كلمة السرّ</label>
                  <input type="password" className="form-control" required minLength={6} disabled={loading}
                    value={password} onChange={e=>setPassword(e.target.value)} />
                </div>
                <div className="mb-3">
                  <label className="form-label text-light">عاود كلمة السرّ</label>
                  <input type="password" className="form-control" required minLength={6} disabled={loading}
                    value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} />
                </div>
                {error && <div className="alert alert-danger py-2 small">{error}</div>}
                {info && <div className="alert alert-info py-2 small">{info}</div>}
              </div>
              
              <div className="mt-auto">
                <button type="submit" className="btn w-100 fw-semibold" disabled={loading}
                  style={{background:mainColor,color:'#fff',border:'none',padding:'12px 14px',borderRadius:14,boxShadow:'0 4px 16px rgba(238,96,96,0.35)',marginTop:'auto'}}>
                  {loading ? 'استنى شوية…' : 'إنشاء حساب'}
                </button>
                
                <div className="mt-4 d-flex justify-content-between align-items-center">
                  <span className="text-secondary" style={{fontSize:'0.85rem'}}>
                    عندك حساب؟
                  </span>
                  <button className="btn btn-sm btn-outline-light" type="button" disabled={loading}
                    onClick={() => {
                      setMode('signin');  // First flip
                      setTimeout(() => {
                        setIsGrowing(true);  // Then signal to start shrinking
                        setTimeout(() => {
                          setIsGrowing(false);  // Animation complete
                        }, 400);
                      }, 600);  // Wait for flip to complete
                    }}
                    style={{borderRadius:30,padding:'4px 14px',fontSize:'0.75rem',border:'1px solid #666',background:'rgba(255,255,255,0.05)'}}>
                    تسجيل الدخول
                  </button>
                </div>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
