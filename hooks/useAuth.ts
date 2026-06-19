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

  useEffect(() => {
    async function getSession() {
      try {
        setLoading(true)
        setError(null)
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
        
        if (sessionErr) throw sessionErr

        if (session) {
          setUser(session.user)
          const { data, error: profileErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle()
          
          if (profileErr) throw profileErr
          setProfile(data)
        } else {
          setUser(null)
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event: string, session: any) => {
        try {
          setError(null)
          if (session) {
            setUser(session.user)
            const { data, error: profileErr } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .maybeSingle()
            
            if (profileErr) throw profileErr
            setProfile(data)
          } else {
            setUser(null)
            setProfile(null)
            router.push('/login')
          }
        } catch (err: unknown) {
          console.error('Auth state change handler error:', err)
          setError(err instanceof Error ? err.message : 'Error syncing user profile')
        } finally {
          setLoading(false)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [router, supabase])

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
