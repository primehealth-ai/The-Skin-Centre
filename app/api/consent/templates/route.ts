import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const userSupabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await userSupabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await userSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || (profile.role !== 'staff' && profile.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const supabase = createServiceClient()
    const { data: templates, error } = await supabase
      .from('consent_templates')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (error) {
      await logError('consent', error, { source: 'GET /api/consent/templates' })
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
    }

    return NextResponse.json({ templates: templates ?? [] }, { status: 200 })
  } catch (error) {
    await logError('consent', error, { source: 'GET /api/consent/templates' })
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
