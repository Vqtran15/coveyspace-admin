'use client'

import { useEffect, useRef, useState } from 'react'
import { logoutAction } from '@/actions/auth'

const IDLE_MS = 30 * 60 * 1000       // 30 min → auto logout
const WARN_MS = 25 * 60 * 1000       // 25 min → show warning
const EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll']

export default function IdleLogout() {
  const [warning, setWarning] = useState(false)
  const timerRef = useRef(null)
  const warnRef = useRef(null)

  function reset() {
    setWarning(false)
    clearTimeout(timerRef.current)
    clearTimeout(warnRef.current)
    warnRef.current = setTimeout(() => setWarning(true), WARN_MS)
    timerRef.current = setTimeout(async () => {
      await logoutAction()
    }, IDLE_MS)
  }

  useEffect(() => {
    reset()
    EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }))
    return () => {
      clearTimeout(timerRef.current)
      clearTimeout(warnRef.current)
      EVENTS.forEach(e => window.removeEventListener(e, reset))
    }
  }, [])

  if (!warning) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 mb-4">Session expiring</div>
        <h2 className="text-lg font-bold text-stone-800 mb-2">Still there?</h2>
        <p className="text-sm text-stone-500 mb-6">
          You'll be logged out in 5 minutes due to inactivity.
        </p>
        <button
          onClick={reset}
          className="w-full bg-jade text-white rounded-xl py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Stay logged in
        </button>
      </div>
    </div>
  )
}
