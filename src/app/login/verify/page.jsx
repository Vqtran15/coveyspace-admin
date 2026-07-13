'use client'

import { useState, useEffect, useRef } from 'react'
import { verifyOtpAction, resendOtpAction } from '@/actions/auth'

export default function VerifyPage() {
  const [code, setCode]         = useState('')
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)
  const [resent, setResent]     = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function handleChange(e) {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6)
    setCode(val)
    setError(null)
    if (val.length === 6) {
      setLoading(true)
      const result = await verifyOtpAction(val)
      if (result?.error) {
        setError(result.error)
        setCode('')
        setLoading(false)
        inputRef.current?.focus()
      }
    }
  }

  async function handleResend() {
    setResending(true)
    setError(null)
    setCode('')
    const result = await resendOtpAction()
    if (result?.error) {
      setError(result.error)
      setResending(false)
      return
    }
    setResent(true)
    setResending(false)
    setCooldown(30)
    inputRef.current?.focus()
  }

  return (
    <div className="min-h-screen bg-sunrise-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <h1 className="text-xl font-bold text-stone-800 mb-1">Check your email</h1>
        <p className="text-sm text-stone-400 mb-6">
          We sent a 6-digit code to your email. Enter it below to continue.
        </p>

        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          value={code}
          onChange={handleChange}
          disabled={loading}
          placeholder="000000"
          className={`w-full border rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-jade transition-colors disabled:opacity-50 ${
            error ? 'border-red-400 bg-red-50' : 'border-stone-200'
          }`}
        />

        {error && <p className="text-xs text-red-500 mt-2 text-center">{error}</p>}
        {resent && !error && <p className="text-xs text-jade mt-2 text-center">Code resent — check your inbox.</p>}

        {loading && (
          <p className="text-xs text-stone-400 mt-2 text-center">Verifying…</p>
        )}

        <div className="mt-6 text-center">
          {cooldown > 0 ? (
            <p className="text-xs text-stone-400">Resend available in {cooldown}s</p>
          ) : (
            <button
              onClick={handleResend}
              disabled={resending}
              className="text-xs text-jade hover:underline disabled:opacity-50"
            >
              {resending ? 'Sending…' : 'Resend code'}
            </button>
          )}
        </div>

        <div className="mt-4 text-center">
          <a href="/login" className="text-xs text-stone-400 hover:underline">
            ← Back to login
          </a>
        </div>
      </div>
    </div>
  )
}
