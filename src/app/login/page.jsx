'use client'

import { useState } from 'react'
import { loginAction } from '@/actions/auth'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const result = await loginAction(password)
    if (result?.error) {
      setError(result.error)
      setPassword('')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-sunrise-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <h1 className="text-xl font-bold text-stone-800 mb-1">Community Admin</h1>
        <p className="text-sm text-stone-400 mb-6">Enter password to continue</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            autoFocus
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(null) }}
            placeholder="Password"
            className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jade ${
              error ? 'border-red-400 bg-red-50' : 'border-stone-200'
            }`}
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-jade text-white rounded-xl py-2.5 text-sm font-medium hover:bg-jade-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Checking…' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  )
}
