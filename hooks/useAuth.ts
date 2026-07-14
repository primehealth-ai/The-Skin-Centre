import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database'
import { User } from '@supabase/supabase-js'

type Profile = Database['public']['Tables']['profiles']['Row']

export function useAuth() {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    async function getSession() {
      try {
        setLoading(true)
        setError(null)
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
        
        if (sessionErr) throw sessionErr

        if (session) {
          setUser(session.user)
          setCurrentUserId(session.user.id)
        } else {
          setUser(null)
          setCurrentUserId(null)
          setProfile(null)
        }
      } catch (err: unknown) {
        console.error('Session retrieval error:', err)
        setError(err instanceof Error ? err.message : 'Failed to retrieve active session')
      } finally {
        setLoading(false)
      }
    }

    getSession()

    // CRITICAL: supabase-js serializes all auth work behind a Web Locks lock
    // (navigator.locks, "lock:sb-<ref>-auth-token"). The onAuthStateChange
    // callback runs WHILE that lock is held, so awaiting any other Supabase
    // call inside it (e.g. a profiles query) re-enters the lock and deadlocks —
    // every later getSession()/from() across the app then hangs forever.
    //
    // Fix: The callback must do NO Supabase call at all. We update user states
    // synchronously and perform the profile query in a separate, decoupled useEffect.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: string, session: any) => {
        setError(null)

        if (!session) {
          setUser(null)
          setCurrentUserId(null)
          setProfile(null)
          setLoading(false)
          router.push('/login')
          return
        }

        setUser(session.user)
        setCurrentUserId(session.user.id)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [router, supabase])

  // Decoupled useEffect for profile fetching to completely avoid Web Locks conflicts
  useEffect(() => {
    if (!currentUserId) {
      setProfile(null)
      return
    }

    let active = true
    async function fetchProfile() {
      try {
        const { data, error: profileErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', currentUserId)
          .maybeSingle()

        if (profileErr) throw profileErr
        if (active) {
          setProfile(data)
        }
      } catch (err: unknown) {
        console.error('Error fetching user profile:', err)
      }
    }

    fetchProfile()

    return () => {
      active = false
    }
  }, [currentUserId, supabase])

  const signOut = async () => {
    try {
      setLoading(true)
      await supabase.auth.signOut()
      router.push('/login')
    } catch (err: unknown) {
      console.error('Sign out error:', err)
      setError(err instanceof Error ? err.message : 'Failed to sign out')
      setLoading(false)
    }
  }

  return {
    user,
    profile,
    loading,
    error,
    signOut,
  }
}
