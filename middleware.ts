import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  let user = null

  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
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
        }
      )

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      user = authUser
    }
  } catch (err) {
    console.error('Middleware Supabase auth error:', err)
  }
  const pathname = request.nextUrl.pathname

  if (pathname === '/api/knowlarity/webhook') {
    const token =
      request.nextUrl.searchParams.get('token') ||
      request.headers.get('x-api-key') ||
      request.headers.get('x-webhook-secret') ||
      request.headers.get('authorization')?.replace('Bearer ', '')
    if (token !== process.env.KNOWLARITY_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return supabaseResponse
  }

  if (pathname.startsWith('/api/cron/')) {
    const authorization = request.headers.get('authorization')
    if (authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return supabaseResponse
  }

  const isPublicApi = pathname === '/api/whatsapp/webhook' || pathname === '/api/diagnostic'

  const isPublicPage = pathname.startsWith('/login')

  if (pathname.startsWith('/api/')) {
    if (!user && !isPublicApi) {
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
