'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, Suspense, useRef, useCallback } from 'react'
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
  hasPendingMissedCall?: boolean
  patientId?: string | null
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

  // Load session expiry from patients table — webhook writes here on every inbound
  const loadSessionStatus = useCallback(async () => {
    if (!activePhone) {
      setWhatsappSessionExpiresAt(null)
      return
    }
    const { data, error: sessionError } = await (supabase as any)
      .from('patients')
      .select('whatsapp_session_expires_at')
      .eq('phone', activePhone)
      .maybeSingle()

    if (sessionError) {
      console.error('Failed to load WhatsApp session status:', sessionError.message)
      setWhatsappSessionExpiresAt(null)
      return
    }
    setWhatsappSessionExpiresAt(data?.whatsapp_session_expires_at ?? null)
  }, [activePhone, supabase])

  // Fetch session on conversation open (activePhone change) and when messages update
  useEffect(() => {
    loadSessionStatus()
  }, [loadSessionStatus, activePhone])

  // Build conversation list from messages + enrich with pending calls + patient IDs
  const loadConversations = useCallback(async () => {
    try {
      setConvoLoading(true)
      setError(null)

      // Load templates — only sendable ones (active + have Facebook template ID)
      const { data: templateData, error: templateErr } = await (supabase as any)
        .from('message_templates')
        .select('*')
        .eq('is_active', true)
        .not('gupshup_template_id', 'is', null)

      if (templateErr) throw templateErr
      setTemplates(templateData || [])

      // Load all messages to build conversation threads
      const { data: messageData, error: messageErr } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .order('sent_at', { ascending: false })

      if (messageErr) throw messageErr

      if (!messageData || messageData.length === 0) {
        setConversations([])
        return
      }

      // Build conversation map (most-recent message per phone)
      const map = new Map<string, ChatConversation>()
      messageData.forEach((msg: Message) => {
        if (!map.has(msg.patient_phone)) {
          map.set(msg.patient_phone, {
            patient_phone: msg.patient_phone,
            patient_name: msg.patient_name,
            last_message: msg.message_text,
            last_message_at: msg.sent_at,
            unreadCount: msg.direction === 'inbound' && msg.delivery_status !== 'read' ? 1 : 0,
          })
        } else {
          const prev = map.get(msg.patient_phone)!
          if (msg.direction === 'inbound' && msg.delivery_status !== 'read') {
            prev.unreadCount = (prev.unreadCount || 0) + 1
          }
        }
      })

      const phones = Array.from(map.keys())

      // Parallel: load pending missed calls + patient records for all conversation phones
      const [pendingCallsResult, patientsResult] = await Promise.all([
        supabase
          .from('missed_calls')
          .select('patient_phone')
          .in('patient_phone', phones)
          .eq('status', 'pending'),
        supabase
          .from('patients')
          .select('id, phone')
          .in('phone', phones),
      ])

      const pendingPhones = new Set<string>(
        (pendingCallsResult.data ?? []).map((r: { patient_phone: string }) => r.patient_phone)
      )
      const patientIdByPhone = new Map<string, string>(
        (patientsResult.data ?? []).map(
          (p: { id: string; phone: string }) => [p.phone, p.id] as [string, string]
        )
      )

      // Enrich conversations
      const enriched: ChatConversation[] = Array.from(map.values()).map((c) => ({
        ...c,
        hasPendingMissedCall: pendingPhones.has(c.patient_phone),
        patientId: patientIdByPhone.get(c.patient_phone) ?? null,
      }))

      setConversations(enriched)
    } catch (err: unknown) {
      console.error('Failed to load WhatsApp conversations:', err)
      setError(err instanceof Error ? err.message : 'Failed to retrieve conversation threads')
    } finally {
      setConvoLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadConversations()

    // Realtime: update conversation list when new messages arrive
    const channel = supabase
      .channel('global_messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' },
        (payload: { new: Message }) => {
          const newMsg = payload.new

          // Fix 2: Re-fetch session for the active phone when a new inbound message
          // arrives. 500ms delay lets the webhook's patients UPDATE commit first.
          if (newMsg.direction === 'inbound' && newMsg.patient_phone === activePhone) {
            setTimeout(() => loadSessionStatus(), 500)
          }

          setConversations((prev) => {
            const index = prev.findIndex((c) => c.patient_phone === newMsg.patient_phone)
            const updated = [...prev]

            const convoItem: ChatConversation = {
              patient_phone: newMsg.patient_phone,
              patient_name: newMsg.patient_name,
              last_message: newMsg.message_text,
              last_message_at: newMsg.sent_at,
              unreadCount: newMsg.direction === 'inbound' ? 1 : 0,
              hasPendingMissedCall: index !== -1 ? prev[index].hasPendingMissedCall : false,
              patientId: index !== -1 ? prev[index].patientId : null,
            }

            if (index !== -1) {
              const current = updated[index]
              convoItem.unreadCount =
                newMsg.direction === 'inbound'
                  ? (current.unreadCount || 0) + 1
                  : current.unreadCount
              updated.splice(index, 1)
            }

            return [convoItem, ...updated]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, loadConversations, activePhone, loadSessionStatus])

  const handleSelectConversation = async (phone: string) => {
    // Mark inbound messages as read
    const { error: updateErr } = await supabase
      .from('whatsapp_messages')
      .update({ delivery_status: 'read', read_at: new Date().toISOString() })
      .eq('patient_phone', phone)
      .eq('direction', 'inbound')

    if (updateErr) console.error('Failed to mark messages as read:', updateErr.message)

    setConversations((prev) =>
      prev.map((c) => (c.patient_phone === phone ? { ...c, unreadCount: 0 } : c))
    )

    router.push(`/whatsapp?phone=${encodeURIComponent(phone)}`)
  }

  const handleSendMessage = async (text: string) => {
    if (!activePhone) return

    const { data: missedCall } = await supabase
      .from('missed_calls')
      .select('id')
      .eq('patient_phone', activePhone)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle()

    await sendMessage(text, undefined, missedCall?.id)
  }

  const handleSendTemplate = async (templateId: string, serviceType: string) => {
    if (!activePhone) return

    // Strip '+' if present so server assertion (^91\d{10}$) always passes
    const sendTo = activePhone.replace(/^\+/, '')

    console.log('[send-template-click]', { to: sendTo, templateId, serviceType })

    const response = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: sendTo, templateId, serviceType }),
    })

    if (!response.ok) {
      const result = await response.json()
      throw new Error(result.error || 'Failed to send WhatsApp template')
    }
  }

  const handleMarkRecovered = async () => {
    if (!activePhone) return

    const { error: updateErr } = await supabase
      .from('missed_calls')
      .update({
        status: 'recovered',
        recovered: true,
        recovered_at: new Date().toISOString(),
      })
      .eq('patient_phone', activePhone)
      .eq('status', 'pending')

    if (updateErr) throw new Error(updateErr.message)

    // Update local state — clear the pending indicator
    setConversations((prev) =>
      prev.map((c) =>
        c.patient_phone === activePhone ? { ...c, hasPendingMissedCall: false } : c
      )
    )
  }

  const activeConvo = conversations.find((c) => c.patient_phone === activePhone)

  return (
    <div className="flex flex-col gap-4 h-full">
      {error && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main chat container */}
      <div className="h-[calc(100vh-160px)] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex bg-white dark:bg-slate-900 shadow-sm">

        {/* Left panel — conversation list */}
        <div
          className={`${
            activePhone ? 'hidden md:flex' : 'flex'
          } flex-col md:w-80 w-full border-r border-slate-200 dark:border-slate-800 flex-shrink-0`}
        >
          <ConversationList
            conversations={conversations}
            activePhone={activePhone}
            onSelect={handleSelectConversation}
            loading={convoLoading}
            onRefresh={loadConversations}
          />
        </div>

        {/* Right panel — chat area */}
        <div
          className={`${
            activePhone ? 'flex' : 'hidden md:flex'
          } flex-1 flex-col min-w-0`}
        >
          <ChatArea
            phone={activePhone}
            patientName={activeConvo?.patient_name ?? null}
            patientId={activeConvo?.patientId ?? null}
            messages={messages}
            templates={templates}
            whatsappSessionExpiresAt={whatsappSessionExpiresAt}
            onSendMessage={handleSendMessage}
            onSendTemplate={handleSendTemplate}
            hasPendingMissedCall={activeConvo?.hasPendingMissedCall ?? false}
            onMarkRecovered={handleMarkRecovered}
            loading={messagesLoading || convoLoading}
            onBack={() => router.push('/whatsapp')}
            onRefresh={async () => {
              await Promise.all([loadConversations(), loadSessionStatus()])
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default function WhatsAppPage() {
  return (
    <Suspense
      fallback={
        <div className="py-10 text-center text-xs text-slate-400 font-medium animate-pulse">
          Loading messenger...
        </div>
      }
    >
      <WhatsAppContent />
    </Suspense>
  )
}
