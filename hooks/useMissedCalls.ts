import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database'
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

type MissedCall = Database['public']['Tables']['missed_calls']['Row']
type MissedCallStatus = MissedCall['status']

export function useMissedCalls() {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const [missedCalls, setMissedCalls] = useState<MissedCall[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchMissedCalls() {
      try {
        setLoading(true)
        setError(null)
        const { data, error: fetchErr } = await supabase
          .from('missed_calls')
          .select('*')
          .order('missed_at', { ascending: false })
          .limit(200) // Impose limit to prevent overfetching

        if (fetchErr) throw fetchErr
        setMissedCalls(data || [])
      } catch (err: unknown) {
        console.error('Failed to fetch missed calls:', err)
        setError(err instanceof Error ? err.message : 'Failed to retrieve missed calls queue')
      } finally {
        setLoading(false)
      }
    }

    fetchMissedCalls()

    // Realtime channel listener
    const channel = supabase
      .channel('missed_calls_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'missed_calls' },
        (payload: RealtimePostgresChangesPayload<MissedCall>) => {
          if (payload.eventType === 'INSERT') {
            setMissedCalls((prev) => {
              const updated = [payload.new as MissedCall, ...prev]
              return updated.slice(0, 200)
            })
          } else if (payload.eventType === 'UPDATE') {
            setMissedCalls((prev) =>
              prev.map((c) => (c.id === payload.new.id ? (payload.new as MissedCall) : c))
            )
          } else if (payload.eventType === 'DELETE') {
            setMissedCalls((prev) => prev.filter((c) => c.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

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
    assignMissedCall,
    updateStatus,
  }
}
