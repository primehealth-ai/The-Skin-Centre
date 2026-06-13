'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, Suspense, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ConversationList } from '@/components/whatsapp/ConversationList'
import { ChatArea } from '@/components/whatsapp/ChatArea'
import { useWhatsApp } from '@/hooks/useWhatsApp'
import { Database } from '@/types/database'
import { AlertCircle } from 'lucide-react'

type Template = Database['public']['Tables']['message_templates']['Row']
type Message = Database['public']['Tables']['whatsapp_messages']['Row']

interface ChatConversation {
  patient_phone: string
  patient_name: string | null
  last_message?: string
  last_message_at?: string
  unreadCount?: number
}

function WhatsAppContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activePhone = searchParams.get('phone')

  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [whatsappSessionExpiresAt, setWhatsappSessionExpiresAt] = useState<string | null>(null)
  const [convoLoading, setConvoLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { messages, loading: messagesLoading, sendMessage } = useWhatsApp(activePhone || undefined)

  useEffect(() => {
    async function loadSessionStatus() {
      if (!activePhone) {
        setWhatsappSessionExpiresAt(null)
        return
      }

      const { data, error: sessionError } = await supabase
        .from('missed_calls')
        .select('whatsapp_session_expires_at')
        .eq('patient_phone', activePhone)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (sessionError) {
        console.error('Failed to load WhatsApp session status:', sessionError.message)
        setWhatsappSessionExpiresAt(null)
        return
      }

      setWhatsappSessionExpiresAt(data?.whatsapp_session_expires_at ?? null)
    }

    loadSessionStatus()
  }, [activePhone, supabase, messages])

  // Fetch unique conversations and templates
  useEffect(() => {
    async function loadInitialData() {
      try {
        setConvoLoading(true)
        setError(null)
        
        // Load Templates
        const { data: templateData, error: templateErr } = await supabase
          .from('message_templates')
          .select('*')
          .eq('is_active', true)
        
        if (templateErr) throw templateErr
        setTemplates(templateData || [])

        // Load Messages to construct conversation list
        const { data: messageData, error: messageErr } = await supabase
          .from('whatsapp_messages')
          .select('*')
          .order('sent_at', { ascending: false })

        if (messageErr) throw messageErr

        if (messageData) {
          const map = new Map<string, ChatConversation>()
          messageData.forEach((msg: Message) => {
            if (!map.has(msg.patient_phone)) {
              map.set(msg.patient_phone, {
                patient_phone: msg.patient_phone,
                patient_name: msg.patient_name,
                last_message: msg.message_text,
                last_message_at: msg.sent_at,
                unreadCount: msg.direction === 'inbound' && msg.delivery_status !== 'read' ? 1 : 0
              })
            } else {
              const prev = map.get(msg.patient_phone)!
              if (msg.direction === 'inbound' && msg.delivery_status !== 'read') {
                prev.unreadCount = (prev.unreadCount || 0) + 1
              }
            }
          })
          setConversations(Array.from(map.values()))
        }
      } catch (err: unknown) {
        console.error('Failed to load whatsapp context data:', err)
        setError(err instanceof Error ? err.message : 'Failed to retrieve conversation threads')
      } finally {
        setConvoLoading(false)
      }
    }

    loadInitialData()

    // Realtime listener to update conversation latest message previews
    const channel = supabase
      .channel('global_messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' },
        (payload: { new: Message }) => {
          const newMsg = payload.new
          setConversations((prev) => {
            const index = prev.findIndex((c) => c.patient_phone === newMsg.patient_phone)
            const updated = [...prev]
            
            const convoItem: ChatConversation = {
              patient_phone: newMsg.patient_phone,
              patient_name: newMsg.patient_name,
              last_message: newMsg.message_text,
              last_message_at: newMsg.sent_at,
              unreadCount: newMsg.direction === 'inbound' ? 1 : 0
            }

            if (index !== -1) {
              const current = updated[index]
              convoItem.unreadCount = newMsg.direction === 'inbound' 
                ? (current.unreadCount || 0) + 1 
                : current.unreadCount
              updated.splice(index, 1) // Remove from old position
            }
            return [convoItem, ...updated] // Add to top
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  const handleSelectConversation = async (phone: string) => {
    // If conversation is selected, mark messages as read in DB
    const { error: updateErr } = await supabase
      .from('whatsapp_messages')
      .update({ delivery_status: 'read', read_at: new Date().toISOString() })
      .eq('patient_phone', phone)
      .eq('direction', 'inbound')

    if (updateErr) {
      console.error('Failed to mark messages as read:', updateErr.message)
    }
    
    // Reset unread count locally
    setConversations((prev) =>
      prev.map((c) => (c.patient_phone === phone ? { ...c, unreadCount: 0 } : c))
    )

    router.push(`/whatsapp?phone=${encodeURIComponent(phone)}`)
  }

  const handleSendMessage = async (text: string) => {
    if (!activePhone) return
    
    // Get related missed call ID if any is pending
    const { data: missedCall } = await supabase
      .from('missed_calls')
      .select('id')
      .eq('patient_phone', activePhone)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle()

    await sendMessage(text, undefined, missedCall?.id)
  }

  const handleSendTemplate = async (templateName: string) => {
    if (!activePhone) return

    const response = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: activePhone,
        templateName,
      }),
    })

    if (!response.ok) {
      const result = await response.json()
      throw new Error(result.error || 'Failed to send WhatsApp template')
    }
  }

  const activeConvo = conversations.find((c) => c.patient_phone === activePhone)

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-455 text-xs font-bold rounded-xl flex items-center gap-2">
          <AlertCircle className="h-4.5 w-4.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="h-[calc(100vh-160px)] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex bg-white dark:bg-slate-900 shadow-sm">
        <ConversationList
          conversations={conversations}
          activePhone={activePhone}
          onSelect={handleSelectConversation}
        />
        <ChatArea
          phone={activePhone}
          patientName={activeConvo?.patient_name || 'Patient'}
          messages={messages}
          templates={templates}
          whatsappSessionExpiresAt={whatsappSessionExpiresAt}
          onSendMessage={handleSendMessage}
          onSendTemplate={handleSendTemplate}
          loading={messagesLoading || convoLoading}
        />
      </div>
    </div>
  )
}

export default function WhatsAppPage() {
  return (
    <Suspense fallback={
      <div className="py-10 text-center text-xs text-slate-400 font-medium animate-pulse">
        Loading messenger logs...
      </div>
    }>
      <WhatsAppContent />
    </Suspense>
  )
}
