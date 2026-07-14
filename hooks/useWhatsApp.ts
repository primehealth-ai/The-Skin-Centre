import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database'
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

type Message = Database['public']['Tables']['whatsapp_messages']['Row']

export function useWhatsApp(activePhone?: string) {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch messages for a specific patient's phone
  useEffect(() => {
    if (!activePhone) {
      setMessages([])
      return
    }

    async function fetchMessages() {
      try {
        setLoading(true)
        setError(null)
        const { data, error: fetchErr } = await supabase
          .from('whatsapp_messages')
          .select('*')
          .eq('patient_phone', activePhone)
          .order('sent_at', { ascending: true })

        if (fetchErr) throw fetchErr
        setMessages(data || [])
      } catch (err: unknown) {
        console.error('Failed to fetch WhatsApp messages for patient record:', err)
        setError(err instanceof Error ? err.message : 'Failed to load message history')
      } finally {
        setLoading(false)
      }
    }

    // Sanitize phone input for safe channel identifier naming constraints
    const safeChannelPhone = activePhone.replace(/[^a-zA-Z0-9]/g, '_')
    const channelName = `whatsapp_messages_${safeChannelPhone}`

    async function setup() {
      // Fix 1: Deduplicate channel on singleton — remove any existing slot for this
      // phone before subscribing, preventing channel exhaustion when switching patients.
      const existing = supabase.getChannels().find((c: RealtimeChannel) => c.topic === `realtime:${channelName}`)
      if (existing) await supabase.removeChannel(existing)

      fetchMessages()

      // Realtime channel for this patient's messages
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'whatsapp_messages',
            filter: `patient_phone=eq.${activePhone}`,
          },
          (payload: RealtimePostgresChangesPayload<Message>) => {
            if (payload.eventType === 'INSERT') {
              setMessages((prev) => {
                // Ensure we don't insert duplicate IDs
                if (prev.some((m) => m.id === payload.new.id)) return prev
                return [...prev, payload.new as Message]
              })
            } else if (payload.eventType === 'UPDATE') {
              setMessages((prev) =>
                prev.map((m) => (m.id === payload.new.id ? (payload.new as Message) : m))
              )
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
  }, [activePhone, supabase])

  const sendMessage = async (text: string, staffId?: string, missedCallId?: string): Promise<Message> => {
    if (!activePhone) {
      throw new Error('No recipient phone specified')
    }

    try {
      setError(null)
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: activePhone,
          message: text,
          relatedMissedCallId: missedCallId,
          sentByStaffId: staffId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to send WhatsApp message')
      }

      const responseData = await response.json()
      return responseData.data
    } catch (err: unknown) {
      console.error('Failed to send WhatsApp message for patient record:', err)
      const msg = err instanceof Error ? err.message : 'Failed to send WhatsApp message'
      setError(msg)
      throw new Error(msg)
    }
  }

  return {
    messages,
    loading,
    error,
    sendMessage,
  }
}
