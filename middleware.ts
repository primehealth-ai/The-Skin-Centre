import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // ── Webhook route: validated by its own secret, no session needed ───────────
  if (pathname === '/api/knowlarity/webhook') {
    const token =
      request.nextUrl.searchParams.get('token') ||
      request.headers.get('x-api-key') ||
      request.headers.get('x-webhook-secret') ||
      request.headers.get('authorization')?.replace('Bearer ', '')
    if (token !== process.env.KNOWLARITY_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.next({ request })
  }

  // ── Cron routes: validated by CRON_SECRET, no session needed ────────────────
  if (pathname.startsWith('/api/cron/')) {
    const authorization = request.headers.get('authorization')
    if (authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.next({ request })
  }

  // ── Public API routes that require no auth ───────────────────────────────────
  const isPublicApi = pathname === '/api/whatsapp/webhook' || pathname === '/api/diagnostic'
  if (isPublicApi) {
    return NextResponse.next({ request })
  }

  // ── All other routes require Supabase auth ───────────────────────────────────
  // Critical fix (Item 15): env vars are REQUIRED — fail closed with 500 rather
  // than silently falling through to unauthenticated access.
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnon) {
    console.error(
      'CRITICAL: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. ' +
      'Refusing all requests to prevent unauthenticated access.'
    )
    return NextResponse.json(
      { error: 'Server misconfiguration: authentication service unavailable' },
      { status: 500 }
    )
  }

  let supabaseResponse = NextResponse.next({ request })
  let user = null

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnon, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    })

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()
    user = authUser
  } catch (err) {
    // Auth check threw — treat as unauthenticated (network issue etc.)
    console.error('Middleware Supabase auth error:', err)
  }

  const isPublicPage = pathname.startsWith('/login')

  if (pathname.startsWith('/api/')) {
    if (!user) {
      const errorResponse = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        errorResponse.cookies.set(cookie)
      })
      return errorResponse
    }
    return supabaseResponse
  }

  if (!user && !isPublicPage) {
    const redirectResponse = NextResponse.redirect(new URL('/login', request.url))
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie)
    })
    return redirectResponse
  }

  if (user && isPublicPage) {
    const redirectResponse = NextResponse.redirect(new URL('/dashboard', request.url))
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie)
    })
    return redirectResponse
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|css|js|woff|woff2|ttf|eot)).*)',
  ],
}
