'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, MessageSquare, AlertCircle, ChevronLeft, CheckCircle2, UserRound, PhoneMissed, RefreshCw } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { Button } from '../ui/Button'
import { formatPhoneNumber } from '@/lib/utils/formatters'
import { Database } from '@/types/database'
import { createClient } from '@/lib/supabase/client'

type Message = Database['public']['Tables']['whatsapp_messages']['Row']
type Template = Database['public']['Tables']['message_templates']['Row']

interface ChatAreaProps {
  phone: string | null
  patientName: string | null
  messages: Message[]
  templates: Template[]
  onSendMessage: (text: string) => Promise<void>
  onSendTemplate: (templateId: string, serviceType: string) => Promise<void>
  hasPendingMissedCall?: boolean
  onMarkRecovered?: () => Promise<void>
  loading?: boolean
  onBack?: () => void
  onRefresh?: () => Promise<void>
}

export function ChatArea({
  phone,
  patientName,
  messages,
  templates,
  onSendMessage,
  onSendTemplate,
  hasPendingMissedCall = false,
  onMarkRecovered,
  loading = false,
  onBack,
  onRefresh,
}: ChatAreaProps) {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const [inputText, setInputText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isSendingTemplate, setIsSendingTemplate] = useState(false)
  const [isMarkingRecovered, setIsMarkingRecovered] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [patientRecordId, setPatientRecordId] = useState<string | null>(null)
  const [isSessionOpen, setSessionOpen] = useState(false)
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Reset template selection when phone changes
  useEffect(() => {
    setSelectedTemplateId('')
    setError(null)
    setSuccessMsg(null)
  }, [phone])

  const fetchSessionStatus = useCallback(async (activePhone: string) => {
    const { data, error: sessionError } = await supabase
      .from('patients')
      .select('whatsapp_session_expires_at')
      .eq('phone', activePhone)
      .maybeSingle()

    if (sessionError) {
      console.error('Failed to fetch WhatsApp session status:', sessionError.message)
      setSessionOpen(false)
      setSessionExpiresAt(null)
      return false
    }

    const isOpen = data?.whatsapp_session_expires_at
      ? new Date(data.whatsapp_session_expires_at) > new Date()
      : false

    setSessionOpen(isOpen)
    setSessionExpiresAt(data?.whatsapp_session_expires_at ?? null)
    return isOpen
  }, [supabase])

  const fetchPatientRecord = useCallback(async (activePhone: string) => {
    const { data, error: patientError } = await supabase
      .from('patients')
      .select('id')
      .eq('phone', activePhone)
      .maybeSingle()

    if (patientError) {
      console.error('Failed to fetch patient record for WhatsApp chat:', patientError.message)
      setPatientRecordId(null)
      return null
    }

    const nextPatientId = data?.id ?? null
    setPatientRecordId(nextPatientId)
    return nextPatientId
  }, [supabase])

  useEffect(() => {
    if (!phone) {
      setSessionOpen(false)
      setSessionExpiresAt(null)
      setPatientRecordId(null)
      return
    }

    void fetchPatientRecord(phone)
    void fetchSessionStatus(phone)
  }, [phone, fetchPatientRecord, fetchSessionStatus])

  useEffect(() => {
    if (!phone) {
      return
    }

    void fetchSessionStatus(phone)
  }, [messages, phone, fetchSessionStatus])

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    if (successTimerRef.current) clearTimeout(successTimerRef.current)
    successTimerRef.current = setTimeout(() => setSuccessMsg(null), 4000)
  }

  const sessionExpiry = sessionExpiresAt ? new Date(sessionExpiresAt) : null
  const hasValidExpiry = sessionExpiry !== null && !Number.isNaN(sessionExpiry.getTime())
  const isSessionActive = isSessionOpen && hasValidExpiry && sessionExpiry!.getTime() > now
  const isSessionExpired = hasValidExpiry && sessionExpiry!.getTime() <= now

  const sessionTime = hasValidExpiry
    ? new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(sessionExpiry!)
    : ''

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!isSessionActive || !inputText.trim() || isSending) return
    try {
      setIsSending(true)
      setError(null)
      await onSendMessage(inputText)
      setInputText('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setIsSending(false)
    }
  }

  const handleSendTemplate = async () => {
    if (!selectedTemplateId || isSendingTemplate) return
    try {
      setIsSendingTemplate(true)
      setError(null)
      // Find the selected template to extract its service_type
      const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)
      const serviceType: string = (selectedTemplate as any)?.service_type ?? 'General'
      await onSendTemplate(selectedTemplateId, serviceType)
      if (phone) {
        await fetchSessionStatus(phone)
      }
      setSelectedTemplateId('')
      showSuccess('Template sent successfully')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send template')
    } finally {
      setIsSendingTemplate(false)
    }
  }

  const handleMarkRecovered = async () => {
    if (!onMarkRecovered || isMarkingRecovered) return
    try {
      setIsMarkingRecovered(true)
      setError(null)
      await onMarkRecovered()
      showSuccess('Marked as recovered')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to mark as recovered')
    } finally {
      setIsMarkingRecovered(false)
    }
  }

  const handleApplyTemplate = (messageText: string) => {
    let text = messageText
    if (patientName) text = text.replace(/\{\{patient_name\}\}/g, patientName)
    text = text.replace(/\{\{clinic_name\}\}/g, 'The Skin Centre')
    setInputText(text)
  }

  const handleViewPatient = async () => {
    if (!phone) {
      return
    }

    const resolvedPatientId = patientRecordId ?? await fetchPatientRecord(phone)

    if (!resolvedPatientId) {
      setError('Patient profile not yet created')
      return
    }

    router.push(`/patients/${resolvedPatientId}`)
  }

  if (!phone) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-8 text-center">
        <div className="h-16 w-16 bg-blue-50 dark:bg-blue-950/30 text-blue-600 rounded-full flex items-center justify-center mb-4">
          <MessageSquare className="h-8 w-8" />
        </div>
        <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg mb-1.5">
          Two-Way WhatsApp Support
        </h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs font-semibold">
          Select a patient thread from the left to start messaging.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 min-w-0">
      {/* Chat Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 h-16 flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back button — mobile only */}
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Back to conversations"
              className="md:hidden flex-shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          <div className="h-9 w-9 bg-blue-600 rounded-full text-white font-bold text-sm flex items-center justify-center flex-shrink-0">
            {patientName?.charAt(0).toUpperCase() || 'P'}
          </div>

          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate">
              {patientName || 'New Patient'}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              {formatPhoneNumber(phone)}
            </span>
          </div>
        </div>

        {/* Right side: Refresh + View Patient */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {onRefresh && (
            <button
              id="chat-refresh-btn"
              aria-label="Refresh chat"
              onClick={async () => {
                if (isRefreshing) return
                setIsRefreshing(true)
                try { await onRefresh() } finally { setIsRefreshing(false) }
                await fetchSessionStatus(phone)
              }}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button
            type="button"
            onClick={handleViewPatient}
            disabled={!patientRecordId}
            className="flex-shrink-0 flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 enabled:hover:bg-slate-200 dark:enabled:hover:bg-slate-700"
          >
            <UserRound className="h-3.5 w-3.5" />
            View Patient
          </button>
        </div>
      </div>

      {/* Messages Scrollbox */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-3">
        {loading && messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-xs text-slate-400 dark:text-slate-500 font-medium animate-pulse">
              Loading messages...
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">
              No messages yet
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Template quick-apply chips (visible only when session is active) */}
      {isSessionActive && templates.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 px-4 sm:px-6 py-3 flex items-center gap-3 overflow-x-auto flex-shrink-0">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 flex items-center gap-1.5 uppercase tracking-wider flex-shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-blue-500" />
            Templates:
          </span>
          <div className="flex gap-2">
            {templates.map((temp) => (
              <button
                key={temp.id}
                onClick={() => handleApplyTemplate(temp.message_text)}
                className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300 rounded-lg whitespace-nowrap transition-colors focus:outline-none"
              >
                {temp.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 flex-shrink-0 space-y-3">
        {/* Session status banner */}
        <div
          className={`rounded-lg border px-3 py-2 text-xs font-bold ${
            isSessionActive
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-400'
              : isSessionExpired
                ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-400'
                : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
          }`}
        >
          {isSessionActive
            ? `Session open until ${sessionTime} — free-form messages enabled`
            : isSessionExpired
              ? 'Session expired — template messages only'
              : 'Awaiting patient reply — template only'}
        </div>

        {/* Success toast */}
        {successMsg && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs font-bold">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            {successMsg}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-bold">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* Template send section — always visible */}
        <div className="flex gap-2">
          <select
            aria-label="Select template to send"
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            disabled={isSendingTemplate}
            className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">— Select a template —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            onClick={handleSendTemplate}
            isLoading={isSendingTemplate}
            disabled={!selectedTemplateId || isSendingTemplate}
            className="px-4 flex-shrink-0"
          >
            Send Template
          </Button>
        </div>

        {/* Mark as Recovered button */}
        {hasPendingMissedCall && onMarkRecovered && (
          <button
            type="button"
            onClick={handleMarkRecovered}
            disabled={isMarkingRecovered}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/40 text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-950/40 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          >
            <PhoneMissed className="h-3.5 w-3.5" />
            {isMarkingRecovered ? 'Marking...' : 'Mark Missed Call as Recovered'}
          </button>
        )}

        {/* Free-form message input */}
        <form onSubmit={handleSend} className="flex gap-3 items-end">
          <textarea
            placeholder={
              isSessionActive
                ? 'Type your message here...'
                : 'Session closed — use a template above to re-open conversation'
            }
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            disabled={isSending || !isSessionActive}
            rows={2}
            className="flex-1 resize-none bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm rounded-lg px-4 py-2.5 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button
            type="submit"
            isLoading={isSending}
            disabled={!isSessionActive || !inputText.trim()}
            className="flex items-center gap-1.5 px-5 py-2.5 shadow-sm font-bold flex-shrink-0"
          >
            Send
          </Button>
        </form>
      </div>
    </div>
  )
}
