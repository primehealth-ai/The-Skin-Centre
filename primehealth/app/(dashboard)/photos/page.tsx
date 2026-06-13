'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useRef, useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import { PhotoUpload } from '@/components/photos/PhotoUpload'
import { PhotoComparison } from '@/components/photos/PhotoComparison'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database'
import { Sparkles, UploadCloud, AlertCircle } from 'lucide-react'

type Patient = Database['public']['Tables']['patients']['Row']
type Photo = Database['public']['Tables']['patient_photos']['Row']

export default function PhotosPage() {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const [patients, setPatients] = useState<Patient[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState('')
  
  const [loading, setLoading] = useState(true)
  const [photosLoading, setPhotosLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'compare' | 'upload'>('compare')

  // Load active patients list
  useEffect(() => {
    async function loadPatients() {
      try {
        setLoading(true)
        setError(null)
        const { data, error: fetchErr } = await supabase
          .from('patients')
          .select('*')
          .order('full_name', { ascending: true })

        if (fetchErr) throw fetchErr
        setPatients(data || [])
      } catch (err: unknown) {
        console.error('Failed to retrieve patients:', err)
        setError(err instanceof Error ? err.message : 'Failed to retrieve patients index')
      } finally {
        setLoading(false)
      }
    }

    loadPatients()
  }, [supabase])

  // Isolated photo loader to avoid setTimeout state resetting hacks
  const loadPhotos = useCallback(async (patientId: string) => {
    if (!patientId) {
      setPhotos([])
      return
    }
    try {
      setPhotosLoading(true)
      setError(null)
      const { data, error: photoErr } = await supabase
        .from('patient_photos')
        .select('*')
        .eq('patient_id', patientId)
        .order('taken_at', { ascending: false })

      if (photoErr) throw photoErr
      setPhotos(data || [])
    } catch (err: unknown) {
      console.error(`Failed to load photos for patient ${patientId}:`, err)
      setError(err instanceof Error ? err.message : 'Failed to retrieve patient progression photos')
    } finally {
      setPhotosLoading(false)
    }
  }, [supabase])

  // Load photos when selected patient changes
  useEffect(() => {
    loadPhotos(selectedPatientId)
  }, [selectedPatientId, loadPhotos])

  const handlePhotoUploadSubmit = async (payload: {
    patientId: string
    photoType: 'before' | 'after'
    treatment: string
    bodyArea: string
    notes: string
    file: File
  }) => {
    try {
      setError(null)
      
      // 1. Upload photo to Supabase Storage bucket
      const filename = `photos/${payload.patientId}/${payload.photoType}_${Date.now()}_${payload.file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      const { data: storageData, error: uploadErr } = await supabase.storage
        .from('patient-photos')
        .upload(filename, payload.file, {
          cacheControl: '3600',
          upsert: true,
        })

      if (uploadErr) throw new Error(uploadErr.message || 'Storage upload error')

      const { data: publicUrlData } = supabase.storage
        .from('patient-photos')
        .getPublicUrl(storageData.path)

      const photoUrl = publicUrlData?.publicUrl || null

      // 2. Insert DB record
      const { error: insertErr } = await supabase
        .from('patient_photos')
        .insert({
          patient_id: payload.patientId,
          photo_url: photoUrl!,
          photo_type: payload.photoType,
          treatment: payload.treatment,
          body_area: payload.bodyArea || null,
          notes: payload.notes || null,
        })

      if (insertErr) throw new Error(insertErr.message || 'Database entry log failed')

      // 3. Proper state invalidation instead of setTimeout hack!
      await loadPhotos(payload.patientId)
      setActiveTab('compare')
    } catch (err: unknown) {
      console.error('Failed clinical photo upload submission:', err)
      setError(err instanceof Error ? err.message : 'An error occurred during progression photo upload.')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-500 text-xs font-bold rounded-xl flex items-center gap-2">
          <AlertCircle className="h-4.5 w-4.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Patient Selector Card */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
        <Card.Header>
          <Card.Title>Visual Treatment Progress Logs</Card.Title>
          <Card.Description>
            Select a patient below to view comparative "before" and "after" clinical results or register a new photo.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          {loading ? (
            <div className="text-xs text-slate-400 dark:text-slate-500 font-medium animate-pulse">Loading patients...</div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-450 whitespace-nowrap">Choose Patient:</span>
              <select
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                className="w-full sm:w-80 bg-slate-50 dark:bg-slate-950 text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none"
              >
                <option value="">Select Patient...</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.phone})
                  </option>
                ))}
              </select>
            </div>
          )}
        </Card.Content>
      </Card>

      {/* Show comparative view / upload toggle */}
      {selectedPatientId && (
        <div className="flex flex-col gap-6">
          {/* Tab selector */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
            <button
              onClick={() => setActiveTab('compare')}
              className={`py-3 text-xs font-extrabold flex items-center gap-1.5 border-b-2 transition-all focus:outline-none ${
                activeTab === 'compare'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-400'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              Outcome Comparison ({photos.length})
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`py-3 text-xs font-extrabold flex items-center gap-1.5 border-b-2 transition-all focus:outline-none ${
                activeTab === 'upload'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-400'
              }`}
            >
              <UploadCloud className="h-4 w-4" />
              Upload Photo
            </button>
          </div>

          {/* Render Area */}
          <div>
            {photosLoading ? (
              <div className="py-12 text-center text-xs text-slate-400 dark:text-slate-500 font-medium animate-pulse">
                Retrieving photo files...
              </div>
            ) : activeTab === 'compare' ? (
              <PhotoComparison photos={photos} />
            ) : (
              <PhotoUpload patients={patients} onUpload={handlePhotoUploadSubmit} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
