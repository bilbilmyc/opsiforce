# Backend upload — receive and store files (NestJS)

The backend has no multer / multipart parser wired in, and this platform stores everything through `node:sqlite` + the `data/` directory. **Send files as base64 in a JSON body** — it needs no extra dependency, goes through the normal `@Body()` pipeline, and is the right fit for the dashboard-scale files these apps handle. (Reach for streaming multipart only for very large files, which is out of scope here.)

## Frontend — encode to base64 and POST JSON

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(",")[1])
    reader.onerror = () => reject(reader.error ?? new Error("read failed"))
    reader.readAsDataURL(file)
  })

function useUploadFiles() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (files: File[]) => {
      const encoded = await Promise.all(
        files.map(async (f) => ({ name: f.name, data: await toBase64(f) })),
      )
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: encoded }),
      })
      if (!res.ok) throw new Error("Upload failed")
      return res.json() as Promise<{ files: { id: string; path: string }[] }>
    },
    onSuccess: () => {
      toast.success("Files uploaded")
      queryClient.invalidateQueries({ queryKey: ["uploads"] })
    },
    onError: () => toast.error("Upload failed"),
  })
}
```

Wire it to the drop zone from `SKILL.md`:

```tsx
const upload = useUploadFiles()

<FileUpload onUpload={(files) => upload.mutate(files)} />
{upload.isPending && <p className="text-sm text-muted-foreground">Uploading...</p>}
```

## Backend — decode and write (NestJS controller)

Files land in `data/uploads/` and are served back under `/api/uploads/<filename>`. Follow the module + controller + service split from the `nestjs-api` skill; the receive logic is:

```typescript
import { Controller, Post, Body, BadRequestException } from "@nestjs/common"
import { writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { nanoid } from "nanoid"

interface UploadBody {
  files: { name: string; data: string }[]
}

@Controller("uploads")
export class UploadsController {
  @Post()
  upload(@Body() body: UploadBody) {
    if (!Array.isArray(body.files)) throw new BadRequestException("files[] required")

    const uploadsDir = join(process.cwd(), "data", "uploads")
    if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true })

    const files = body.files.map((file) => {
      const id = nanoid()
      const ext = file.name.split(".").pop() ?? "bin"
      const filename = `${id}.${ext}`
      writeFileSync(join(uploadsDir, filename), Buffer.from(file.data, "base64"))
      return { id, path: `/api/uploads/${filename}` }
    })

    return { files }
  }
}
```

Persist the returned `path` (and any metadata) in a `node:sqlite` table if the files need to survive and be listed later — see the `sqlite` skill for the migration and `DatabaseService`.
