// Create / edit form for a department. Shared by the list and the detail screen
// so the field set, validation and error handling exist once.
//
// `isActive` is deliberately absent: the backend refuses it on POST and PUT and
// exposes activation through PATCH /api/departments/:id/status instead, which
// both screens drive from their own status control.

import { useState } from 'react'
import { normaliseError } from '../services'
import { inputCls, labelCls } from './uiStyles'

const DEFAULT_COLOR = '#5E6AD2'

export default function DepartmentFormModal({ mode = 'create', department, onClose, onSubmit }) {
  const editing = mode === 'edit'
  const [form, setForm] = useState({
    name: department?.name || '',
    code: department?.code || '',
    description: department?.description || '',
    color: department?.color || DEFAULT_COLOR,
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  // Presence only. Uniqueness, the code's casing and every other rule stay with
  // the backend, whose message is shown verbatim when it refuses.
  async function handleSubmit() {
    if (!form.name.trim() || !form.code.trim()) {
      setError('A department name and code are required.')
      return
    }
    setError('')
    setSaving(true)
    try {
      await onSubmit({
        name: form.name.trim(),
        code: form.code.trim(),
        description: form.description.trim(),
        color: form.color,
      })
      onClose()
    } catch (err) {
      setError(normaliseError(err).message || 'Could not save the department.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-[#FFFFFF] dark:bg-[#1C1C1F] border border-[#E5E5E5] dark:border-[#27272A] rounded-[12px] p-6 w-full max-w-md mx-4"
        style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[16px] font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
            {editing ? 'Edit department' : 'Create new department'}
          </h3>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className={labelCls}>Department name</label>
            <input className={inputCls} placeholder="e.g. Public Works Department" value={form.name} onChange={set('name')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Code</label>
              {/* Stored uppercase by the schema, so the field shows what will
                  actually be saved rather than what was typed. */}
              <input className={inputCls} placeholder="e.g. PWD" value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
            </div>
            <div>
              <label className={labelCls}>Colour</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.color} onChange={set('color')}
                  aria-label="Department colour"
                  className="h-10 w-12 flex-shrink-0 rounded-[8px] border border-[#E2E8F0] dark:border-[#27272A] bg-[#FFFFFF] dark:bg-[#18181B] cursor-pointer" />
                <input className={inputCls} value={form.color} onChange={set('color')} placeholder="#5E6AD2" />
              </div>
            </div>
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <input className={inputCls} placeholder="Optional" value={form.description} onChange={set('description')} />
          </div>
          {error && <p className="text-[13px] text-[#DC2626] dark:text-[#F87171]">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 text-[13px] font-medium text-[#6B7280] border border-[#E2E8F0] dark:border-[#27272A] rounded-[6px] hover:bg-[#F8FAFC] dark:hover:bg-[#18181B] disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-4 py-2 text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Create department'}
          </button>
        </div>
      </div>
    </div>
  )
}
