'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Sparkles, ShieldAlert } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return

    try {
      setLoading(true)
      setError(null)
      
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) throw signInError

      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      console.error('Login authentication error:', err)
      setError(err instanceof Error ? err.message : 'Authentication failed. Please verify credentials.')
    } finally {
      setLoading(false)
    }
  }

  const isDev = process.env.NODE_ENV === 'development'

  return (
    <div className="bg-white dark:bg-white/10 dark:backdrop-blur-xl border border-slate-200 dark:border-white/20 rounded-2xl p-8 shadow-xl dark:shadow-2xl flex flex-col gap-6 w-full transition-colors duration-300">
      
      {/* Clinic Header Branding */}
      <div className="flex flex-col items-center text-center gap-2">
        <div className="bg-blue-100 dark:bg-blue-600/20 border border-blue-300 dark:border-blue-500/30 p-3 rounded-2xl text-blue-600 dark:text-blue-400 shadow-sm">
          <Sparkles className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
            PrimeHealth System
          </h2>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-wider">
            The Skin Centre - Patna
          </p>
        </div>
      </div>

      <form onSubmit={handleLogin} className="flex flex-col gap-5">
        {/* Email */}
        <Input
          label="Email Address"
          type="email"
          placeholder="e.g. abhinav@theskincentre.in"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />

        {/* Password */}
        <Input
          label="Access Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
        />

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-lg flex items-center gap-2">
            <ShieldAlert className="h-[18px] w-[18px] shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          type="submit"
          isLoading={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3 rounded-lg shadow-lg shadow-blue-500/20 border-0"
        >
          Sign In to Console
        </Button>
      </form>

      {/* Dev Helper Credentials notice (Only displayed in development) */}
      {isDev && (
        <div className="text-center bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-normal">
            🔒 Supabase development sandbox active. Credentials referenced in <code className="text-blue-500 dark:text-blue-400 font-mono">AGENT.md</code> and <code className="text-blue-500 dark:text-blue-400 font-mono">seed-db.js</code> can be used for local testing.
          </p>
        </div>
      )}
    </div>
  )
}
