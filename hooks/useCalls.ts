import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database'
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

type Call = Database['public']['Tables']['calls']['Row']

export function useCalls() {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      // Fix 1: Deduplicate channel on singleton — remove any existing slot before
      // subscribing, preventing channel exhaustion across page navigations.
      const existing = supabase.getChannels().find((c: RealtimeChannel) => c.topic === 'realtime:calls_changes')
      if (existing) await supabase.removeChannel(existing)

      async function fetchCalls() {
        try {
          setLoading(true)
          setError(null)
          const { data, error: fetchErr } = await supabase
            .from('calls')
            .select('*')
            .order('call_started_at', { ascending: false })
            .limit(100)

          if (fetchErr) throw fetchErr
          setCalls(data || [])
        } catch (err: unknown) {
          console.error('Failed to fetch calls:', err)
          setError(err instanceof Error ? err.message : 'Failed to retrieve call logs')
        } finally {
          setLoading(false)
        }
      }

      fetchCalls()

      // Realtime channel listener
      channel = supabase
        .channel('calls_changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'calls' },
          (payload: RealtimePostgresChangesPayload<Call>) => {
            if (payload.eventType === 'INSERT') {
              setCalls((prev) => {
                const updated = [payload.new as Call, ...prev]
                // Prevent unbounded array memory growth, cap at 200 rows
                return updated.slice(0, 200)
              })
            } else if (payload.eventType === 'UPDATE') {
              setCalls((prev) =>
                prev.map((c) => (c.id === payload.new.id ? (payload.new as Call) : c))
              )
            } else if (payload.eventType === 'DELETE') {
              setCalls((prev) => prev.filter((c) => c.id !== payload.old.id))
            }
          }
        )
        .subscribe()
    }

    let channel: ReturnType<typeof supabase.channel> | undefined
    setup()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [supabase])

  return {
    calls,
    loading,
    error,
  }
}
