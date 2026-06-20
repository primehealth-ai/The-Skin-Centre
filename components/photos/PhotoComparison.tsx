'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import {
  Sparkles,
  Calendar,
  Tag,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Move,
  ImageOff,
  Camera,
  Loader2,
} from 'lucide-react'
import type { Database } from '@/types/database'
import { useAuth } from '@/hooks/useAuth'

type Photo = Database['public']['Tables']['patient_photos']['Row']

interface PhotoComparisonProps {
  photos: Photo[]
  onPhotoDeleted?: () => void
}

interface TreatmentGroup {
  treatment: string
  before: Photo[]
  after: Photo[]
}

// ─── Signed URL cache (per session, keyed by photo ID) ───────────────────────
// Prevents re-fetching when switching treatments back and forth.
const urlCache = new Map<string, string>()

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function groupByTreatment(photos: Photo[]): TreatmentGroup[] {
  const map = new Map<string, TreatmentGroup>()
  for (const photo of photos) {
    if (!map.has(photo.treatment)) {
      map.set(photo.treatment, { treatment: photo.treatment, before: [], after: [] })
    }
    const g = map.get(photo.treatment)!
    if (photo.photo_type === 'before') g.before.push(photo)
    else g.after.push(photo)
  }
  return Array.from(map.values())
}

// ─── Hook: resolve signed URL for a single photo ──────────────────────────────

function useSignedUrl(photo: Photo | null): { url: string | null; loading: boolean; error: string | null } {
  const [url, setUrl] = useState<string | null>(() => (photo ? (urlCache.get(photo.id) ?? null) : null))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!photo) { setUrl(null); setError(null); return }

    const cached = urlCache.get(photo.id)
    if (cached) { setUrl(cached); setError(null); return }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/photos/${photo.id}/url`)
      .then((r) => {
        if (!r.ok) {
          throw new Error(`Failed to fetch photo (HTTP ${r.status})`)
        }
        return r.json() as Promise<{ url?: string; error?: string }>
      })
      .then((data) => {
        if (cancelled) return
        if (data.url) {
          urlCache.set(photo.id, data.url)
          setUrl(data.url)
          setError(null)
        } else {
          setError(data.error || 'Failed to resolve photo URL')
        }
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Error resolving photo URL')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [photo])

  return { url, loading, error }
}

// ─── Signed Image ─────────────────────────────────────────────────────────────
// Small wrapper that resolves the signed URL before rendering the <img>

function SignedImage({
  photo,
  className,
  alt,
}: {
  photo: Photo
  className?: string
  alt: string
}) {
  const { url, loading, error } = useSignedUrl(photo)

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 dark:bg-slate-800 ${className ?? ''}`}>
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-bold ${className ?? ''}`}>
        <AlertCircle className="h-6 w-6 text-rose-500 mb-1" />
        <span className="text-[10px] text-center">{error}</span>
      </div>
    )
  }

  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 dark:bg-slate-800 ${className ?? ''}`}>
        <ImageOff className="h-6 w-6 text-slate-400" />
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className={className} draggable={false} />
  )
}

// ─── Comparison Slider ────────────────────────────────────────────────────────

function ComparisonSlider({ beforePhoto, afterPhoto }: { beforePhoto: Photo; afterPhoto: Photo }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const [sliderPos, setSliderPos] = useState(50)

  const { url: beforeUrl, loading: beforeLoading, error: beforeError } = useSignedUrl(beforePhoto)
  const { url: afterUrl,  loading: afterLoading,  error: afterError  } = useSignedUrl(afterPhoto)

  const posFromX = useCallback((clientX: number): number => {
    const el = containerRef.current
    if (!el) return 50
    const { left, width } = el.getBoundingClientRect()
    return Math.min(100, Math.max(0, ((clientX - left) / width) * 100))
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent)  => { if (isDragging.current) setSliderPos(posFromX(e.clientX)) }
    const onUp   = ()               => { isDragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [posFromX])

  const isLoading = beforeLoading || afterLoading
  const hasError = beforeError || afterError

  if (hasError) {
    return (
      <div
        className="relative w-full flex flex-col items-center justify-center bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl p-6 text-rose-600 dark:text-rose-400 text-xs font-bold"
        style={{ aspectRatio: '4/3' }}
      >
        <AlertCircle className="h-8 w-8 text-rose-500 mb-2" />
        <p className="text-center font-bold">Failed to load comparison images</p>
        <p className="text-[10px] text-rose-500/80 font-normal mt-1 max-w-xs text-center">
          {beforeError || afterError}
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none overflow-hidden rounded-2xl bg-slate-900"
      style={{ aspectRatio: '4/3', cursor: 'col-resize' }}
      onMouseDown={(e) => { e.preventDefault(); isDragging.current = true; setSliderPos(posFromX(e.clientX)) }}
      onTouchStart={(e) => { isDragging.current = true; setSliderPos(posFromX(e.touches[0].clientX)) }}
      onTouchMove={(e)  => { if (isDragging.current) { e.preventDefault(); setSliderPos(posFromX(e.touches[0].clientX)) } }}
      onTouchEnd={() => { isDragging.current = false }}
    >
      {isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-white/60" />
        </div>
      ) : (
        <>
          {/* BEFORE — base layer */}
          <div className="absolute inset-0">
            {beforeUrl && <img src={beforeUrl} alt="Before" className="h-full w-full object-cover" draggable={false} />}
          </div>

          {/* AFTER — clipped */}
          <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
            {afterUrl && <img src={afterUrl} alt="After" className="h-full w-full object-cover" draggable={false} />}
          </div>

          {/* Divider line */}
          <div
            className="absolute inset-y-0 z-20 w-0.5 bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)]"
            style={{ left: `${sliderPos}%`, transform: 'translateX(-50%)' }}
          />

          {/* Drag handle */}
          <div
            className="absolute top-1/2 z-30 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_4px_24px_rgba(0,0,0,0.30)] ring-2 ring-white/60"
            style={{ left: `${sliderPos}%` }}
          >
            <ChevronLeft className="h-4 w-4 text-slate-700" strokeWidth={2.5} />
            <ChevronRight className="h-4 w-4 text-slate-700" strokeWidth={2.5} />
          </div>

          {/* Badges */}
          <div className="pointer-events-none absolute left-3 top-3 z-10">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-white shadow-lg">
              <Sparkles className="h-3 w-3" /> AFTER
            </span>
          </div>
          <div className="pointer-events-none absolute right-3 top-3 z-10">
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-3 py-1 text-xs font-bold text-white shadow-lg">
              BEFORE
            </span>
          </div>

          {/* Drag hint */}
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
              <Move className="h-3 w-3" /> Drag to compare
            </span>
          </div>
        </>
      )}

      {/* Inset ring */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-black/10" />
    </div>
  )
}

// ─── Single Photo View ────────────────────────────────────────────────────────

function SinglePhotoView({ photo, missing }: { photo: Photo; missing: 'before' | 'after' }) {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl" style={{ aspectRatio: '4/3' }}>
      <SignedImage photo={photo} alt={photo.photo_type} className="h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-black/10" />
      <div className="absolute left-3 top-3">
        {photo.photo_type === 'after' ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-white shadow-lg">
            <Sparkles className="h-3 w-3" /> AFTER
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-3 py-1 text-xs font-bold text-white shadow-lg">
            BEFORE
          </span>
        )}
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-4">
        <p className="flex items-center gap-1.5 text-xs text-amber-300">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          No {missing} photo uploaded yet
        </p>
      </div>
    </div>
  )
}

// ─── Thumbnail Grid ───────────────────────────────────────────────────────────

function Thumbnail({
  photo,
  isActiveBefore,
  isActiveAfter,
  onSelect,
}: {
  photo: Photo
  isActiveBefore: boolean
  isActiveAfter: boolean
  onSelect: (photo: Photo, slot: 'before' | 'after') => void
}) {
  const { url } = useSignedUrl(photo)
  const isActive = isActiveBefore || isActiveAfter

  return (
    <div className="group relative">
      <button
        type="button"
        className={`relative w-full overflow-hidden rounded-xl ring-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none active:scale-[0.97] ${
          isActiveBefore
            ? 'ring-rose-500 shadow-rose-200 shadow-md'
            : isActiveAfter
            ? 'ring-emerald-500 shadow-emerald-200 shadow-md'
            : 'ring-transparent hover:ring-blue-400'
        }`}
        style={{ aspectRatio: '1/1' }}
        onClick={() => onSelect(photo, photo.photo_type === 'before' ? 'before' : 'after')}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${photo.photo_type} - ${photo.treatment}`} className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-slate-100 dark:bg-slate-800">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          </div>
        )}

        {/* Slot picker overlay */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(photo, 'before') }}
            className="w-16 rounded-md bg-rose-500 py-0.5 text-[10px] font-bold text-white hover:bg-rose-600 active:scale-95">
            BEFORE
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(photo, 'after') }}
            className="w-16 rounded-md bg-emerald-500 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-600 active:scale-95">
            AFTER
          </button>
        </div>
      </button>

      {/* Type badge */}
      <div className="absolute left-1.5 top-1.5 z-10 pointer-events-none">
        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white shadow ${photo.photo_type === 'after' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
          {photo.photo_type === 'after' ? 'A' : 'B'}
        </span>
      </div>

      {isActiveBefore && (
        <div className="absolute bottom-1.5 left-0 right-0 flex justify-center pointer-events-none">
          <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[9px] font-bold text-white shadow">BEFORE ✓</span>
        </div>
      )}
      {isActiveAfter && (
        <div className="absolute bottom-1.5 left-0 right-0 flex justify-center pointer-events-none">
          <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-bold text-white shadow">AFTER ✓</span>
        </div>
      )}
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 py-20">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
        <Camera className="h-7 w-7 text-slate-400" />
      </div>
      <p className="font-semibold text-slate-700 dark:text-slate-200">No photos yet</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Upload before &amp; after photos to enable comparison
      </p>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PhotoComparison({ photos, onPhotoDeleted }: PhotoComparisonProps) {
  const { profile } = useAuth()
  const isStaffOrAdmin = profile?.role === 'staff' || profile?.role === 'admin'
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDeletePhoto = async (photoId: string) => {
    if (!window.confirm('Are you sure you want to delete this photo?')) return
    setDeletingId(photoId)
    try {
      const res = await fetch(`/api/photos/${photoId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete photo')
      }
      onPhotoDeleted?.()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete photo')
    } finally {
      setDeletingId(null)
    }
  }

  const groups = groupByTreatment(photos)
  const [selectedTreatment, setSelectedTreatment] = useState(groups[0]?.treatment ?? '')
  const [activeBeforeId, setActiveBeforeId] = useState<string | null>(null)
  const [activeAfterId,  setActiveAfterId]  = useState<string | null>(null)

  // Reset active photos when treatment changes
  useEffect(() => {
    if (!selectedTreatment) return
    const g = groups.find((g) => g.treatment === selectedTreatment)
    setActiveBeforeId(g?.before[0]?.id ?? null)
    setActiveAfterId(g?.after[0]?.id   ?? null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTreatment])

  const handleSelect = useCallback((photo: Photo, slot: 'before' | 'after') => {
    if (slot === 'before') setActiveBeforeId(photo.id)
    else setActiveAfterId(photo.id)
  }, [])

  if (photos.length === 0) {
    return <Card className="max-w-3xl mx-auto p-6"><EmptyState /></Card>
  }

  const currentGroup = groups.find((g) => g.treatment === selectedTreatment)
  const allPhotos    = [...(currentGroup?.before ?? []), ...(currentGroup?.after ?? [])]
  const activeBefore = allPhotos.find((p) => p.id === activeBeforeId) ?? null
  const activeAfter  = allPhotos.find((p) => p.id === activeAfterId)  ?? null

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-500 shadow">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
            Before &amp; After Comparison
          </h2>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 ml-10">
          Drag the handle to reveal treatment results · Images load via secure signed URLs
        </p>
      </Card>

      {/* Main viewer */}
      <Card className="p-5 space-y-5">
        {/* Treatment selector */}
        {groups.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
              <Tag className="h-4 w-4 text-slate-500" />
            </div>
            <div className="flex-1">
              <label htmlFor="treatment-select" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Treatment
              </label>
              <select
                id="treatment-select"
                value={selectedTreatment}
                onChange={(e) => setSelectedTreatment(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {groups.map((g) => (
                  <option key={g.treatment} value={g.treatment}>
                    {g.treatment} ({g.before.length} before · {g.after.length} after)
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Date / body area info */}
        {(activeBefore ?? activeAfter) && (
          <div className="flex flex-wrap items-center gap-3">
            {activeBefore && (
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/40 px-2.5 py-1 rounded-lg border border-slate-100 dark:border-slate-800">
                <Calendar className="h-3.5 w-3.5" />
                <span>Before: <span className="font-semibold text-rose-600 dark:text-rose-400">{formatDate(activeBefore.taken_at)}</span></span>
                {isStaffOrAdmin && (
                  <button
                    onClick={() => { void handleDeletePhoto(activeBefore.id) }}
                    disabled={deletingId === activeBefore.id}
                    className="text-rose-500 hover:text-rose-700 font-bold ml-1 hover:scale-105 transition-transform disabled:opacity-50"
                    title="Delete before photo"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
            {activeAfter && (
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/40 px-2.5 py-1 rounded-lg border border-slate-100 dark:border-slate-800">
                <Calendar className="h-3.5 w-3.5" />
                <span>After: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatDate(activeAfter.taken_at)}</span></span>
                {isStaffOrAdmin && (
                  <button
                    onClick={() => { void handleDeletePhoto(activeAfter.id) }}
                    disabled={deletingId === activeAfter.id}
                    className="text-rose-500 hover:text-rose-700 font-bold ml-1 hover:scale-105 transition-transform disabled:opacity-50"
                    title="Delete after photo"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
            {activeBefore?.body_area && <Badge variant="secondary">{activeBefore.body_area}</Badge>}
          </div>
        )}

        {/* Visual area */}
        {activeBefore && activeAfter ? (
          <ComparisonSlider beforePhoto={activeBefore} afterPhoto={activeAfter} />
        ) : activeBefore ? (
          <SinglePhotoView photo={activeBefore} missing="after" />
        ) : activeAfter ? (
          <SinglePhotoView photo={activeAfter} missing="before" />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 py-16">
            <ImageOff className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-semibold text-slate-500">No photos for this treatment</p>
          </div>
        )}

        {/* Notes */}
        {(activeBefore?.notes ?? activeAfter?.notes) && (
          <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Notes</p>
            {activeBefore?.notes && (
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                <span className="font-semibold text-rose-500">Before: </span>{activeBefore.notes}
              </p>
            )}
            {activeAfter?.notes && (
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                <span className="font-semibold text-emerald-500">After: </span>{activeAfter.notes}
              </p>
            )}
          </div>
        )}

        {/* Thumbnails */}
        {allPhotos.length > 0 && (
          <div className="mt-2">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
              All Photos — click to set as Before / After
            </p>
            <div className="grid grid-cols-4 gap-3">
              {allPhotos.map((photo) => (
                <Thumbnail
                  key={photo.id}
                  photo={photo}
                  isActiveBefore={photo.id === activeBeforeId}
                  isActiveAfter={photo.id === activeAfterId}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Stats footer */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              <span className="text-slate-600 dark:text-slate-300">
                <span className="font-extrabold text-slate-800 dark:text-slate-100">
                  {photos.filter((p) => p.photo_type === 'before').length}
                </span>{' '}Before
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="text-slate-600 dark:text-slate-300">
                <span className="font-extrabold text-slate-800 dark:text-slate-100">
                  {photos.filter((p) => p.photo_type === 'after').length}
                </span>{' '}After
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Tag className="h-3.5 w-3.5" />
            <span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">{groups.length}</span>{' '}
              treatment{groups.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}
