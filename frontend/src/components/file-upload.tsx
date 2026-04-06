import { createSignal, Show, type Component } from "solid-js"
import { toast } from "solid-sonner"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "~/components/ui/dropdown-menu"

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
      <div class="shrink-0 border-t border-border bg-sidebar px-2 py-1.5">
        <Show
          when={!uploading()}
          fallback={
            <div class="flex h-7 items-center gap-2 px-1">
              <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full bg-primary transition-all"
                  style={{ width: `${progress()}%` }}
                />
              </div>
              <span class="text-[11px] text-muted-foreground tabular-nums">
                {progress()}%
              </span>
              <button
                onClick={cancelUpload}
                class="h-6 rounded px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
              >
                Cancel
              </button>
            </div>
          }
        >
          <div class="flex h-7 items-center">
            <DropdownMenu>
              <DropdownMenuTrigger class="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
                <svg
                  class="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
                Upload
                <svg
                  class="h-3 w-3 opacity-50"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => fileInputRef?.click()}>
                  <svg
                    class="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                  Files
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => folderInputRef?.click()}>
                  <svg
                    class="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
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
