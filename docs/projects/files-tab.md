# Files Tab

> The fourth project-workspace tab, where a member browses, uploads, downloads, and deletes the Active environment's workspace files as three curated sections. Read this before changing what the listing shows, what it hides, where uploads land, or how it stays fresh.

Before this tab, workspace files were reachable only in passing: a member could attach an upload to a prompt, and could click a `/workspace/...` link the Agent had put in chat ([File Downloads](file-downloads.md)). Nothing let them see what was actually *in* the workspace — an upload from last week, a report the Agent wrote and mentioned once, a stray file left mid-task. **Files** is that view: open the tab and the workspace is there — browsable, with upload/download and deletion of uploads and outputs — for every project member with no permission gate.

## Three sections and independent access rules

- **Project files** (`other`): workspace source including `app/` and legacy project directories. This section is read-only in Files; editing belongs in Code.
- **Output files** (`generated`): `generated_files/`.
- **User uploads** (`uploads`): `user_uploaded_files/`.

The existing API keys and section paths remain stable. Project files appear first, and the first populated section is selected on initial load. Counts represent immediate entries, not recursive totals.

`workspace-file-policy.ts` owns separate listing, private-path, and deletion rules. Listing includes source regardless of language or framework. It hides `node_modules`, `__pycache__`, dot directories, most dotfiles, `opsiforce.env.json`, workspace `data/`, and `app/data/`. Only `.gitignore`, `.dockerignore`, and `.editorconfig` are allowed dotfiles. Names such as `src/data`, `build`, `target`, and `vendor` are not guessed to be disposable; project-specific build exclusions belong in the future versioned runtime manifest.

Private-path checks apply to content/download as well as listings and are repeated against the opened file's resolved path. Existing ordinary source links still work. This deliberately closes direct reads of the known runtime configuration and data paths; it is not a general secret scanner for arbitrarily named user files.

Listings omit symlinks and directory navigation/deletion reject symlink path components. Content resolves the opened descriptor on Linux, refuses workspace escapes, and rechecks private paths. Files does not change the project's existing membership authorization.

Entries return `canDelete`; the UI only offers deletion when it is explicitly true. Only descendants of outputs/uploads may be deleted, never section roots or project files (including legacy roots). Server-side validation is authoritative even for direct DELETE requests.

Missing optional upload/output sections are empty. Missing workspaces/directories return 404; malformed section paths and filesystem failures return errors rather than empty success responses. The UI distinguishes these from an empty directory and offers Retry. Reading is not a recursive scan and does not depend on the Agent process being awake.

Navigation is Drive-shaped: pill tabs switch section, folders drill down with breadcrumbs, and a table ⇄ card toggle remembers the member's choice across reloads. There is no expand-all tree and no pagination — a workspace is small enough that a directory is one request.

Clicking a file opens it in the [file preview](file-preview.md) panel on the right — the same panel, the same formats, and the same header actions a member gets from a link the Agent posted in chat. There is one preview surface in the product and the tab is a second door into it, not a second implementation. Downloading did not move: it stays as its own button on every row and card, and again in the preview's header, so reading a file and taking a copy of it are separate gestures rather than one gesture that guesses. A format the panel cannot render is not an error here either — it opens on a download card naming the file and offering the bytes.

## Adding files

Uploading is not a button. The tab carries a slim dashed **dropzone strip** that is always visible, and the whole tab is a drop target — drag a file from the desktop anywhere onto it and it uploads. Clicking the strip picks files; a small Folder button next to it picks a directory, structure preserved. Dropping a folder works too: the drop handler walks the browser's directory entries rather than reading the flat file list, so a dragged tree arrives with the same layout a folder pick produces.

Uploads land **in the folder the member is browsing**, provided they are browsing User uploads — that is what makes organizing survive an upload. Everything else lands in the User uploads root, because uploads only ever go there. The strip says where the files will land so this is never a guess, and the drop overlay repeats it.

The client asks for that destination with an optional target path on the upload endpoint, and the server does not trust it: the path is resolved inside the workspace and then required to sit inside User uploads, with an existing target additionally required to be a real directory whose resolved path has not escaped through a symlink. A path pointing at Generated files, the App source, or anywhere above the workspace is rejected before a single byte is read. Apart from that parameter the upload endpoint is unchanged — still uncapped, still permissive about dotfiles in the *names* of uploaded files, since the Agent legitimately needs a workspace with a `.env` in it.

### One upload engine, two gestures

The composer's upload strip and the tab's dropzone are the same machinery: streamed multipart with per-file progress, an XHR fallback where request streams are unavailable, cancellation, and the NDJSON result summary. That engine lives on its own in `frontend/src/lib/upload/`, and each surface supplies only what makes it different — the URL it posts to, and what happens after.

What differs is the *meaning* of the gesture, and that difference is deliberate. A composer upload means "here, take this for what I'm about to ask", so it appends an `Uploaded files:` line into the prompt draft (written via `document.execCommand('insertText')`, because opencode's editor only picks up text that arrives through a real input event — direct DOM writes bypass its store). A tab upload means "keep this in the workspace" and injects nothing — it just refreshes the listing. Collapsing the two into one behaviour would either spam the prompt with files a member was merely filing, or lose the affordance that makes attaching in chat feel like attaching.

## Removing files

Delete is a hard, immediate, recursive delete behind a confirmation dialog — no trash, no undo, and the dialog says so, naming the file or warning that a folder takes everything inside it. There is no soft-delete tier because there is nothing to restore from: the workspace volume is the only copy, and a recycle folder would be one more thing appearing in a listing that exists to stay uncluttered.

Deleting the file a member is currently previewing closes that preview the moment the delete lands, and so does deleting a folder somewhere above it — the panel is never left displaying a file the tab has just removed.

Deletion uses canonical workspace-relative paths and rejects symlink components. Source, private paths, and section roots remain protected independently of whether they are displayed.

## Backend shape

The listing lives in the backend `files` module alongside upload and download, and reuses their path-sanitization and MIME helpers rather than restating them. That module placement matters for one non-obvious reason: **the backend pod mounts the same volume as the agent pods**, so listing a workspace is plain filesystem work. It keeps working while the Agent's pod is suspended — a member can browse and download from an idle project without waking anything.

One listing endpoint serves both shapes. Asked for the root it returns the three sections; asked for a path it returns that directory's entries. The response is discriminated on which it is, because the two are genuinely different things and collapsing them would mean inventing a fake section for every subfolder.

Authorization is the same tenant guard plus project-membership resolution that download already uses — there are no per-file ACLs and no permission gate, matching the decision that Files is visible to every member.

The listing deliberately does **not** touch environment activity, while upload, download, and delete all do. The asymmetry is the point: those three are a member deliberately reaching into a project, whereas a listing refetches on its own whenever the Agent goes idle or the member returns to the tab — so touching activity there would keep an environment awake for as long as somebody left the tab open.

## Staying fresh without polling

Files the member did not create appear while they watch, so the listing has to refresh — but polling a filesystem on a timer is waste, and a manual refresh button is an admission that the app does not know when something changed.

It already does know. The chat embed emits a debounced *agent went idle* signal, which the App preview has always used to reload its iframe. That signal is now emitted once and fanned out: the preview reloads and the Files listing refetches. The tab also refetches when the member switches back to it, which covers changes that landed while they were in Chat or Code. Nothing polls, and nothing watches the filesystem.

## See also

- [File Downloads](file-downloads.md) — the `/workspace/...` link convention and the download endpoint the tab's per-file download reuses.
- [File Preview](file-preview.md) — the side panel a click on a file name opens, and the formats it renders.
- [Document Generation](../agents/document-generation.md) — how the Agent fills the Generated files section.
- [Project Apps](project-apps.md) — the App preview panel that shares the agent-idle signal.
- Code: `backend/src/files/` (listing, curation, upload, delete, shared guards), `frontend/src/components/project/files/`, and the shared upload engine in `frontend/src/lib/upload/`.
