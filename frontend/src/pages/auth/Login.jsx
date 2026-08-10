// Sign-in screen. The backend returns one message for both an unknown email and
// a wrong password, so nothing here can distinguish them either.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { USER_KEY } from '../../services'
import { dashboardPathFor } from '../../router/dashboardPaths'
import CiviqLogo from '../../components/Brand'
import { Button, Field, Notice } from '../../components/public/ui'
import { FOCUS_RING, inputCls } from '../../components/public/controlStyles'

const EyeIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)
const EyeOffIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)

const Spinner = () => (
  <svg width="16" height="16" viewBox="0 0 14 14" fill="none" className="animate-spin" aria-hidden="true">
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
      className="absolute inset-0 opacity-[0.055]"
      aria-hidden="true"
    >
      {[80, 160, 240, 320, 400, 480, 560, 640].map(y => (
        <rect key={`h${y}`} x="0" y={y - 4} width="480" height="8" fill="#FFFFFF" rx="1"/>
      ))}
      {[80, 180, 280, 380, 480].map(x => (
        <rect key={`v${x}`} x={x - 4} y="0" width="8" height="700" fill="#FFFFFF" rx="1"/>
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

  const handleSubmit = async (event) => {
    event.preventDefault()

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
    // until the next render, so route on the persisted role instead. The path
    // comes from the shared table rather than a second copy of the mapping.
    const stored = JSON.parse(localStorage.getItem(USER_KEY) || '{}')
    const destination = dashboardPathFor(stored.role)

    // No dashboard for this role: stay on the form and say so, rather than
    // navigating to /login from /login.
    if (destination) navigate(destination)
    else setError('This account has no dashboard. Contact an administrator.')

    setLoading(false)
  }

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#FFFFFF] overflow-x-hidden">

      {/* Brand panel: the navy that the authenticated application continues into. */}
      <div className="relative flex-shrink-0 bg-[#0D2145] overflow-hidden lg:w-[44%] lg:max-w-[560px] lg:min-h-screen lg:flex lg:flex-col">
        <CityGrid />

        <div className="relative z-10 px-6 sm:px-10 lg:px-14 py-6 lg:pt-12">
          <Link to="/" className={`inline-block rounded-[6px] ${FOCUS_RING} focus-visible:ring-offset-[#0D2145]`}>
            <CiviqLogo size={30} tone="onDark" />
          </Link>
        </div>

        <div className="relative z-10 hidden lg:flex flex-1 flex-col justify-center px-14">
          <span className="w-fit text-[11px] font-semibold uppercase tracking-[0.09em] px-3 py-1.5 rounded-full bg-[rgba(94,106,210,0.22)] text-[#9BA3F0]">
            Ghaziabad Municipal Corporation
          </span>

          <p className="mt-6 text-[40px] font-extrabold text-[#FFFFFF] leading-[1.05] tracking-[-0.03em]">
            Plan together.<br />Build once.
          </p>

          <p className="mt-5 text-[15px] leading-[1.7] text-[rgba(255,255,255,0.46)] max-w-[320px]">
            The infrastructure coordination platform that stops city departments from digging up the same road twice.
          </p>
        </div>

        <div className="relative z-10 hidden lg:block px-14 pb-10">
          <p className="text-[12px] text-[rgba(255,255,255,0.22)]">
            CIVIQ · Ghaziabad Municipal Corporation
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-5 sm:px-8 py-10 sm:py-14">
        <div className="w-full max-w-[400px]">

          <div className="flex flex-col gap-2 mb-8 sm:mb-10">
            <h1 className="text-[26px] sm:text-[28px] font-bold text-[#0D2145] tracking-[-0.025em] leading-tight">
              Sign in to your account
            </h1>
            <p className="text-[14.5px] text-[#64748B]">Enter your work credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
            <Field id="email" label="Work email">
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="you@civiq.in"
                autoComplete="email"
                className={inputCls}
              />
            </Field>

            <Field id="password" label="Password">
              {({ id }) => (
              <div className="relative flex items-center">
                <input
                  id={id}
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={`${inputCls} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  className={`absolute right-2 w-8 h-8 inline-flex items-center justify-center rounded-[6px] text-[#94A3B8] hover:text-[#475569] hover:bg-[#F1F5F9] transition-colors ${FOCUS_RING}`}
                >
                  {showPass ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              )}
            </Field>

            {error && (
              <div role="alert">
                <Notice tone="danger">{error}</Notice>
              </div>
            )}

            <Button type="submit" size="md" disabled={loading} className="w-full mt-1">
              {loading ? <><Spinner /><span>Signing in...</span></> : 'Sign in'}
            </Button>
          </form>

          {/* Secondary action: back to the public portal, not another sign-in path. */}
          <div className="mt-6 flex flex-col items-center gap-3 text-center">
            <Link to="/" className={`text-[13px] font-medium text-[#64748B] hover:text-[#5E6AD2] transition-colors rounded-[4px] ${FOCUS_RING}`}>
              ← Back to public portal
            </Link>
            <p className="text-[13px] text-[#94A3B8] leading-relaxed">
              Having trouble signing in?{' '}
              <span className="text-[#64748B] font-medium">Contact your system administrator.</span>
            </p>
          </div>

        </div>
      </div>

    </div>
  )
}
