'use client'

import { type UploadBucket, uploadImage, validateFile } from '@/lib/storage/upload'
import { ImagePlus, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { useRef, useState } from 'react'

interface Props {
  bucket: UploadBucket
  folder: string
  value: string[]
  onChange: (urls: string[]) => void
  maxFiles?: number
}

export default function ImageUploader({ bucket, folder, value, onChange, maxFiles = 5 }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList) {
    setError(null)
    if (value.length + files.length > maxFiles) {
      setError(`ניתן להעלות עד ${maxFiles} תמונות`)
      return
    }

    const validFiles: File[] = []
    for (const file of Array.from(files)) {
      const err = validateFile(file, bucket)
      if (err) {
        setError(err)
        return
      }
      validFiles.push(file)
    }

    setUploading(true)
    try {
      const uploaded = await Promise.all(validFiles.map((f) => uploadImage(f, bucket, folder)))
      onChange([...value, ...uploaded.map((u) => u.url)])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת העלאה')
    } finally {
      setUploading(false)
    }
  }

  function removeImage(url: string) {
    onChange(value.filter((u) => u !== url))
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
                onClick={() => removeImage(url)}
                className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="מחיקת תמונה"
              >
                <Trash2 size={16} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {value.length < maxFiles && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-brand hover:text-brand transition-colors disabled:opacity-60"
        >
          <ImagePlus size={16} />
          {uploading ? 'מעלה...' : 'הוספת תמונות'}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
