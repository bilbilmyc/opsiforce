# Files Tab

> The fourth project-workspace tab, where a member browses, uploads, downloads, and deletes the Active environment's workspace files as three curated sections. Read this before changing what the listing shows, what it hides, where uploads land, or how it stays fresh.

Before this tab, workspace files were reachable only in passing: a member could attach an upload to a prompt, and could click a `/workspace/...` link the Agent had put in chat ([File Downloads](file-downloads.md)). Nothing let them see what was actually *in* the workspace — an upload from last week, a report the Agent wrote and mentioned once, a stray file left mid-task. **Files** is that view: open the tab and the workspace is there — browsable, uploadable, downloadable, deletable — for every project member with no permission gate.

## Three sections, not a filesystem

The tab is deliberately not a file browser. The workspace root holds the App's source, the platform's own data folders, and a pile of tool dotfiles, none of which a member has any business seeing or removing. So the root listing is **curated on the server**, into exactly three sections:

- **Generated files** — where the Agent saves documents it produces ([Document Generation](../agents/document-generation.md)). It leads the row and is the section the tab opens on, because a finished deliverable is the thing a member most often came here for. It is created lazily on the Agent's first write, so environments that predate the convention simply show an empty section; there is no migration.
- **User uploads** — where uploads land, whether attached in the composer or dropped on this tab.
- **Other files** — whatever else sits at the workspace root, which in practice means strays the Agent left behind.

Everything else is filtered out before the response is built: the App's `app/`, the platform's `data/` and `node_modules/`, and every dotfile. The important property is that this happens **server-side**. The excluded paths are not merely hidden in the UI — the listing will not name them, the drill-down endpoint 404s on them, and the shared path guards reject them by the same rules that govern downloads. The same curation is what makes those paths undeletable: delete is scoped to the three visible roots, so the App's internals are safe by construction rather than by a second, separately-maintained rule.

Symlinks are dropped from listings entirely. A workspace is writable by the Agent, so a symlink is the obvious way to smuggle a path outside it into a view; rather than resolve each one and reason about where it points, the listing skips them and the resolved-path containment check rejects any directory reached through one.

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

Server-side, deletable paths must resolve inside the three visible roots. In practice that means anything under User uploads or Generated files, or a stray sitting directly at the workspace root — and *not* the section folders themselves, the App source, the platform's data folders, or any dotfile. Because the rule keys off the same curation the listing uses, "you can delete what you can see" holds without the two rules being able to drift apart.

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
