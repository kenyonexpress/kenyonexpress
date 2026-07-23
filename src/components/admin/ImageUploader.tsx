'use client'

import { isValidHebrewAlt, validateImageFile } from '@/lib/images/validate'
import { processAndUploadImage } from '@/server/actions/admin/images'
import { ImagePlus, Trash2, Upload } from 'lucide-react'
import Image from 'next/image'
import { useRef, useState } from 'react'

interface Props {
  /** Supabase fallback bucket (R2 is preferred when configured server-side). */
  bucket: string
  folder: string
  value: string[]
  onChange: (urls: string[]) => void
  maxFiles?: number
}

interface StagedFile {
  key: string
  file: File
  previewUrl: string
  alt: string
}

/**
 * Image upload with a mandatory Hebrew alt-text step. Files are staged with a
 * preview + alt input; upload is blocked until every image has a Hebrew alt.
 * The server pipeline converts to webp/avif in multiple sizes, generates a
 * blur placeholder and registers everything in media_assets.
 */
export default function ImageUploader({ bucket, folder, value, onChange, maxFiles = 5 }: Props) {
  const [staged, setStaged] = useState<StagedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function stageFiles(files: FileList) {
    setError(null)
    if (value.length + staged.length + files.length > maxFiles) {
      setError(`ניתן להעלות עד ${maxFiles} תמונות`)
      return
    }
    const next: StagedFile[] = []
    for (const file of Array.from(files)) {
      const err = validateImageFile(file)
      if (err) {
        setError(err)
        return
      }
      next.push({
        key: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        alt: '',
      })
    }
    setStaged((prev) => [...prev, ...next])
  }

  function unstage(key: string) {
    setStaged((prev) => {
      const found = prev.find((s) => s.key === key)
      if (found) URL.revokeObjectURL(found.previewUrl)
      return prev.filter((s) => s.key !== key)
    })
  }

  function setAlt(key: string, alt: string) {
    setStaged((prev) => prev.map((s) => (s.key === key ? { ...s, alt } : s)))
  }

  const allAltsValid = staged.length > 0 && staged.every((s) => isValidHebrewAlt(s.alt))

  async function uploadStaged() {
    if (!allAltsValid) return
    setUploading(true)
    setError(null)
    try {
      const urls: string[] = []
      for (const s of staged) {
        const formData = new FormData()
        formData.set('file', s.file)
        formData.set('alt_he', s.alt.trim())
        formData.set('folder', folder)
        formData.set('bucket', bucket)
        const result = await processAndUploadImage(formData)
        if ('error' in result) throw new Error(result.error)
        urls.push(result.url)
      }
      for (const s of staged) URL.revokeObjectURL(s.previewUrl)
      setStaged([])
      onChange([...value, ...urls])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת העלאה')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {value.map((url) => (
            <div key={url} className="relative group w-24 h-24">
              <Image
                src={url}
                alt="תמונת מוצר"
                fill
                className="object-cover rounded-lg border border-gray-200"
              />
              <button
                type="button"
                onClick={() => onChange(value.filter((u) => u !== url))}
                className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="מחיקת תמונה"
              >
                <Trash2 size={16} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {staged.length > 0 && (
        <div className="space-y-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
          <p className="text-xs font-medium text-gray-600">
            לפני ההעלאה: הזינו טקסט חלופי בעברית לכל תמונה (נדרש לנגישות ולקידום)
          </p>
          {staged.map((s) => (
            <div key={s.key} className="flex items-center gap-3">
              {/* Local object-URL preview; next/image cannot optimize blob: URLs */}
              <img
                src={s.previewUrl}
                alt=""
                className="w-12 h-12 rounded object-cover border border-gray-200 shrink-0"
              />
              <div className="flex-1">
                <input
                  value={s.alt}
                  onChange={(e) => setAlt(s.key, e.target.value)}
                  placeholder="טקסט חלופי בעברית, למשל: אוזניות אלחוטיות שחורות"
                  aria-label={`טקסט חלופי עבור ${s.file.name}`}
                  className={`w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand ${
                    s.alt && !isValidHebrewAlt(s.alt) ? 'border-red-400' : 'border-gray-300'
                  }`}
                />
                {s.alt && !isValidHebrewAlt(s.alt) && (
                  <p className="text-xs text-red-600 mt-0.5">
                    נדרש טקסט בעברית באורך 3 תווים לפחות
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => unstage(s.key)}
                className="text-gray-400 hover:text-red-600 shrink-0"
                aria-label={`הסרת ${s.file.name}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => void uploadStaged()}
            disabled={!allAltsValid || uploading}
            className="inline-flex items-center gap-2 bg-brand hover:bg-[#fedd26] disabled:opacity-50 text-brand-dark font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
          >
            <Upload size={14} />
            {uploading ? 'מעבד ומעלה...' : `העלאת ${staged.length} תמונות`}
          </button>
        </div>
      )}

      {value.length + staged.length < maxFiles && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-brand hover:text-brand transition-colors disabled:opacity-60"
        >
          <ImagePlus size={16} />
          בחירת תמונות
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) stageFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
