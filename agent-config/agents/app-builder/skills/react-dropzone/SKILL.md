---
name: react-dropzone
description: Handle file uploads with drag-and-drop using react-dropzone. Use when users need to upload files, images, documents, or any binary data. Covers drop zone UI, file preview, backend upload, and error handling.
---

# react-dropzone — File Upload

## Drop zone component

```tsx
import { useDropzone } from "react-dropzone"
import { Upload, X, FileText, Image as ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"

function FileUpload({ onUpload, accept, maxFiles = 5, maxSize = 5 * 1024 * 1024 }: {
  onUpload: (files: File[]) => void
  accept?: Record<string, string[]>
  maxFiles?: number
  maxSize?: number
}) {
  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop: onUpload,
    accept: accept ?? { "image/*": [".png", ".jpg", ".jpeg", ".webp"] },
    maxSize,
    maxFiles,
  })

  return (
    <div>
      <div {...getRootProps()} className={cn(
        "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
        isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
      )}>
        <input {...getInputProps()} />
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {isDragActive ? "Drop files here" : "Drag files here or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Max {maxFiles} files, {(maxSize / 1024 / 1024).toFixed(0)}MB each
        </p>
      </div>
      {fileRejections.length > 0 && (
        <p className="text-sm text-destructive mt-2">
          {fileRejections[0].errors[0].message}
        </p>
      )}
    </div>
  )
}
```

## Image preview with remove

```tsx
function ImagePreviewList({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2 mt-4">
      {files.map((file, i) => (
        <div key={i} className="relative group rounded-lg overflow-hidden border">
          <img src={URL.createObjectURL(file)} alt={file.name} className="w-full h-24 object-cover" />
          <button
            onClick={() => onRemove(i)}
            className="absolute top-1 right-1 rounded-full bg-background/80 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
          <p className="text-xs truncate px-1 py-0.5">{file.name}</p>
        </div>
      ))}
    </div>
  )
}
```

## Upload to backend (NestJS)

### Frontend — send with FormData

```tsx
const uploadFiles = useMutation({
  mutationFn: async (files: File[]) => {
    const formData = new FormData()
    files.forEach(file => formData.append("files", file))
    const res = await fetch("/api/uploads", { method: "POST", body: formData })
    if (!res.ok) throw new Error("Upload failed")
    return res.json()
  },
  onSuccess: () => {
    toast.success("Files uploaded")
    queryClient.invalidateQueries({ queryKey: ["uploads"] })
  },
  onError: () => toast.error("Upload failed"),
})

// Wire to dropzone
<FileUpload onUpload={(files) => uploadFiles.mutate(files)} />
{uploadFiles.isPending && <p className="text-sm text-muted-foreground">Uploading...</p>}
```

### Backend — receive files (NestJS controller)

NestJS doesn't include multer by default in this template. Handle raw multipart:

```typescript
import { Controller, Post, Req } from "@nestjs/common"
import { Request } from "express"
import { writeFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"
import { nanoid } from "nanoid"

@Controller("uploads")
export class UploadsController {
  @Post()
  async upload(@Req() req: Request) {
    const uploadsDir = join(process.cwd(), "data", "uploads")
    if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true })

    const files: { id: string; filename: string; path: string }[] = []

    // With Bun, use Bun.file() or handle raw body
    // For multipart, install busboy: cd /workspace/app && yarn add busboy @types/busboy
    // Or use a simpler approach — base64 JSON upload:
    const body = req.body as { files: { name: string; data: string }[] }
    for (const file of body.files) {
      const id = nanoid()
      const ext = file.name.split(".").pop()
      const filename = `${id}.${ext}`
      const filepath = join(uploadsDir, filename)
      writeFileSync(filepath, Buffer.from(file.data, "base64"))
      files.push({ id, filename, path: `/api/uploads/${filename}` })
    }

    return { files }
  }
}
```

**Alternative (simpler):** For small files, encode as base64 JSON instead of multipart:

```tsx
// Frontend
const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(",")[1])
    reader.readAsDataURL(file)
  })

const uploadFiles = useMutation({
  mutationFn: async (files: File[]) => {
    const encoded = await Promise.all(files.map(async (f) => ({ name: f.name, data: await toBase64(f) })))
    return fetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: encoded }),
    }).then(r => r.json())
  },
})
```

## Common accept configurations

```tsx
{ "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif"] }  // images
{ "application/pdf": [".pdf"] }                              // PDF
{ "text/csv": [".csv"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] }  // spreadsheets
{ "application/json": [".json"] }                            // JSON
```
