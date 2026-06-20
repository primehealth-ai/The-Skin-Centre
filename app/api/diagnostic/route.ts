import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const envCheck = {
    NEXT_PUBLIC_SUPABASE_URL: {
      present: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      length: process.env.NEXT_PUBLIC_SUPABASE_URL?.length || 0,
      startsWithHttps: process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith('https://') || false,
    },
    NEXT_PUBLIC_SUPABASE_ANON_KEY: {
      present: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      length: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length || 0,
    },
    SUPABASE_SERVICE_ROLE_KEY: {
      present: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      length: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0,
    },
    CRON_SECRET: {
      present: !!process.env.CRON_SECRET,
      length: process.env.CRON_SECRET?.length || 0,
    },
    KNOWLARITY_WEBHOOK_SECRET: {
      present: !!process.env.KNOWLARITY_WEBHOOK_SECRET,
      length: process.env.KNOWLARITY_WEBHOOK_SECRET?.length || 0,
    },
    TELEGRAM_BOT_TOKEN: {
      present: !!process.env.TELEGRAM_BOT_TOKEN,
      length: process.env.TELEGRAM_BOT_TOKEN?.length || 0,
    },
    TELEGRAM_CHAT_ID: {
      present: !!process.env.TELEGRAM_CHAT_ID,
      length: process.env.TELEGRAM_CHAT_ID?.length || 0,
    },
    NODE_ENV: process.env.NODE_ENV,
  }

  return NextResponse.json(envCheck)
}
