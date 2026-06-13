'use client'
import { useState, useRef, useEffect } from 'react'
import { Sparkles, MessageSquare, AlertCircle } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { Button } from '../ui/Button'
import { formatPhoneNumber } from '@/lib/utils/formatters'
import { Database } from '@/types/database'

type Message = Database['public']['Tables']['whatsapp_messages']['Row']
type Template = Database['public']['Tables']['message_templates']['Row']

interface ChatAreaProps {
  phone: string | null
  patientName: string | null
  messages: Message[]
  templates: Template[]
  whatsappSessionExpiresAt: string | null
  onSendMessage: (text: string) => Promise<void>
  onSendTemplate: (templateName: string) => Promise<void>
  loading?: boolean
}

const TEMPLATE_OPTIONS = [
  'missed_call_skin_care',
  'missed_call_hair_care',
  'missed_call_general',
] as const

export function ChatArea({
  phone,
  patientName,
  messages,
  templates,
  whatsappSessionExpiresAt,
  onSendMessage,
  onSendTemplate,
  loading = false,
}: ChatAreaProps) {
  const [inputText, setInputText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isSendingTemplate, setIsSendingTemplate] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sessionExpiry = whatsappSessionExpiresAt
    ? new Date(whatsappSessionExpiresAt)
    : null
  const hasValidExpiry =
    sessionExpiry !== null && !Number.isNaN(sessionExpiry.getTime())
  const isSessionActive =
    hasValidExpiry && sessionExpiry.getTime() > now
  const isSessionExpired =
    hasValidExpiry && sessionExpiry.getTime() <= now

  const sessionTime = hasValidExpiry
    ? new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(sessionExpiry)
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
      console.error('Failed to dispatch message:', err)
      setError(err instanceof Error ? err.message : 'Failed to dispatch message')
    } finally {
      setIsSending(false)
    }
  }

  const handleSendTemplate = async () => {
    if (!selectedTemplate || isSendingTemplate) return

    try {
      setIsSendingTemplate(true)
      setError(null)
      await onSendTemplate(selectedTemplate)
      setSelectedTemplate('')
    } catch (err: unknown) {
      console.error('Failed to dispatch template:', err)
      setError(err instanceof Error ? err.message : 'Failed to dispatch template')
    } finally {
      setIsSendingTemplate(false)
    }
  }

  const handleApplyTemplate = (templateText: string) => {
    let text = templateText
    if (patientName) {
      text = text.replace(/{{patient_name}}/g, patientName)
    }
    text = text.replace(/{{clinic_name}}/g, 'The Skin Centre')
    setInputText(text)
  }

  if (!phone) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-8 text-center">
        <div className="h-16 w-16 bg-blue-50 dark:bg-blue-950/20 text-blue-600 rounded-full flex items-center justify-center mb-4">
          <MessageSquare className="h-8 w-8" />
        </div>
        <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg mb-1.5">
          Two-Way WhatsApp Support
        </h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs font-semibold">
          Select a patient thread from the left menu to start messaging and assisting with missed calls.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      {/* Chat Header */}
      <div className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-blue-600 rounded-full text-white font-bold flex items-center justify-center">
            {patientName?.charAt(0).toUpperCase() || 'P'}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">
              {patientName || 'New Patient'}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
              {formatPhoneNumber(phone)}
            </span>
          </div>
        </div>
      </div>

      {/* Messages Scrollbox */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        {loading && messages.length === 0 ? (
          <div className="flex justify-center items-center h-full text-xs text-slate-400 font-medium">
            Loading chat logs...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex justify-center items-center h-full text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
            No messages sent or received yet.
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Templates Helper Drawer */}
      {templates.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border-t border-slate-150 dark:border-slate-800 px-6 py-3.5 flex items-center gap-3 overflow-x-auto">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 flex items-center gap-1.5 uppercase tracking-wider flex-shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-blue-500" />
            Templates:
          </span>
          <div className="flex gap-2">
            {templates.map((temp) => (
              <button
                key={temp.id}
                onClick={() => handleApplyTemplate(temp.message_text)}
                className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300 rounded-lg whitespace-nowrap transition-colors focus:outline-none"
              >
                {temp.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Form */}
      <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4">
        <div
          className={`mb-3 rounded-lg border px-3 py-2 text-xs font-bold ${
            isSessionActive
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-400'
              : isSessionExpired
                ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400'
                : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          {isSessionActive
            ? `Session active until ${sessionTime}`
            : isSessionExpired
              ? 'Session expired - template messages only'
              : 'Awaiting patient reply - template only'}
        </div>

        {error && (
          <div className="mb-2 p-2.5 bg-rose-50 dark:bg-rose-950/20 text-rose-500 border border-rose-100 dark:border-rose-900/30 rounded-lg text-xs font-bold flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {!isSessionActive && (
          <div className="mb-3 flex gap-3">
            <select
              aria-label="Send Template"
              value={selectedTemplate}
              onChange={(event) => setSelectedTemplate(event.target.value)}
              disabled={isSendingTemplate}
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="">Send Template</option>
              {TEMPLATE_OPTIONS.map((templateName) => (
                <option key={templateName} value={templateName}>
                  {templateName}
                </option>
              ))}
            </select>
            <Button
              type="button"
              onClick={handleSendTemplate}
              isLoading={isSendingTemplate}
              disabled={!selectedTemplate}
              className="px-5"
            >
              Send Template
            </Button>
          </div>
        )}

        <form onSubmit={handleSend} className="flex gap-3 items-end">
          <textarea
            placeholder="Type your message here..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isSending || !isSessionActive}
            rows={2}
            className="flex-1 resize-none bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm rounded-lg px-4 py-2.5 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button
            type="submit"
            isLoading={isSending}
            disabled={!isSessionActive || !inputText.trim()}
            className="flex items-center gap-1.5 px-5 py-2.5 shadow-md shadow-blue-500/20 font-bold"
          >
            Send
          </Button>
        </form>
      </div>
    </div>
  )
}
