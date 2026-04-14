import { createSignal, Show, type Component } from "solid-js"
import { toast } from "solid-sonner"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "~/components/ui/dropdown-menu"
import { Upload, File, Folder, ChevronDown } from "~/components/icons"

const FileUpload: Component<{ projectId: string }> = (props) => {
  const [uploading, setUploading] = createSignal(false)
  const [progress, setProgress] = createSignal(0)

  let fileInputRef: HTMLInputElement | undefined
  let folderInputRef: HTMLInputElement | undefined
  let activeXhr: XMLHttpRequest | undefined

  async function uploadFiles(files: FileList | File[]) {
    const fileArray = Array.from(files)
    if (!fileArray.length) return
    setUploading(true)
    setProgress(0)

    const formData = new FormData()
    for (const file of fileArray) {
      const relativePath =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
        file.name
      formData.append(relativePath, file)
    }

    const tenant = localStorage.getItem("tenant")

    try {
      const result = await new Promise<{
        uploaded: number
        files: Array<{ path: string; size: number }>
      }>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        activeXhr = xhr
        xhr.open("POST", `/api/projects/${props.projectId}/upload`)
        if (tenant) xhr.setRequestHeader("x-tenant-name", tenant)

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            setProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText))
          } else {
            try {
              const body = JSON.parse(xhr.responseText)
              reject(new Error(body.error || `Upload failed: ${xhr.status}`))
            } catch {
              reject(new Error(`Upload failed: ${xhr.status}`))
            }
          }
        }
        xhr.onerror = () => reject(new Error("Upload failed"))
        xhr.onabort = () => reject(new Error("Upload cancelled"))
        xhr.send(formData)
      })
      toast.success(`${result.uploaded} file${result.uploaded !== 1 ? "s" : ""} uploaded`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      activeXhr = undefined
      setUploading(false)
      setProgress(0)
    }
  }

  function cancelUpload() {
    activeXhr?.abort()
  }

  return (
    <>
      <div class="shrink-0 border-t border-border bg-background px-3 py-2">
        <Show
          when={!uploading()}
          fallback={
            <div class="flex h-7 items-center gap-3">
              <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${progress()}%` }}
                />
              </div>
              <span class="text-xs text-muted-foreground tabular-nums w-9 text-right">
                {progress()}%
              </span>
              <button
                onClick={cancelUpload}
                class="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              >
                Cancel
              </button>
            </div>
          }
        >
          <div class="flex h-7 items-center">
            <DropdownMenu>
              <DropdownMenuTrigger class="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[expanded]:bg-accent data-[expanded]:text-foreground">
                <Upload class="h-3.5 w-3.5" />
                Upload
                <ChevronDown class="h-3 w-3 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent class="min-w-36">
                <DropdownMenuItem onSelect={() => fileInputRef?.click()}>
                  <File class="h-3.5 w-3.5" />
                  Files
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => folderInputRef?.click()}>
                  <Folder class="h-3.5 w-3.5" />
                  Folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Show>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        class="hidden"
        onChange={(e) => {
          if (e.target.files) uploadFiles(e.target.files)
          e.target.value = ""
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        class="hidden"
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => {
          if (e.target.files) uploadFiles(e.target.files)
          e.target.value = ""
        }}
      />
    </>
  )
}

export default FileUpload
