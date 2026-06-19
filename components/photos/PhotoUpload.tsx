'use client'

import { useState, useRef } from 'react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import {
  Upload,
  FileImage,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  X,
} from 'lucide-react'

interface PhotoUploadProps {
  /** Pre-selected patient ID. If provided, patient selector is hidden. */
  patientId: string
  /** Called after a successful upload so parent can refresh the photo list. */
  onSuccess?: (photoId: string) => void
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024

const BODY_AREAS = ['Face', 'Forehead', 'Cheeks', 'Nose', 'Chin', 'Scalp', 'Neck', 'Other']

export function PhotoUpload({ patientId, onSuccess }: PhotoUploadProps) {
  const [photoType, setPhotoType] = useState<'before' | 'after'>('before')
  const [treatment, setTreatment] = useState('')
  const [bodyArea, setBodyArea]   = useState('Face')
  const [notes, setNotes]         = useState('')
  const [file, setFile]           = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const [progress, setProgress]       = useState(0)          // 0-100
  const [uploading, setUploading]     = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [successThumb, setSuccessThumb] = useState<string | null>(null)
  const [done, setDone]               = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  // ── File selection ────────────────────────────────────────────────────────
  const handleFile = (f: File | undefined) => {
    if (!f) return
    setError(null)

    if (!ALLOWED.includes(f.type)) {
      setError('Only JPG, PNG, WEBP files are allowed.')
      return
    }
    if (f.size > MAX_BYTES) {
      setError('File exceeds the 5 MB limit.')
      return
    }

    setFile(f)
    const reader = new FileReader()
    reader.onloadend = () => setPreviewUrl(reader.result as string)
    reader.readAsDataURL(f)
  }

  const clearFile = () => {
    setFile(null)
    setPreviewUrl(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientId || !file || !treatment.trim()) return

    setUploading(true)
    setError(null)
    setProgress(0)

    try {
      // Simulate progress via XHR for real progress feedback
      const formData = new FormData()
      formData.append('file', file)
      formData.append('patientId', patientId)
      formData.append('photoType', photoType)
      formData.append('treatment', treatment.trim())
      formData.append('bodyArea', bodyArea)
      formData.append('notes', notes.trim())

      const photoId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/photos/upload')

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setProgress(Math.round((ev.loaded / ev.total) * 90)) // cap at 90 until server responds
          }
        }

        xhr.onload = () => {
          setProgress(100)
          const data = JSON.parse(xhr.responseText) as { success?: boolean; photoId?: string; error?: string }
          if (xhr.status >= 200 && xhr.status < 300 && data.photoId) {
            resolve(data.photoId)
          } else {
            reject(new Error(data.error ?? 'Upload failed'))
          }
        }

        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.send(formData)
      })

      // Fetch signed URL for the thumbnail
      const urlRes = await fetch(`/api/photos/${photoId}/url`)
      if (urlRes.ok) {
        const { url } = (await urlRes.json()) as { url: string }
        setSuccessThumb(url)
      }

      setDone(true)
      onSuccess?.(photoId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const reset = () => {
    setFile(null); setPreviewUrl(null); setTreatment('')
    setNotes(''); setProgress(0); setError(null)
    setDone(false); setSuccessThumb(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="flex flex-col items-center gap-5 p-8 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl text-center">
        <CheckCircle className="h-12 w-12 text-emerald-500" />
        <div>
          <p className="text-sm font-extrabold text-emerald-800 dark:text-emerald-300">
            Photo uploaded successfully!
          </p>
          <p className="text-xs font-semibold text-emerald-600/80 dark:text-emerald-400/80 mt-1">
            Stored securely. Accessible only via signed URLs.
          </p>
        </div>

        {successThumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={successThumb}
            alt="Uploaded photo"
            className="h-40 w-40 rounded-xl object-cover shadow-md border border-emerald-200 dark:border-emerald-800"
          />
        )}

        <div className="flex gap-2">
          <Button variant="success" size="sm" onClick={reset} className="font-bold gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Upload Another
          </Button>
        </div>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <form
      onSubmit={(e) => { void handleSubmit(e) }}
      className="flex flex-col gap-5 max-w-xl mx-auto bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
        <Upload className="h-5 w-5 text-blue-600" />
        <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
          Upload Clinical Photo
        </span>
      </div>

      {/* Photo type toggle */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider">
          Photo Type
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(['before', 'after'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setPhotoType(t)}
              className={`py-2.5 text-xs font-bold rounded-xl border-2 capitalize transition-all active:scale-[0.98] ${
                photoType === t
                  ? t === 'before'
                    ? 'bg-rose-500 border-rose-500 text-white shadow-sm'
                    : 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300'
              }`}
            >
              {t === 'before' ? '📷 Before' : '✨ After'}
            </button>
          ))}
        </div>
      </div>

      {/* Treatment + Body Area */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider">
            Treatment <span className="text-rose-500">*</span>
          </label>
          <Input
            placeholder="e.g. Chemical Peel"
            value={treatment}
            onChange={(e) => setTreatment(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider">
            Body Area
          </label>
          <select
            value={bodyArea}
            onChange={(e) => setBodyArea(e.target.value)}
            className="w-full bg-white dark:bg-slate-950 text-sm border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {BODY_AREAS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider">
          Clinical Notes
        </label>
        <textarea
          placeholder="Visual observations, assessment notes…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full bg-white dark:bg-slate-950 text-sm border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
        />
      </div>

      {/* File Drop Zone */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider">
          Image File <span className="text-rose-500">*</span>
        </label>
        <div className="relative border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 transition-colors hover:bg-slate-100/50 dark:hover:bg-slate-900/50">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />

          {previewUrl ? (
            <div className="flex flex-col items-center gap-2 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Preview"
                className="max-h-48 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 object-contain"
              />
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold">
                <span className="truncate max-w-[180px]">{file?.name}</span>
                <span>({((file?.size ?? 0) / 1024 / 1024).toFixed(1)} MB)</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); clearFile() }}
                  className="text-rose-400 hover:text-rose-600 transition-colors"
                  aria-label="Remove file"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-8 gap-2">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 text-blue-600 rounded-xl">
                <FileImage className="h-6 w-6" />
              </div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Click or drag to upload
              </p>
              <p className="text-[10px] text-slate-400 font-semibold">
                JPG · PNG · WEBP · Max 5 MB
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {uploading && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[10px] font-bold text-slate-500">
            <span>Uploading…</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        isLoading={uploading}
        disabled={!patientId || !treatment.trim() || !file || uploading}
        className="w-full py-3 font-bold shadow-md shadow-blue-500/10"
      >
        <Upload className="h-4 w-4 mr-1.5" />
        Upload & Register Photo
      </Button>
    </form>
  )
}
