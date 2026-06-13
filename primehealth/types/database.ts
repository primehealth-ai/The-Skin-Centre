export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          role: 'admin' | 'staff'
          phone: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          role?: 'admin' | 'staff'
          phone?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          role?: 'admin' | 'staff'
          phone?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      clinic_numbers: {
        Row: {
          id: string
          phone_number: string
          exophone: string | null
          service_name: string
          display_name: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          phone_number: string
          exophone?: string | null
          service_name: string
          display_name: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          phone_number?: string
          exophone?: string | null
          service_name?: string
          display_name?: string
          is_active?: boolean
          created_at?: string
        }
      }
      patients: {
        Row: {
          id: string
          full_name: string | null
          phone: string
          email: string | null
          gender: 'male' | 'female' | 'other' | null
          date_of_birth: string | null
          tags: string[] | null
          internal_notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          full_name?: string | null
          phone: string
          email?: string | null
          gender?: 'male' | 'female' | 'other' | null
          date_of_birth?: string | null
          tags?: string[] | null
          internal_notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          phone?: string
          email?: string | null
          gender?: 'male' | 'female' | 'other' | null
          date_of_birth?: string | null
          tags?: string[] | null
          internal_notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      calls: {
        Row: {
          id: string
          patient_id: string | null
          patient_phone: string
          patient_name: string | null
          exotel_call_sid: string
          incoming_number: string
          clinic_number_id: string | null
          service_type: string | null
          call_status: 'answered' | 'missed' | 'in-progress' | 'no-answer' | 'busy' | 'failed'
          call_direction: 'inbound' | 'outbound'
          call_started_at: string
          call_ended_at: string | null
          call_duration: number | null
          staff_id: string | null
          staff_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          patient_id?: string | null
          patient_phone: string
          patient_name?: string | null
          exotel_call_sid: string
          incoming_number: string
          clinic_number_id?: string | null
          service_type?: string | null
          call_status: 'answered' | 'missed' | 'in-progress' | 'no-answer' | 'busy' | 'failed'
          call_direction?: 'inbound' | 'outbound'
          call_started_at: string
          call_ended_at?: string | null
          call_duration?: number | null
          staff_id?: string | null
          staff_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          patient_id?: string | null
          patient_phone?: string
          patient_name?: string | null
          exotel_call_sid?: string
          incoming_number?: string
          clinic_number_id?: string | null
          service_type?: string | null
          call_status?: 'answered' | 'missed' | 'in-progress' | 'no-answer' | 'busy' | 'failed'
          call_direction?: 'inbound' | 'outbound'
          call_started_at?: string
          call_ended_at?: string | null
          call_duration?: number | null
          staff_id?: string | null
          staff_name?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      missed_calls: {
        Row: {
          id: string
          call_id: string | null
          patient_id: string | null
          patient_phone: string
          patient_name: string | null
          incoming_number: string
          service_type: string | null
          missed_at: string
          status: 'pending' | 'whatsapp_sent' | 'patient_replied' | 'recovered' | 'lost'
          whatsapp_sent_at: string | null
          whatsapp_message_id: string | null
          patient_replied_at: string | null
          patient_reply_text: string | null
          recovered: boolean
          recovered_at: string | null
          assigned_to: string | null
          staff_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          call_id?: string | null
          patient_id?: string | null
          patient_phone: string
          patient_name?: string | null
          incoming_number: string
          service_type?: string | null
          missed_at: string
          status?: 'pending' | 'whatsapp_sent' | 'patient_replied' | 'recovered' | 'lost'
          whatsapp_sent_at?: string | null
          whatsapp_message_id?: string | null
          patient_replied_at?: string | null
          patient_reply_text?: string | null
          recovered?: boolean
          recovered_at?: string | null
          assigned_to?: string | null
          staff_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          call_id?: string | null
          patient_id?: string | null
          patient_phone?: string
          patient_name?: string | null
          incoming_number?: string
          service_type?: string | null
          missed_at?: string
          status?: 'pending' | 'whatsapp_sent' | 'patient_replied' | 'recovered' | 'lost'
          whatsapp_sent_at?: string | null
          whatsapp_message_id?: string | null
          patient_replied_at?: string | null
          patient_reply_text?: string | null
          recovered?: boolean
          recovered_at?: string | null
          assigned_to?: string | null
          staff_notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      whatsapp_messages: {
        Row: {
          id: string
          patient_id: string | null
          patient_phone: string
          patient_name: string | null
          whatsapp_message_id: string | null
          message_text: string
          direction: 'inbound' | 'outbound'
          sent_by_staff_id: string | null
          sent_by_automation: boolean
          delivery_status: 'sent' | 'delivered' | 'read' | 'failed' | null
          related_missed_call_id: string | null
          sent_at: string
          delivered_at: string | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          patient_id?: string | null
          patient_phone: string
          patient_name?: string | null
          whatsapp_message_id?: string | null
          message_text: string
          direction: 'inbound' | 'outbound'
          sent_by_staff_id?: string | null
          sent_by_automation?: boolean
          delivery_status?: 'sent' | 'delivered' | 'read' | 'failed' | null
          related_missed_call_id?: string | null
          sent_at?: string
          delivered_at?: string | null
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string | null
          patient_phone?: string
          patient_name?: string | null
          whatsapp_message_id?: string | null
          message_text?: string
          direction?: 'inbound' | 'outbound'
          sent_by_staff_id?: string | null
          sent_by_automation?: boolean
          delivery_status?: 'sent' | 'delivered' | 'read' | 'failed' | null
          related_missed_call_id?: string | null
          sent_at?: string
          delivered_at?: string | null
          read_at?: string | null
          created_at?: string
        }
      }
      message_templates: {
        Row: {
          id: string
          name: string
          category: 'missed-call' | 'follow-up' | 'appointment-reminder' | 'custom'
          message_text: string
          is_active: boolean
          usage_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          category: 'missed-call' | 'follow-up' | 'appointment-reminder' | 'custom'
          message_text: string
          is_active?: boolean
          usage_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          category?: 'missed-call' | 'follow-up' | 'appointment-reminder' | 'custom'
          message_text?: string
          is_active?: boolean
          usage_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      patient_consents: {
        Row: {
          id: string
          patient_id: string
          treatment: string
          consent_text: string
          verified_via_otp: boolean
          otp_verified_at: string | null
          signature_image_url: string | null
          pdf_url: string | null
          signed_at: string | null
          signed_by_ip: string | null
          created_by_staff_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          treatment: string
          consent_text: string
          verified_via_otp?: boolean
          otp_verified_at?: string | null
          signature_image_url?: string | null
          pdf_url?: string | null
          signed_at?: string | null
          signed_by_ip?: string | null
          created_by_staff_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          treatment?: string
          consent_text?: string
          verified_via_otp?: boolean
          otp_verified_at?: string | null
          signature_image_url?: string | null
          pdf_url?: string | null
          signed_at?: string | null
          signed_by_ip?: string | null
          created_by_staff_id?: string | null
          created_at?: string
        }
      }
      patient_photos: {
        Row: {
          id: string
          patient_id: string
          photo_url: string
          photo_type: 'before' | 'after'
          treatment: string
          body_area: string | null
          notes: string | null
          taken_by_staff_id: string | null
          taken_at: string
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          photo_url: string
          photo_type: 'before' | 'after'
          treatment: string
          body_area?: string | null
          notes?: string | null
          taken_by_staff_id?: string | null
          taken_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          photo_url?: string
          photo_type?: 'before' | 'after'
          treatment?: string
          body_area?: string | null
          notes?: string | null
          taken_by_staff_id?: string | null
          taken_at?: string
          created_at?: string
        }
      }
      otp_codes: {
        Row: {
          id: string
          phone: string
          patient_id: string | null
          code: string
          expires_at: string
          used: boolean
          created_at: string
        }
        Insert: {
          id?: string
          phone: string
          patient_id?: string | null
          code: string
          expires_at: string
          used?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          phone?: string
          patient_id?: string | null
          code?: string
          expires_at?: string
          used?: boolean
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
