// Light-first building blocks for the public transparency portal and the
// sign-in screen. The authenticated shell keeps its own dark-mode components;
// nothing here carries a `dark:` variant, so the two systems cannot collide.

import { cloneElement, isValidElement } from 'react'
import { Link } from 'react-router-dom'
import { FOCUS_RING } from './controlStyles'

const CONTAINER_WIDTHS = { default: 'max-w-[1160px]', narrow: 'max-w-[760px]' }

export function Container(props) {
  const { as: Tag = 'div', width = 'default', className = '', children } = props
  return (
    <Tag className={`w-full mx-auto px-5 sm:px-6 lg:px-8 ${CONTAINER_WIDTHS[width] || CONTAINER_WIDTHS.default} ${className}`}>
      {children}
    </Tag>
  )
}

export function Eyebrow({ className = '', children }) {
  return (
    <span className={`inline-block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5E6AD2] ${className}`}>
      {children}
    </span>
  )
}

export function SectionHeading({ eyebrow, title, description, align = 'left', action, id }) {
  const centred = align === 'center'
  return (
    <div className={`flex flex-col gap-2.5 ${centred ? 'items-center text-center' : 'sm:flex-row sm:items-end sm:justify-between sm:gap-8'}`}>
      <div className={`flex flex-col gap-2 ${centred ? 'items-center max-w-[620px]' : 'max-w-[640px]'}`}>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 id={id} className="text-[21px] sm:text-[24px] font-semibold text-[#0D2145] tracking-[-0.02em] leading-tight">
          {title}
        </h2>
        {description && <p className="text-[14px] sm:text-[15px] text-[#64748B] leading-relaxed">{description}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}

export function Surface(props) {
  const { as: Tag = 'div', interactive = false, className = '', children, ...rest } = props
  return (
    <Tag
      className={[
        'bg-[#FFFFFF] border border-[#E2E8F0] rounded-[10px] shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        interactive
          ? 'transition-[border-color,box-shadow,transform] duration-150 hover:border-[#C7CDF5] hover:shadow-[0_6px_20px_rgba(15,23,42,0.07)] hover:-translate-y-[1px]'
          : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </Tag>
  )
}

const BUTTON_VARIANTS = {
  primary: 'bg-[#5E6AD2] text-[#FFFFFF] hover:bg-[#4A56C1] shadow-[0_1px_2px_rgba(15,23,42,0.10)]',
  secondary: 'bg-[#FFFFFF] text-[#0F172A] border border-[#E2E8F0] hover:bg-[#F8FAFC] hover:border-[#CBD5E1]',
  quiet: 'text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9]',
  onDark: 'bg-[rgba(255,255,255,0.10)] text-[#FFFFFF] border border-[rgba(255,255,255,0.22)] hover:bg-[rgba(255,255,255,0.16)]',
}

const BUTTON_SIZES = {
  sm: 'h-9 px-3.5 text-[13px] rounded-[7px]',
  md: 'h-11 px-5 text-[14px] rounded-[8px]',
  lg: 'h-12 px-6 text-[15px] rounded-[8px]',
}

export function Button({ variant = 'primary', size = 'md', to, href, className = '', children, ...rest }) {
  const cls = [
    'inline-flex items-center justify-center gap-2 font-medium transition-colors duration-150 select-none whitespace-nowrap',
    'disabled:opacity-55 disabled:cursor-not-allowed',
    BUTTON_SIZES[size] || BUTTON_SIZES.md,
    BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary,
    FOCUS_RING,
    className,
  ].join(' ')

  if (to) return <Link to={to} className={cls} {...rest}>{children}</Link>
  if (href) return <a href={href} className={cls} {...rest}>{children}</a>
  return <button type="button" className={cls} {...rest}>{children}</button>
}

export function Badge({ className = '', children }) {
  return (
    <span className={`inline-flex items-center text-[11.5px] font-medium px-2.5 py-1 rounded-[6px] whitespace-nowrap ${className}`}>
      {children}
    </span>
  )
}

// `config` is a row from uiStyles' status tables, so the portal and the
// dashboards label and colour a status identically.
export function StatusPill({ config, size = 'md' }) {
  if (!config) return null
  const dims = size === 'sm' ? 'text-[11.5px] px-2 py-0.5 gap-1.5' : 'text-[12.5px] px-2.5 py-1 gap-1.5'
  return (
    <span className={`inline-flex items-center font-semibold rounded-full ${dims} ${config.bg} ${config.color}`}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: config.dot }} />
      {config.text}
    </span>
  )
}

export function ProgressMeter({ value, label = 'Progress', tone = '#5E6AD2', showValue = true }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-medium text-[#64748B]">{label}</span>
        {showValue && <span className="text-[13px] font-semibold text-[#0F172A] tabular-nums">{pct}%</span>}
      </div>
      <div
        className="h-1.5 rounded-full bg-[#EEF1F6] overflow-hidden"
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, backgroundColor: tone }} />
      </div>
    </div>
  )
}

export function DataRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-6 py-3 border-b border-[#F1F5F9] last:border-0 last:pb-0 first:pt-0">
      <dt className="text-[13px] text-[#64748B] flex-shrink-0">{label}</dt>
      <dd className="text-[13px] font-medium text-[#0F172A] text-right break-words min-w-0">{value || '—'}</dd>
    </div>
  )
}

export function Field({ id, label, hint, error, optional = false, children }) {
  const hintId = hint && !error ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  const invalid = error ? true : undefined
  // A function child wires the ids itself, for controls wrapped in extra markup.
  const control = typeof children === 'function'
    ? children({ id, describedBy, invalid })
    : isValidElement(children)
      ? cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': invalid })
      : children

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-baseline gap-2 text-[13px] font-semibold text-[#0F172A]">
        {label}
        {optional && <span className="text-[12px] font-normal text-[#94A3B8]">Optional</span>}
      </label>
      {control}
      {hint && !error && <p id={hintId} className="text-[12px] text-[#94A3B8]">{hint}</p>}
      {error && (
        <p id={errorId} className="flex items-center gap-1.5 text-[12px] font-medium text-[#DC2626]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className="flex-shrink-0">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="7" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          {error}
        </p>
      )}
    </div>
  )
}

export function Notice({ tone = 'info', title, children }) {
  const tones = {
    info: 'bg-[#F5F7FF] border-[#DDE2FB] text-[#3F4899]',
    warning: 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]',
    danger: 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]',
  }
  return (
    <div className={`rounded-[8px] border px-4 py-3 text-[13px] leading-relaxed ${tones[tone] || tones.info}`}>
      {title && <p className="font-semibold mb-0.5">{title}</p>}
      {children}
    </div>
  )
}
