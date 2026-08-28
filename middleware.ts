import { NextResponse, type NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// EDGE MIDDLEWARE — must complete in < 1.5 s on Vercel Edge Runtime.
// NEVER await any Supabase network call here (auth.getUser, getSession, DB
// queries, storage) — they will cause MIDDLEWARE_INVOCATION_TIMEOUT (504).
//
// Auth strategy:
//   • Middleware: cookie EXISTENCE check only (synchronous, ~0 ms).
//   • Route handlers / Server Components: full session verification via
//     createClient() from @/lib/supabase/server.
// ---------------------------------------------------------------------------

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
  if (pathname === '/api/whatsapp/webhook') {
    return NextResponse.next({ request })
  }

  // ── Login page is always public ──────────────────────────────────────────────
  if (pathname.startsWith('/login')) {
    return NextResponse.next({ request })
  }

  // ── Lightweight cookie existence check (synchronous, no network) ─────────────
  // Supabase stores the session token in one of two cookie names depending on
  // the project ref extracted from the Supabase URL.
  // We check both the short-form and the project-ref-scoped name.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const projectRef = supabaseUrl.split('//')[1]?.split('.')[0] ?? ''

  const token =
    request.cookies.get('sb-access-token') ??
    request.cookies.get(`sb-${projectRef}-auth-token`) ??
    // Supabase v2 SSR stores a chunked token; accept any chunk as proof
    [...request.cookies.getAll()].find((c) =>
      c.name.startsWith(`sb-${projectRef}-auth-token`)
    )

  // ── Protect all API routes ───────────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.next({ request })
  }

  // ── Protect all dashboard / page routes ─────────────────────────────────────
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next({ request })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|css|js|woff|woff2|ttf|eot)).*)',
  ],
}
