/**
 * API Request & Response Types
 */

export interface ExotelWebhookPayload {
  CallSid: string
  From: string
  To: string
  Status: 'completed' | 'failed' | 'busy' | 'no-answer'
  Duration: string
  Direction: 'inbound' | 'outbound'
  StartTime?: string
  EndTime?: string
}

export interface WhatsAppWebhookPayload {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        messaging_product: string
        metadata: {
          display_phone_number: string
          phone_number_id: string
        }
        contacts?: Array<{
          profile: {
            name: string
          }
          wa_id: string
        }>
        messages?: Array<{
          from: string
          id: string
          timestamp: string
          text?: {
            body: string
          }
          type: string
        }>
        statuses?: Array<{
          id: string
          status: 'sent' | 'delivered' | 'read' | 'failed'
          recipient_id: string
          timestamp: string
        }>
      }
      field: string
    }>
  }>
}

export interface WhatsAppSendRequest {
  to: string
  message: string
  relatedMissedCallId?: string
}

export interface SendOTPRequest {
  phone: string
  patientId: string
  treatment: string
}

export interface VerifyOTPRequest {
  phone: string
  code: string
  patientId: string
  treatment: string
  consentText: string
  signatureDataUrl?: string
}
