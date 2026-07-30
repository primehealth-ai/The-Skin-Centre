import { createServiceClient } from '@/lib/supabase/server'

let cachedLogoBase64: string | null = null

export async function getClinicLogoBase64(): Promise<string> {
  if (cachedLogoBase64) return cachedLogoBase64

  const supabase = createServiceClient()
  const { data, error } = await supabase.storage
    .from('clinic-assets')
    .download('logo.jpeg')

  if (error || !data) {
    throw new Error(`Failed to load clinic logo: ${error?.message ?? 'Unknown error'}`)
  }

  const arrayBuffer = await data.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const base64 = `data:image/jpeg;base64,${buffer.toString('base64')}`
  cachedLogoBase64 = base64
  return base64
}

export function clearCachedLogo(): void {
  cachedLogoBase64 = null
}
