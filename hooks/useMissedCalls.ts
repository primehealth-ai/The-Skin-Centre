import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MissedCallWithPatient } from '@/types/database'
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

type MissedCall = MissedCallWithPatient
type MissedCallStatus = MissedCall['status']

export function useMissedCalls() {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const [missedCalls, setMissedCalls] = useState<MissedCall[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Patient name is read live from patients.full_name via the patient_id FK —
  // missed_calls no longer stores a denormalized patient_name snapshot.
  const fetchMissedCalls = useCallback(
    async (silent = false) => {
      try {
        if (!silent) setLoading(true)
        setError(null)

        // Guard: bail to login if the session has expired rather than run an
        // RLS-empty query that leaves the queue looking empty.
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          window.location.href = '/login'
          return
        }

        const { data, error: fetchErr } = await supabase
          .from('missed_calls')
          .select('*, patients(full_name)')
          .order('missed_at', { ascending: false })
          .limit(200) // Impose limit to prevent overfetching

        if (fetchErr) throw fetchErr
        setMissedCalls((data as MissedCall[]) || [])
      } catch (err: unknown) {
        console.error('Failed to fetch missed calls:', err)
        setError(err instanceof Error ? err.message : 'Failed to retrieve missed calls queue')
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [supabase]
  )

  useEffect(() => {
    async function setup() {
      // Fix 1: Deduplicate channel on singleton — remove any existing slot before
      // subscribing, preventing channel exhaustion across page navigations.
      const existing = supabase.getChannels().find((c: RealtimeChannel) => c.topic === 'realtime:missed_calls_changes')
      if (existing) await supabase.removeChannel(existing)

      fetchMissedCalls()

      // Realtime channel listener. Realtime payloads omit embedded relations, so a
      // spliced payload.new would drop patients.full_name — refetch (silent) on
      // INSERT/UPDATE to keep the join populated. DELETE can prune locally.
      channel = supabase
        .channel('missed_calls_changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'missed_calls' },
          (payload: RealtimePostgresChangesPayload<MissedCall>) => {
            if (payload.eventType === 'DELETE') {
              setMissedCalls((prev) => prev.filter((c) => c.id !== (payload.old as { id: string }).id))
            } else {
              fetchMissedCalls(true)
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
  }, [supabase, fetchMissedCalls])

  const assignMissedCall = async (id: string, staffId: string): Promise<MissedCall> => {
    try {
      setError(null)
      const { data, error: assignErr } = await supabase
        .from('missed_calls')
        .update({ assigned_to: staffId })
        .eq('id', id)
        .select()
        .single()

      if (assignErr) throw assignErr
      return data
    } catch (err: unknown) {
      console.error(`Failed to assign missed call ${id}:`, err)
      const msg = err instanceof Error ? err.message : 'Failed to assign missed call'
      setError(msg)
      throw new Error(msg)
    }
  }

  const updateStatus = async (id: string, status: MissedCallStatus, notes?: string): Promise<MissedCall> => {
    try {
      setError(null)
      const updatePayload: Partial<MissedCall> = { status }
      if (notes !== undefined) {
        updatePayload.staff_notes = notes
      }
      if (status === 'recovered') {
        updatePayload.recovered = true
        updatePayload.recovered_at = new Date().toISOString()
      }

      const { data, error: updateErr } = await supabase
        .from('missed_calls')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single()

      if (updateErr) throw updateErr
      return data
    } catch (err: unknown) {
      console.error(`Failed to update status for missed call ${id}:`, err)
      const msg = err instanceof Error ? err.message : 'Failed to update missed call status'
      setError(msg)
      throw new Error(msg)
    }
  }

  return {
    missedCalls,
    loading,
    error,
    // Exposed so pages can offer a manual Retry without a full page refresh.
    refetch: fetchMissedCalls,
    assignMissedCall,
    updateStatus,
  }
}
