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
type Photo   = Database['public']['Tables']['patient_photos']['Row']

export default function PhotosPage() {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const [patients,          setPatients]          = useState<Patient[]>([])
  const [photos,            setPhotos]            = useState<Photo[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [loading,           setLoading]           = useState(true)
  const [photosLoading,     setPhotosLoading]     = useState(false)
  const [error,             setError]             = useState<string | null>(null)
  const [activeTab,         setActiveTab]         = useState<'compare' | 'upload'>('compare')

  // ── Load patients ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const { data, error: e } = await supabase
          .from('patients')
          .select('*')
          .order('full_name', { ascending: true })
        if (e) throw e
        setPatients(data ?? [])
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load patients')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [supabase])

  // ── Load photos for selected patient ─────────────────────────────────────
  const loadPhotos = useCallback(async (patientId: string) => {
    if (!patientId) { setPhotos([]); return }
    try {
      setPhotosLoading(true)
      const { data, error: e } = await supabase
        .from('patient_photos')
        .select('*')
        .eq('patient_id', patientId)
        .order('taken_at', { ascending: false })
      if (e) throw e
      setPhotos(data ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load photos')
    } finally {
      setPhotosLoading(false)
    }
  }, [supabase])

  useEffect(() => { void loadPhotos(selectedPatientId) }, [selectedPatientId, loadPhotos])

  // ── After successful upload: reload photos + switch to compare tab ────────
  const handleUploadSuccess = useCallback(async () => {
    await loadPhotos(selectedPatientId)
    setActiveTab('compare')
  }, [loadPhotos, selectedPatientId])

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 text-xs font-bold rounded-xl flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Patient selector */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
        <Card.Header>
          <Card.Title>Visual Treatment Progress</Card.Title>
          <Card.Description>
            Select a patient to view before/after comparisons or upload a new clinical photo.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          {loading ? (
            <div className="text-xs text-slate-400 animate-pulse">Loading patients…</div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <span className="text-xs font-bold text-slate-500 whitespace-nowrap">Choose Patient:</span>
              <select
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                className="w-full sm:w-80 bg-slate-50 dark:bg-slate-950 text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none"
              >
                <option value="">Select Patient…</option>
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

      {/* Tabs + content */}
      {selectedPatientId && (
        <div className="flex flex-col gap-6">
          {/* Tab bar */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
            <button
              onClick={() => setActiveTab('compare')}
              className={`py-3 text-xs font-extrabold flex items-center gap-1.5 border-b-2 transition-all focus:outline-none ${
                activeTab === 'compare'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              Comparison ({photos.length})
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`py-3 text-xs font-extrabold flex items-center gap-1.5 border-b-2 transition-all focus:outline-none ${
                activeTab === 'upload'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <UploadCloud className="h-4 w-4" />
              Upload Photo
            </button>
          </div>

          {/* Content */}
          <div>
            {photosLoading ? (
              <div className="py-12 text-center text-xs text-slate-400 animate-pulse">
                Loading photos…
              </div>
            ) : activeTab === 'compare' ? (
              <PhotoComparison photos={photos} />
            ) : (
              <PhotoUpload
                patientId={selectedPatientId}
                onSuccess={() => { void handleUploadSuccess() }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
