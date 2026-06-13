import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizePhone, isValidIndianPhone } from '@/lib/utils/phone'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { phone, patientId, treatment } = await req.json()

    if (!phone || !patientId) {
      return NextResponse.json({ error: 'Missing recipient phone number or patient ID' }, { status: 400 })
    }

    // Normalize and validate phone
    const normalizedPhone = normalizePhone(phone)
    if (!isValidIndianPhone(normalizedPhone)) {
      return NextResponse.json({ error: 'Invalid Indian phone number' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 1. Rate Limiting Check (Max 3 OTPs per phone in last 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { count, error: countErr } = await supabase
      .from('otp_codes')
      .select('id', { count: 'exact', head: true })
      .eq('phone', normalizedPhone)
      .gte('created_at', tenMinutesAgo)

    if (countErr) {
      console.error('Rate limit query error:', countErr.message)
    }

    if (count && count >= 3) {
      return NextResponse.json({ 
        error: 'Too many OTP requests. Please wait 10 minutes before requesting another code.' 
      }, { status: 429 })
    }

    // 2. Generate secure 6-digit OTP code using crypto
    const otpCode = crypto.randomInt(100000, 999999).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes expiry

    // Hash the OTP with SHA-256 for secure storage
    const hashedOtp = crypto.createHash('sha256').update(otpCode).digest('hex')

    // 3. Register OTP inside the database
    const { error: insertErr } = await supabase.from('otp_codes').insert({
      phone: normalizedPhone,
      patient_id: patientId,
      code: hashedOtp, // store hashed code
      expires_at: expiresAt,
      used: false
    })

    if (insertErr) {
      console.error('OTP insertion failed:', insertErr.message)
      return NextResponse.json({ error: 'Failed to generate secure OTP code' }, { status: 500 })
    }

    // 4. Send SMS using Twilio Client (or log in dev environment)
    const twilioSid = process.env.TWILIO_ACCOUNT_SID
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN
    const twilioFromPhone = process.env.TWILIO_PHONE_NUMBER

    const messageText = `Your secure OTP for The Skin Centre digital consent for ${treatment || 'Treatment'} is: ${otpCode}. Valid for 10 minutes.`

    if (twilioSid && twilioAuthToken && twilioFromPhone) {
      const basicAuth = Buffer.from(`${twilioSid}:${twilioAuthToken}`).toString('base64');
      
      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: normalizedPhone,
            From: twilioFromPhone,
            Body: messageText,
          }).toString(),
        }
      )

      if (!twilioRes.ok) {
        const errDetails = await twilioRes.json()
        console.error('Twilio SMS dispatch failed:', errDetails)
        return NextResponse.json({ 
          error: `Twilio delivery failed: ${errDetails.message || 'Unknown SMS error'}` 
        }, { status: 502 })
      }
    } else {
      console.warn('--------------------------------------------------')
      console.warn(`[DEV LOG] Secure OTP generated for ${normalizedPhone}: ${otpCode}`)
      console.warn('--------------------------------------------------')
    }

    return NextResponse.json({ success: true, message: 'Secure OTP code generated and dispatched' }, { status: 200 })
  } catch (err: unknown) {
    console.error('Consent Send OTP error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal Server Error' }, { status: 500 })
  }
}
