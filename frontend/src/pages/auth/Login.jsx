// Sign-in screen. The backend returns one message for both an unknown email and
// a wrong password, so nothing here can distinguish them either.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { USER_KEY } from '../../services'

const LOGO_SIZE = 34

function CiviqLogo({ size = LOGO_SIZE, dark = false }) {
  const road = dark ? '#FFFFFF' : '#0D2145'
  const lane = dark ? 'rgba(255,255,255,0.35)' : 'rgba(13,33,69,0.35)'
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect x="0"    y="11.5" width="28"   height="5"    fill={road} rx="0.5"/>
      <rect x="11.5" y="0"    width="5"    height="28"   fill={road} rx="0.5"/>
      <rect x="0"    y="10"   width="10.5" height="1.5"  fill={lane}/>
      <rect x="17.5" y="10"   width="10.5" height="1.5"  fill={lane}/>
      <rect x="0"    y="16.5" width="10.5" height="1.5"  fill={lane}/>
      <rect x="17.5" y="16.5" width="10.5" height="1.5"  fill={lane}/>
      <rect x="10"   y="0"    width="1.5"  height="10.5" fill={lane}/>
      <rect x="16.5" y="0"    width="1.5"  height="10.5" fill={lane}/>
      <rect x="10"   y="17.5" width="1.5"  height="10.5" fill={lane}/>
      <rect x="16.5" y="17.5" width="1.5"  height="10.5" fill={lane}/>
      <circle cx="14" cy="14" r="3.5" fill="#5E6AD2"/>
      <circle cx="14" cy="14" r="1.5" fill="white"/>
    </svg>
  )
}

function LogoWordmark({ size = LOGO_SIZE, dark = false }) {
  const textColor = dark ? '#FFFFFF' : '#0D2145'
  return (
    <svg
      viewBox="0 0 108 28"
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <text x="0"  y="22" fontFamily="'Inter', sans-serif" fontSize="24" fontWeight="800" letterSpacing="-0.5" fill={textColor}>C</text>
      <text x="19" y="22" fontFamily="'Inter', sans-serif" fontSize="24" fontWeight="800" fill={textColor}>ı</text>
      <circle cx="22" cy="3" r="2.5" fill="#5E6AD2"/>
      <text x="26" y="22" fontFamily="'Inter', sans-serif" fontSize="24" fontWeight="800" fill={textColor}>V</text>
      <text x="44" y="22" fontFamily="'Inter', sans-serif" fontSize="24" fontWeight="800" fill={textColor}>ı</text>
      <circle cx="48" cy="3" r="2.5" fill="#5E6AD2"/>
      <text x="51" y="22" fontFamily="'Inter', sans-serif" fontSize="24" fontWeight="800" fill={textColor}>Q</text>
    </svg>
  )
}

const EyeIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)
const EyeOffIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)

const Spinner = () => (
  <svg width="16" height="16" viewBox="0 0 14 14" fill="none" className="animate-spin">
    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5"/>
    <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

function CityGrid() {
  return (
    <svg
      width="100%" height="100%"
      viewBox="0 0 480 700"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, opacity: 0.055 }}
      aria-hidden="true"
    >
      {[80, 160, 240, 320, 400, 480, 560, 640].map(y => (
        <rect key={`h${y}`} x="0" y={y - 4} width="480" height="8" fill="white" rx="1"/>
      ))}
      {[80, 180, 280, 380, 480].map(x => (
        <rect key={`v${x}`} x={x - 4} y="0" width="8" height="700" fill="white" rx="1"/>
      ))}
      {[80, 160, 240, 320, 400, 480, 560].flatMap(y =>
        [80, 180, 280, 380].map(x => (
          <circle key={`d${x}${y}`} cx={x} cy={y} r="5" fill="#5E6AD2"/>
        ))
      )}
    </svg>
  )
}

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const { login } = useAuth()
  const navigate  = useNavigate()

const handleSubmit = async () => {
  if (!email || !password) {
    setError('Please enter your email and password.')
    return
  }
  setError('')
  setLoading(true)

  // Resolves to null on success, or the backend's error message on failure.
  const errorMsg = await login(email, password)

  if (errorMsg) {
    setError(errorMsg)
    setLoading(false)
    return
  }

  // Read back from storage: the `user` state set by login() is not visible
  // until the next render, so route on the persisted role instead.
  const stored = JSON.parse(localStorage.getItem(USER_KEY) || '{}')
  if (stored.role === 'admin')           navigate('/admin/dashboard')
  else if (stored.role === 'officer')    navigate('/officer/dashboard')
  else if (stored.role === 'supervisor') navigate('/supervisor/dashboard')
  else                                   navigate('/login')
  setLoading(false)
}

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSubmit() }

  const inputStyle = (hasErr) => ({
    width: '100%',
    height: '44px',
    borderRadius: '8px',
    border: `1px solid ${hasErr ? '#DC2626' : '#E2E8F0'}`,
    padding: '0 14px',
    fontSize: '15px',
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    outline: 'none',
    fontFamily: "'Inter', sans-serif",
    boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  })

  const onFocusStyle = (e, hasErr) => {
    e.target.style.borderColor = hasErr ? '#DC2626' : '#5E6AD2'
    e.target.style.boxShadow   = hasErr ? '0 0 0 3px rgba(220,38,38,0.1)' : '0 0 0 3px rgba(94,106,210,0.12)'
  }
  const onBlurStyle = (e, hasErr) => {
    e.target.style.borderColor = hasErr ? '#DC2626' : '#E2E8F0'
    e.target.style.boxShadow   = 'none'
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', fontFamily: "'Inter', sans-serif" }}>

      <div style={{
        width: '42%',
        flexShrink: 0,
        backgroundColor: '#0D2145',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <CityGrid />

        <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', gap: '12px', padding: '44px 52px 0' }}>
          <CiviqLogo size={LOGO_SIZE} dark={true} />
          <LogoWordmark size={LOGO_SIZE} dark={true} />
        </div>

        <div style={{ position: 'relative', zIndex: 10, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 52px' }}>

          <div style={{ marginBottom: '24px' }}>
            <span style={{
              display: 'inline-block',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '5px 12px',
              borderRadius: '999px',
              backgroundColor: 'rgba(94,106,210,0.22)',
              color: '#9BA3F0',
            }}>
              Ghaziabad Municipal Corporation
            </span>
          </div>

          <h1 style={{
            fontSize: '40px',
            fontWeight: 800,
            color: '#FFFFFF',
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            margin: '0 0 22px',
          }}>
            Plan together.<br />Build once.
          </h1>

          <p style={{
            fontSize: '15px',
            lineHeight: 1.7,
            color: 'rgba(255,255,255,0.46)',
            maxWidth: '300px',
            margin: 0,
          }}>
            The infrastructure coordination platform that stops city departments from digging up the same road twice.
          </p>

        </div>

        <div style={{ position: 'relative', zIndex: 10, padding: '0 52px 40px' }}>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)', margin: 0 }}>
            © 2025 CIVIQ · Ghaziabad Municipal Corporation
          </p>
        </div>
      </div>

      <div style={{
        flex: 1,
        backgroundColor: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflowY: 'auto',
        padding: '60px 48px',
      }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>

          <div style={{ marginBottom: '44px' }}>
            <h2 style={{
              fontSize: '28px',
              fontWeight: 700,
              color: '#0F172A',
              letterSpacing: '-0.025em',
              lineHeight: 1.2,
              margin: '0 0 12px',
            }}>
              Sign in to your account
            </h2>
            <p style={{ fontSize: '15px', color: '#6B7280', margin: 0, lineHeight: 1.5 }}>
              Enter your work credentials to continue
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label htmlFor="email" style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', lineHeight: 1 }}>
                Work Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                onKeyDown={handleKeyDown}
                placeholder="you@civiq.in"
                autoComplete="email"
                style={inputStyle(!!error)}
                onFocus={e => onFocusStyle(e, !!error)}
                onBlur={e => onBlurStyle(e, !!error)}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label htmlFor="password" style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', lineHeight: 1 }}>
                Password
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  onKeyDown={handleKeyDown}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{ ...inputStyle(!!error), paddingRight: '44px' }}
                  onFocus={e => onFocusStyle(e, !!error)}
                  onBlur={e => onBlurStyle(e, !!error)}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  tabIndex={-1}
                  style={{
                    position: 'absolute', right: '14px',
                    color: '#9CA3AF', background: 'none', border: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0,
                  }}
                >
                  {showPass ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 14px', borderRadius: '8px',
                backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
              }}>
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" style={{ color: '#DC2626', flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
                <p style={{ fontSize: '13px', color: '#B91C1C', margin: 0 }}>{error}</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              style={{
                width: '100%', height: '44px',
                borderRadius: '8px',
                backgroundColor: '#5E6AD2',
                color: '#FFFFFF',
                fontSize: '15px', fontWeight: 500,
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: "'Inter', sans-serif",
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                transition: 'background-color 0.15s, transform 0.1s',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.backgroundColor = '#4A56C1' }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.backgroundColor = '#5E6AD2' }}
              onMouseDown={e => { if (!loading) e.currentTarget.style.transform = 'scale(0.99)' }}
              onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              {loading ? <><Spinner /><span>Signing in...</span></> : 'Sign in'}
            </button>

          </div>

          <p style={{ textAlign: 'center', fontSize: '13px', color: '#9CA3AF', marginTop: '36px', lineHeight: 1.6 }}>
            Having trouble signing in?{' '}
            <span style={{ color: '#6B7280', fontWeight: 500 }}>Contact your system administrator.</span>
          </p>

        </div>
      </div>

    </div>
  )
}
