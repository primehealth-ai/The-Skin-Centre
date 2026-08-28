import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// EDGE MIDDLEWARE — optimized for Vercel Edge Runtime (< 1.5s limit).
//
// Key Requirements:
//   1. Must NEVER cause 504 MIDDLEWARE_INVOCATION_TIMEOUT.
//   2. Must initialize createServerClient with cookie setAll handler so that
//      Supabase auth cookies are refreshed on HTTP responses. Without cookie
//      refreshing, browser clients (createBrowserClient) hang on expired JWTs,
//      causing infinite skeleton loading screens on dashboard pages.
//   3. Uses a 1.2s timeout guard on auth.getUser() to strictly bound execution time.
// ---------------------------------------------------------------------------

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // ── 1. Webhook & Cron routes: bypass Supabase auth instantly (0ms) ───────────
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

  if (pathname.startsWith('/api/cron/')) {
    const authorization = request.headers.get('authorization')
    if (authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.next({ request })
  }

  if (pathname === '/api/whatsapp/webhook' || pathname === '/api/diagnostic') {
    return NextResponse.next({ request })
  }

  const isPublicPage = pathname.startsWith('/login')

  // ── 2. Fast Cookie Existence Check (0ms) ────────────────────────────────────
  const allCookies = request.cookies.getAll()
  const hasAuthCookie = allCookies.some(
    (c) =>
      c.name.startsWith('sb-') ||
      c.name.includes('auth-token') ||
      c.name.includes('access-token')
  )

  // Fast-path redirect if no auth cookie is present
  if (!hasAuthCookie) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isPublicPage) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return NextResponse.next({ request })
  }

  // ── 3. Supabase Client & Cookie Refresher ───────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnon) {
    return NextResponse.next({ request })
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

    // Timeout guard: race getUser against a 1200ms deadline to prevent 504 on Vercel Edge Runtime
    const getUserPromise = supabase.auth.getUser()
    const timeoutPromise = new Promise<{ data: { user: null }; error: Error }>((resolve) =>
      setTimeout(
        () => resolve({ data: { user: null }, error: new Error('Auth timeout') }),
        1200
      )
    )

    const { data } = await Promise.race([getUserPromise, timeoutPromise])
    user = data?.user ?? null
  } catch (err) {
    console.error('Middleware Supabase auth error:', err)
  }

  // ── 4. Route Protection & Cookie Preservation ──────────────────────────────
  if (pathname.startsWith('/api/')) {
    if (!user && !hasAuthCookie) {
      const errorResponse = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        errorResponse.cookies.set(cookie)
      })
      return errorResponse
    }
    return supabaseResponse
  }

  if (!user && !isPublicPage && !hasAuthCookie) {
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
