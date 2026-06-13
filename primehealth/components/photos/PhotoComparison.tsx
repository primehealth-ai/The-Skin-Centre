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
} from 'lucide-react'
import type { Database } from '@/types/database'

export const dynamic = 'force-dynamic'

// ─── Types ───────────────────────────────────────────────────────────────────
type Photo = Database['public']['Tables']['patient_photos']['Row']

interface PhotoComparisonProps {
  photos: Photo[]
}

interface TreatmentGroup {
  treatment: string
  before: Photo[]
  after: Photo[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
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
    const group = map.get(photo.treatment)!
    if (photo.photo_type === 'before') group.before.push(photo)
    else group.after.push(photo)
  }
  return Array.from(map.values())
}

// ─── Sub-component: Comparison Slider ────────────────────────────────────────
interface SliderProps {
  beforePhoto: Photo
  afterPhoto: Photo
}

function ComparisonSlider({ beforePhoto, afterPhoto }: SliderProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const [sliderPos, setSliderPos] = useState(50) // percentage 0-100

  const clamp = (v: number) => Math.min(100, Math.max(0, v))

  const posFromEvent = useCallback((clientX: number): number => {
    const el = containerRef.current
    if (!el) return 50
    const { left, width } = el.getBoundingClientRect()
    return clamp(((clientX - left) / width) * 100)
  }, [])

  // ── Mouse events ─────────────────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDragging.current = true
      setSliderPos(posFromEvent(e.clientX))
    },
    [posFromEvent],
  )

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      setSliderPos(posFromEvent(e.clientX))
    }
    const onMouseUp = () => {
      isDragging.current = false
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [posFromEvent])

  // ── Touch events ──────────────────────────────────────────────────────────
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      isDragging.current = true
      setSliderPos(posFromEvent(e.touches[0].clientX))
    },
    [posFromEvent],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging.current) return
      e.preventDefault()
      setSliderPos(posFromEvent(e.touches[0].clientX))
    },
    [posFromEvent],
  )

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none overflow-hidden rounded-2xl"
      style={{ aspectRatio: '4/3', cursor: 'col-resize' }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── BEFORE photo (full width, base layer) ───────────────────────── */}
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={beforePhoto.photo_url}
          alt="Before"
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>

      {/* ── AFTER photo (clipped to left portion) ───────────────────────── */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={afterPhoto.photo_url}
          alt="After"
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>

      {/* ── Gradient overlays for depth ──────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-black/10" />

      {/* ── Vertical divider line ────────────────────────────────────────── */}
      <div
        className="absolute inset-y-0 z-20 w-0.5 bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)]"
        style={{ left: `${sliderPos}%`, transform: 'translateX(-50%)' }}
      />

      {/* ── Drag handle (circle with arrows) ────────────────────────────── */}
      <div
        className="absolute top-1/2 z-30 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_4px_24px_rgba(0,0,0,0.30)] ring-2 ring-white/60 transition-transform duration-75"
        style={{ left: `${sliderPos}%` }}
      >
        <ChevronLeft className="h-4 w-4 text-slate-700" strokeWidth={2.5} />
        <ChevronRight className="h-4 w-4 text-slate-700" strokeWidth={2.5} />
      </div>

      {/* ── AFTER badge (top-left) ───────────────────────────────────────── */}
      <div className="pointer-events-none absolute left-3 top-3 z-10">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold tracking-widest text-white shadow-lg">
          <Sparkles className="h-3 w-3" />
          AFTER
        </span>
      </div>

      {/* ── BEFORE badge (top-right) ─────────────────────────────────────── */}
      <div className="pointer-events-none absolute right-3 top-3 z-10">
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-3 py-1 text-xs font-bold tracking-widest text-white shadow-lg">
          BEFORE
        </span>
      </div>

      {/* ── Drag hint (fades after mount) ────────────────────────────────── */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
          <Move className="h-3 w-3" />
          Drag to compare
        </span>
      </div>
    </div>
  )
}

// ─── Sub-component: Single Photo View ────────────────────────────────────────
function SinglePhotoView({ photo, missing }: { photo: Photo; missing: 'before' | 'after' }) {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl" style={{ aspectRatio: '4/3' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.photo_url}
        alt={photo.photo_type}
        className="h-full w-full object-cover"
        draggable={false}
      />
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-black/10" />
      <div className="absolute left-3 top-3">
        {photo.photo_type === 'after' ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold tracking-widest text-white shadow-lg">
            <Sparkles className="h-3 w-3" />
            AFTER
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-3 py-1 text-xs font-bold tracking-widest text-white shadow-lg">
            BEFORE
          </span>
        )}
      </div>
      {/* Missing counterpart notice */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-4">
        <p className="flex items-center gap-1.5 text-xs text-amber-300">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          No {missing} photo uploaded yet
        </p>
      </div>
    </div>
  )
}

// ─── Sub-component: Empty State ───────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-20 dark:border-slate-700 dark:bg-slate-900/40">
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

// ─── Sub-component: Thumbnail Grid ───────────────────────────────────────────
interface ThumbnailGridProps {
  photos: Photo[]
  activeBeforeId: string | null
  activeAfterId: string | null
  onSelect: (photo: Photo, slot: 'before' | 'after') => void
}

function ThumbnailGrid({ photos, activeBeforeId, activeAfterId, onSelect }: ThumbnailGridProps) {
  if (photos.length === 0) return null

  return (
    <div className="mt-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        All Photos — click to set as Before / After
      </p>
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-4">
        {photos.map((photo) => {
          const isActiveBefore = photo.id === activeBeforeId
          const isActiveAfter = photo.id === activeAfterId
          const isActive = isActiveBefore || isActiveAfter

          return (
            <div key={photo.id} className="group relative">
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
                onClick={() =>
                  onSelect(photo, photo.photo_type === 'before' ? 'before' : 'after')
                }
                aria-label={`Set ${photo.photo_type} photo as active ${photo.photo_type}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.photo_url}
                  alt={`${photo.photo_type} - ${photo.treatment}`}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
                {/* Overlay on hover: choose slot */}
                <div
                  className={`absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 transition-opacity duration-200 ${
                    isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelect(photo, 'before')
                    }}
                    className="w-16 rounded-md bg-rose-500 py-0.5 text-[10px] font-bold text-white hover:bg-rose-600 active:scale-95"
                  >
                    BEFORE
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelect(photo, 'after')
                    }}
                    className="w-16 rounded-md bg-emerald-500 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-600 active:scale-95"
                  >
                    AFTER
                  </button>
                </div>
              </button>

              {/* Type badge */}
              <div className="absolute left-1.5 top-1.5 z-10 pointer-events-none">
                {photo.photo_type === 'after' ? (
                  <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">
                    A
                  </span>
                ) : (
                  <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">
                    B
                  </span>
                )}
              </div>

              {/* Active ring label */}
              {isActiveBefore && (
                <div className="absolute bottom-1.5 left-0 right-0 flex justify-center pointer-events-none">
                  <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[9px] font-bold text-white shadow">
                    BEFORE ✓
                  </span>
                </div>
              )}
              {isActiveAfter && (
                <div className="absolute bottom-1.5 left-0 right-0 flex justify-center pointer-events-none">
                  <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-bold text-white shadow">
                    AFTER ✓
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function PhotoComparison({ photos }: PhotoComparisonProps) {
  const groups = groupByTreatment(photos)
  const [selectedTreatment, setSelectedTreatment] = useState<string>(
    groups[0]?.treatment ?? '',
  )

  // Active photo IDs (what's shown in the slider)
  const [activeBeforeId, setActiveBeforeId] = useState<string | null>(null)
  const [activeAfterId, setActiveAfterId] = useState<string | null>(null)

  // Initialise active photos when treatment changes
  useEffect(() => {
    if (!selectedTreatment) return
    const group = groups.find((g) => g.treatment === selectedTreatment)
    if (!group) return
    setActiveBeforeId(group.before[0]?.id ?? null)
    setActiveAfterId(group.after[0]?.id ?? null)
  }, [selectedTreatment]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleThumbnailSelect = useCallback((photo: Photo, slot: 'before' | 'after') => {
    if (slot === 'before') setActiveBeforeId(photo.id)
    else setActiveAfterId(photo.id)
  }, [])

  // Derived state
  const currentGroup = groups.find((g) => g.treatment === selectedTreatment)
  const allPhotosForTreatment = [
    ...(currentGroup?.before ?? []),
    ...(currentGroup?.after ?? []),
  ]
  const activeBefore = allPhotosForTreatment.find((p) => p.id === activeBeforeId) ?? null
  const activeAfter = allPhotosForTreatment.find((p) => p.id === activeAfterId) ?? null

  // ── Render: no photos ──────────────────────────────────────────────────────
  if (photos.length === 0) {
    return (
      <Card className="max-w-3xl mx-auto p-6">
        <EmptyState />
      </Card>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* ── Header card ────────────────────────────────────────────────────── */}
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
          Drag the handle to reveal treatment results
        </p>
      </Card>

      {/* ── Comparison viewer card ───────────────────────────────────────── */}
      <Card className="p-5 space-y-5">
        {/* Treatment selector */}
        {groups.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
              <Tag className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            </div>
            <div className="flex-1">
              <label
                htmlFor="treatment-select"
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
              >
                Treatment
              </label>
              <select
                id="treatment-select"
                value={selectedTreatment}
                onChange={(e) => setSelectedTreatment(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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

        {/* Photo info row */}
        {(activeBefore ?? activeAfter) && (
          <div className="flex flex-wrap items-center gap-3">
            {activeBefore && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  Before:{' '}
                  <span className="font-semibold text-rose-600 dark:text-rose-400">
                    {formatDate(activeBefore.taken_at)}
                  </span>
                </span>
              </div>
            )}
            {activeAfter && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  After:{' '}
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatDate(activeAfter.taken_at)}
                  </span>
                </span>
              </div>
            )}
            {activeBefore?.body_area && (
              <Badge variant="secondary">{activeBefore.body_area}</Badge>
            )}
          </div>
        )}

        {/* ── Main visual area ──────────────────────────────────────────── */}
        {activeBefore && activeAfter ? (
          <ComparisonSlider beforePhoto={activeBefore} afterPhoto={activeAfter} />
        ) : activeBefore ? (
          <SinglePhotoView photo={activeBefore} missing="after" />
        ) : activeAfter ? (
          <SinglePhotoView photo={activeAfter} missing="before" />
        ) : (
          // Treatment group exists but no photos
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-16 dark:border-slate-700 dark:bg-slate-900/40">
            <ImageOff className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              No photos for this treatment
            </p>
          </div>
        )}

        {/* Notes row */}
        {(activeBefore?.notes ?? activeAfter?.notes) && (
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Notes
            </p>
            {activeBefore?.notes && (
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                <span className="font-semibold text-rose-500">Before: </span>
                {activeBefore.notes}
              </p>
            )}
            {activeAfter?.notes && (
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                <span className="font-semibold text-emerald-500">After: </span>
                {activeAfter.notes}
              </p>
            )}
          </div>
        )}

        {/* ── Thumbnails ───────────────────────────────────────────────── */}
        <ThumbnailGrid
          photos={allPhotosForTreatment}
          activeBeforeId={activeBeforeId}
          activeAfterId={activeAfterId}
          onSelect={handleThumbnailSelect}
        />
      </Card>

      {/* ── Stats footer card ────────────────────────────────────────────── */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              <span className="text-slate-600 dark:text-slate-300">
                <span className="font-extrabold text-slate-800 dark:text-slate-100">
                  {photos.filter((p) => p.photo_type === 'before').length}
                </span>{' '}
                Before
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="text-slate-600 dark:text-slate-300">
                <span className="font-extrabold text-slate-800 dark:text-slate-100">
                  {photos.filter((p) => p.photo_type === 'after').length}
                </span>{' '}
                After
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Tag className="h-3.5 w-3.5" />
            <span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {groups.length}
              </span>{' '}
              treatment{groups.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}
