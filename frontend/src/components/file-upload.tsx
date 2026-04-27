import { createMemo, createSignal, Show, type Component } from "solid-js"
import { toast } from "solid-sonner"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "~/components/ui/dropdown-menu"
import { Upload, File, Folder, ChevronDown } from "~/components/icons"

type FileEvent =
  | { type: "file"; path: string; size: number; ok: true }
  | { type: "file"; path: string; size: 0; ok: false; error: string }
type DoneEvent = {
  type: "done"
  uploaded: number
  failed: number
}
type ErrorEvent = {
  type: "error"
  error: string
  uploaded: number
  failed: number
}
type UploadEvent = FileEvent | DoneEvent | ErrorEvent

interface UploadResult {
  uploaded: number
  failed: number
  firstError?: { path: string; error: string }
}

type StreamingRequestInit = RequestInit & { duplex: "half" }

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function relativePathOf(file: File): string {
  return (
    (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
    file.name
  )
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function getUploadFile(files: FileList | File[], index: number): File {
  if (Array.isArray(files)) return files[index]
  const file = files.item(index)
  if (!file) throw new Error("Selected file is no longer available")
  return file
}

function multipartBoundary(): string {
  return `----opsiforce-upload-${crypto.randomUUID()}`
}

function multipartHeaderValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n]/g, " ")
}

function multipartFileHeader(
  boundary: string,
  path: string,
  file: File,
): Uint8Array {
  const contentType = file.type || "application/octet-stream"
  return new TextEncoder().encode(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${multipartHeaderValue(path)}"; filename="${multipartHeaderValue(file.name)}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  )
}

function multipartText(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

async function* multipartChunks(
  files: FileList | File[],
  boundary: string,
  signal: AbortSignal,
  onFileBytes: (bytes: number) => void,
): AsyncGenerator<Uint8Array> {
  let sentFileBytes = 0

  for (let i = 0; i < files.length; i++) {
    if (signal.aborted) throw new DOMException("Upload cancelled", "AbortError")

    const file = getUploadFile(files, i)
    yield multipartFileHeader(boundary, relativePathOf(file), file)

    const reader = file.stream().getReader()
    try {
      while (true) {
        if (signal.aborted)
          throw new DOMException("Upload cancelled", "AbortError")
        const { done, value } = await reader.read()
        if (done) break
        sentFileBytes += value.byteLength
        onFileBytes(sentFileBytes)
        yield value
      }
    } finally {
      reader.releaseLock()
    }

    yield multipartText("\r\n")
  }

  yield multipartText(`--${boundary}--\r\n`)
}

function streamingMultipartBody(
  files: FileList | File[],
  boundary: string,
  signal: AbortSignal,
  onFileBytes: (bytes: number) => void,
): ReadableStream<Uint8Array> {
  const chunks = multipartChunks(files, boundary, signal, onFileBytes)

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await chunks.next()
      if (next.done) {
        controller.close()
        return
      }
      controller.enqueue(next.value)
    },
    async cancel() {
      await chunks.return(undefined)
    },
  })
}

const FileUpload: Component<{ projectId: string }> = (props) => {
  const [uploading, setUploading] = createSignal(false)
  const [totalFiles, setTotalFiles] = createSignal(0)
  const [preparedFiles, setPreparedFiles] = createSignal(0)
  const [totalBytes, setTotalBytes] = createSignal(0)
  const [sentBytes, setSentBytes] = createSignal(0)
  const [currentName, setCurrentName] = createSignal("")

  let activeAbortController: AbortController | undefined
  let cancelRequested = false
  let fileInputRef: HTMLInputElement | undefined
  let folderInputRef: HTMLInputElement | undefined

  const visibleBytes = createMemo(() => Math.min(totalBytes(), sentBytes()))
  const percent = createMemo(() => {
    if (uploading() && totalBytes() === 0 && totalFiles() > 0) {
      return Math.min(99, Math.floor((preparedFiles() / totalFiles()) * 100))
    }
    const total = totalBytes()
    if (total === 0) return 0
    const value = Math.floor((visibleBytes() / total) * 100)
    return Math.min(100, value)
  })

  async function uploadFiles(
    files: FileList | File[],
    resetInput?: () => void,
  ) {
    if (files.length === 0) return

    setTotalFiles(files.length)
    setPreparedFiles(0)
    setTotalBytes(0)
    setSentBytes(0)
    setCurrentName("Preparing upload")
    setUploading(true)
    cancelRequested = false

    await nextFrame()

    try {
      let totalData = 0
      for (let i = 0; i < files.length; i++) {
        if (cancelRequested) throw new Error("cancelled")
        const file = getUploadFile(files, i)
        totalData += file.size

        if (i === files.length - 1 || (i > 0 && i % 250 === 0)) {
          setPreparedFiles(i + 1)
          await nextFrame()
        }
      }
      setTotalBytes(totalData)
      setCurrentName("Sending files")
      await nextFrame()

      const result = await sendUpload(files, totalData)
      showUploadResult(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === "cancelled") toast.info("Upload cancelled")
      else toast.error(msg)
    } finally {
      activeAbortController = undefined
      setUploading(false)
      resetInput?.()
    }
  }

  function sendUpload(
    files: FileList | File[],
    totalData: number,
  ): Promise<UploadResult> {
    const tenant = localStorage.getItem("tenant")
    const boundary = multipartBoundary()
    const controller = new AbortController()
    activeAbortController = controller
    let lastProgressAt = 0
    const headers: Record<string, string> = {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "x-upload-events": "summary",
    }
    if (tenant) headers["x-tenant-name"] = tenant

    const body = streamingMultipartBody(
      files,
      boundary,
      controller.signal,
      (bytes) => {
        const now = Date.now()
        if (now - lastProgressAt < 50 && bytes < totalData) return
        lastProgressAt = now
        const sent = Math.min(totalData, bytes)
        setSentBytes(sent)
        setCurrentName(sent >= totalData ? "Finishing upload" : "Sending files")
      },
    )

    return fetch(`/api/projects/${props.projectId}/upload`, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      duplex: "half",
    } as StreamingRequestInit)
      .then(async (response) => {
        const text = await response.text()
        activeAbortController = undefined
        if (!response.ok) {
          let message = `Upload failed (${response.status})`
          try {
            const body = JSON.parse(text) as {
              error?: string
              message?: string
            }
            message = body.error || body.message || message
          } catch {}
          throw new Error(message)
        }
        setSentBytes(totalData)
        setCurrentName("Finishing upload")
        return parseUploadEvents(text)
      })
      .catch((err) => {
        activeAbortController = undefined
        if (err instanceof DOMException && err.name === "AbortError") {
          throw new Error("cancelled")
        }
        throw err
      })
  }

  function parseUploadEvents(text: string): UploadResult {
    let doneEvent: DoneEvent | undefined
    let errorEvent: ErrorEvent | undefined
    let firstError: { path: string; error: string } | undefined

    for (const line of text.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let event: UploadEvent
      try {
        event = JSON.parse(trimmed) as UploadEvent
      } catch {
        continue
      }

      if (event.type === "file") {
        if (!event.ok && !firstError) {
          firstError = { path: event.path, error: event.error }
        }
      } else if (event.type === "done") {
        doneEvent = event
      } else if (event.type === "error") {
        errorEvent = event
      }
    }

    if (errorEvent) throw new Error(errorEvent.error)
    if (!doneEvent) throw new Error("Upload stream ended before completion")
    return {
      uploaded: doneEvent.uploaded,
      failed: doneEvent.failed,
      firstError,
    }
  }

  function showUploadResult(result: UploadResult) {
    if (result.failed === 0) {
      toast.success(
        `${result.uploaded} file${result.uploaded !== 1 ? "s" : ""} uploaded`,
      )
    } else if (result.uploaded === 0) {
      toast.error(
        `All ${result.failed} upload${result.failed !== 1 ? "s" : ""} failed`,
        {
          description: result.firstError
            ? `${result.firstError.path} - ${result.firstError.error}`
            : undefined,
        },
      )
    } else {
      toast.warning(`${result.uploaded} uploaded, ${result.failed} failed`, {
        description: result.firstError
          ? `First error: ${result.firstError.path} - ${result.firstError.error}`
          : undefined,
      })
    }
  }

  function cancelUpload() {
    cancelRequested = true
    activeAbortController?.abort()
  }

  return (
    <>
      <div class="shrink-0 border-t border-border bg-background px-3 py-2">
        <Show
          when={!uploading()}
          fallback={
            <div class="flex flex-col gap-1.5">
              <div class="flex h-7 items-center gap-3">
                <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full bg-primary rounded-full transition-all duration-150"
                    style={{ width: `${percent()}%` }}
                  />
                </div>
                <span class="text-xs text-muted-foreground tabular-nums w-9 text-right">
                  {percent()}%
                </span>
                <button
                  onClick={cancelUpload}
                  class="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                >
                  Cancel
                </button>
              </div>
              <div class="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span class="truncate" title={currentName()}>
                  {currentName() || "Uploading…"}
                </span>
                <span class="tabular-nums shrink-0">
                  <Show
                    when={totalBytes() > 0}
                    fallback={`${preparedFiles()} / ${totalFiles()} files`}
                  >
                    {formatBytes(visibleBytes())} / {formatBytes(totalBytes())}
                  </Show>
                </span>
              </div>
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
          const input = e.currentTarget
          if (input.files) uploadFiles(input.files, () => (input.value = ""))
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        class="hidden"
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => {
          const input = e.currentTarget
          if (input.files) uploadFiles(input.files, () => (input.value = ""))
        }}
      />
    </>
  )
}

export default FileUpload
