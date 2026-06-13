'use client'
import { useState } from 'react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Upload, FileImage, CheckCircle } from 'lucide-react'
import { Database } from '@/types/database'

type Patient = Database['public']['Tables']['patients']['Row']

interface PhotoUploadProps {
  patients: Patient[]
  onUpload: (payload: {
    patientId: string
    photoType: 'before' | 'after'
    treatment: string
    bodyArea: string
    notes: string
    file: File
  }) => Promise<void>
}

export function PhotoUpload({ patients, onUpload }: PhotoUploadProps) {
  const [patientId, setPatientId] = useState('')
  const [photoType, setPhotoType] = useState<'before' | 'after'>('before')
  const [treatment, setTreatment] = useState('')
  const [bodyArea, setBodyArea] = useState('Face')
  const [notes, setNotes] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)

    // Enforce Image type validation
    if (!file.type.startsWith('image/')) {
      setError('Invalid file type. Please upload a clinical image file (JPG, PNG, WEBP).')
      return
    }

    // Enforce 5MB file size limit (5 * 1024 * 1024 bytes)
    if (file.size > 5 * 1024 * 1024) {
      setError('File exceeds maximum size limit. Maximum allowed size is 5MB.')
      return
    }

    setSelectedFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientId || !treatment || !selectedFile) return

    try {
      setLoading(true)
      setError(null)
      await onUpload({
        patientId,
        photoType,
        treatment,
        bodyArea,
        notes,
        file: selectedFile,
      })
      setSuccess(true)
      setSelectedFile(null)
      setPreviewUrl(null)
      setNotes('')
    } catch (err: unknown) {
      console.error('Photo upload failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to upload clinical photo')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl text-center">
        <CheckCircle className="h-14 w-14 mb-4" />
        <h3 className="text-base font-extrabold mb-1">
          Photo Uploaded Successfully!
        </h3>
        <p className="text-xs font-semibold max-w-sm mb-4">
          The photo is stored securely, and logged in the patient's visual treatment diary.
        </p>
        <Button variant="outline" size="sm" onClick={() => setSuccess(false)}>
          Upload Another Photo
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-w-xl mx-auto bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
        <Upload className="h-5 w-5 text-blue-600" />
        <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
          Upload Clinical Photo
        </span>
      </div>

      {/* Select Patient */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">
          Select Patient
        </label>
        <select
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          required
          className="w-full bg-white dark:bg-slate-950 text-sm border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">Choose Patient...</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name} ({p.phone})
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Photo Type */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">
            Photo Interval
          </label>
          <div className="flex gap-2">
            {(['before', 'after'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setPhotoType(type)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg border capitalize transition-all active:scale-[0.98] focus:outline-none ${
                  photoType === type
                    ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                    : 'bg-white border-slate-200 dark:bg-slate-950 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Body Area */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">
            Body Area
          </label>
          <select
            value={bodyArea}
            onChange={(e) => setBodyArea(e.target.value)}
            className="w-full bg-white dark:bg-slate-950 text-sm border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="Face">Face</option>
            <option value="Forehead">Forehead</option>
            <option value="Cheeks">Cheeks</option>
            <option value="Nose">Nose</option>
            <option value="Chin">Chin</option>
            <option value="Scalp">Scalp</option>
            <option value="Neck">Neck</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      {/* Treatment Type */}
      <Input
        label="Treatment / Procedure"
        placeholder="e.g. Chemical Peel, CO2 Laser, PRP"
        value={treatment}
        onChange={(e) => setTreatment(e.target.value)}
        required
      />

      {/* Notes */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">
          Clinical Notes / Assessment
        </label>
        <textarea
          placeholder="Enter visual observation notes..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full bg-white dark:bg-slate-950 text-sm border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      {/* File Upload Box */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">
          Upload Image File
        </label>
        <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100/50 dark:hover:bg-slate-900/50 transition-colors flex flex-col items-center justify-center text-center cursor-pointer relative">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            required
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          {previewUrl ? (
            <div className="flex flex-col items-center gap-2">
              <img src={previewUrl} alt="Preview" className="max-h-36 rounded-lg shadow-sm border border-slate-200" />
              <span className="text-[10px] text-slate-400 font-bold">{selectedFile?.name}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center py-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 text-blue-600 rounded-xl mb-2.5">
                <FileImage className="h-[22px] w-[22px]" />
              </div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Click to browse files
              </p>
              <p className="text-[10px] text-slate-400 font-semibold mt-1">
                Supports JPG, PNG, WEBP (Max 5MB)
              </p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl">
          {error}
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        isLoading={loading}
        disabled={!patientId || !treatment || !selectedFile}
        className="w-full py-3 shadow-md shadow-blue-500/10 font-bold"
      >
        Upload & Register Photo
      </Button>
    </form>
  )
}
