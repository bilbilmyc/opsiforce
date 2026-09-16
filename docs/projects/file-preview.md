# File Preview

> How a member reads a deliverable the Agent produced without downloading it: the side panel that hosts either the App or a file, the chat links that open it, and the inline content endpoint and office converter behind it. Read this before changing the panel's modes, what formats render, or how `/workspace/...` links behave.

Before this, a finished document was a dead end in the product. The Agent wrote a report, [linked it in chat](file-downloads.md), and clicking that link pushed a file into the member's Downloads folder — the actual reading happened in Word, Preview, or a browser tab, outside Opsiforce. **File preview** closes that loop: click the link the Agent posted and the document renders in the right side panel, next to the conversation that produced it.

## One panel, two things in it

The right panel already existed for the App preview. Rather than add a second panel, a file preview moves into the same surface, and a centered **App | File** switcher appears in its header — but only when both actually exist. The panel is visible whenever there is an App *or* an open preview; closing the file returns the member to the App, or makes the panel disappear entirely if there was no App to return to. A preview triggered while the panel is collapsed expands it, in File mode.

Two properties matter more than the layout:

**The App iframe is never unmounted.** While a file shows, the App pane is hidden with `display: none`, not removed. An App mid-session — a form half filled in, a route the member navigated to — survives a detour into a document and is exactly as they left it when they switch back. Removing and re-adding the iframe would reload it, which is the one thing a preview must not cost.

**Nothing switches the mode except a click.** The panel changes mode only in response to an explicit member action: opening a preview, using the switcher, or closing the file. There is deliberately no auto-reveal when the Agent finishes writing something — a panel that yanks the running App away mid-task is worse than a member having to click. That guard is structural rather than a convention: mode changes live in one place in the panel, so a future "open it automatically" idea has to argue with this rule rather than quietly bypass it.

What the panel listens for is therefore a *request* to show a file, not the identity of the file itself. The difference is only visible in one case, but it is the case that would look broken: a member previews a report, switches back to the App, then clicks that same report again. The file has not changed, so a panel keyed on the path would sit in App mode and appear to ignore the click. Keyed on the request, every click is an action and every action is honoured.

A preview is single-file: opening another replaces it. Switching the Active environment closes it, because a document from an environment the member has left is a lie about what they are looking at. Deleting the previewed file closes it for the same reason — including deleting a folder it happens to live in, since the panel has no way to notice that on its own and a preview of a file that no longer exists is the one state worse than no preview at all.

## Two ways in

A preview opens from chat or from the [Files tab](files-tab.md) — two doors, one room. Both surfaces hand the same thing — a workspace-relative path — to the same panel, so the header actions, the format handling, and what closing does are identical no matter which one the member came from. In the tab that means a click on a file name opens the preview and the row's own download button stays where it is; the two gestures are separate on purpose, because a tab where clicking a name silently pushed a file into Downloads was the behaviour this feature exists to replace.

The one difference is what an unsupported format does, and it follows from what the click means on each surface. In the tab, clicking a name means "show me this", so a zip opens the panel on its download card — name, size, icon, Download. A chat link is a link, so an unsupported one keeps downloading exactly as it always did rather than acquiring a new panel the member did not ask for.

### The chat cards

There is no agent-side change and no scraping of prose for things that look like artifacts. The [save-and-link convention](../agents/document-generation.md) is the entire signal: the Agent saves into **Generated files** and ends its turn with a markdown link, and the platform reads that link.

Links into Generated files are promoted to small **file cards** — a type badge, the link text, and a download button — so deliverables stand out from prose. Any other `/workspace/...` link keeps its anchor styling but gains preview-on-click when its format is supported, and otherwise downloads exactly as it always did. Downloading never goes away: it is on the card and again in the panel header, because previewing a file must not take the file away from you.

Promoting a link is a DOM decoration, not a rendering change, and that is forced by where the chat comes from: the conversation is the embedded OpenCode interface, which renders its own markdown and re-applies it with `morphdom` as a message streams. Opsiforce cannot own that markup, so it does the smallest thing that survives being overwritten — mark the anchor with attributes (CSS draws the card and the badge from the file's extension) and append a single download element. A mutation observer re-applies both after each re-render; the work is idempotent, so a decorated link is left alone and the observer never chases its own changes.

## What renders, and the sniff behind text

The panel renders PDFs in the browser's native viewer, images and SVG through `img`, and markdown through the chat markdown pipeline, and source/text through escaped pre/code elements that preserve exact whitespace without requiring a highlighting worker, so a preview looks native to the product rather than like a second app bolted on. SVG is only ever an image source and never inlined into the page, since an SVG the Agent wrote is untrusted markup that could carry script.

Text is the one format that cannot be decided by extension alone. A `.txt` that is really a binary blob would render as pages of garbage, so the extension map only makes a file a *candidate*: the fetched bytes are checked for a NUL in the first 8 KB, and a file that fails falls back to the download card. Very large text files are truncated with a visible note instead of freezing the panel on a syntax highlighter.

HTML renders live, scripts and all, because a generated report that draws its own charts is worthless as inert markup. What makes that safe is that the document never runs on the app's origin: the frame carries `sandbox="allow-scripts"` and never `allow-same-origin`, and the response repeats the same restriction as a header (see below), so the page lands in an opaque origin — its scripts run, and any reach for cookies, storage, or the surrounding DOM throws.

CSV is parsed in the browser into a table rather than handed to the text highlighter, and an xlsx workbook becomes a read-only values grid with a sheet selector when it has more than one sheet. Both draw the same grid, and both are bounded on purpose: the first 500 rows and 200 columns are rendered and anything past that is stated in a footer rather than quietly dropped, because a deliverable spreadsheet can be arbitrarily large and a side panel cannot. Workbook cells are read as their *formatted* text rather than their underlying values, so a currency column reads the way it reads in Excel. The parser is SheetJS CE, taken from the vendor's own CDN at install time rather than from npm where the package has sat frozen for years, and loaded on demand — a member who never opens a workbook never downloads it.

Everything the matrix does not name shows a download card with the name, size, and type icon. Hitting a format limit is a graceful state, never an error. A link to a file that has since been deleted or renamed says "file not found" rather than failing silently, which matters because chat is permanent and the workspace is not.

PDFs render in an **un-sandboxed** iframe — the accepted fallback rather than an oversight. A sandboxed frame renders nothing at all, and Firefox's `pdf.js` viewer needs the script execution an empty sandbox denies in any case. This was re-measured in an ordinary Chrome (2026-08-21), after an earlier probe inside an automated browser left it unclear whether the blank frame was Chromium's PDF plugin or the harness's own sub-frame policy: two iframes pointed at the same content URL, differing only in the `sandbox` attribute, gave Chromium's broken-document icon with `sandbox="allow-scripts"` and a rendered page without it. So the constraint is real and this cannot be tightened. Note that **both frames fire `load`**, which is why the load event is no use as a signal here and why anyone re-testing has to look at the frame rather than listen to it. It changes nothing either way — the exposure a same-origin frame would otherwise create is closed on the server instead, in the endpoint's disposition rules below, and HTML gets its opaque origin from a response header rather than from the frame, so it is unaffected.

## Word and PowerPoint go through a converter

A `.docx` or `.pptx` is a zip of XML — there is nothing a browser can render, and the client-side JavaScript renderers that claim otherwise have no first-tier steward behind them. So the platform converts instead: the document becomes a PDF, and the PDF goes down the native-viewer path the panel already has. The member sees a document, not a translation layer.

The converter is **Gotenberg**, one shared deployment for the whole cluster — a stateless service wrapping LibreOffice, pinned to an exact image tag, with no volumes and nothing to back up. Self-hosting it is the point, not a preference: a hosted conversion API would mean tenant documents leaving the deployment, and would make the product undeployable in the air-gapped and standalone installs it has to support. Conversion happens between the backend and the converter, both of which only ever touch bytes already inside the cluster.

**What contains it.** The Service is ClusterIP-only, so nothing outside the cluster can reach the converter, and the converter itself is defanged as an SSRF hop: its URL-fetching feature is disabled and outbound LibreOffice fetches to private addresses are denied, so a document that embeds a linked image cannot be used to probe the cluster from inside the converter. This matters because the documents being converted are Agent-authored or user-uploaded: untrusted input, by construction.

One containment layer was **consciously deferred** (2026-08-21): a NetworkPolicy blocking agent pods from calling the converter directly. Agents share the namespace, so today one *can* resolve `opsiforce-gotenberg` and submit conversions — the realistic exposure is queue starvation of previews (one shared LibreOffice, one conversion at a time), not access to anyone's data, since the converter only ever holds what its caller just sent it. The policy was dropped rather than shipped unverified: NetworkPolicies are only as real as the CNI enforcing them, local minikube's default CNI enforces none, and carrying a per-environment pod-label `--set` through CI to feed an unverifiable object was complexity without a proof. If agent abuse ever shows up in practice, the fix is a namespaced NetworkPolicy plus a CNI check — additive, nothing here has to move.

### Nothing hangs on an HTTP request

Conversion takes seconds, sometimes tens of seconds, and one pod converts one document at a time. A request-response endpoint would therefore be a request that occasionally hangs for a minute behind someone else's slide deck, which is the shape that produces gateway timeouts and unexplained spinners. So conversion is a **job**: asking for one returns an id immediately, the panel polls a status endpoint, and a third endpoint streams the finished PDF. The panel applies its own overall timeout on top, so a converter that never answers still resolves into a stated outcome rather than an eternal "converting…".

The converter's reply is mapped into three outcomes, because the right thing to offer a member differs for each. A refusal of the document itself — a corrupt file, an unsupported variant — is **unconvertible**: the panel shows the download card with no retry, since retrying a document LibreOffice cannot read will fail identically. A converter fault is **retryable**, and a busy or timed-out converter is **busy**; both show the download card *with* a Try again, because the document is fine and the next attempt may well succeed. Downloading is always available regardless, which is why a failed conversion is a graceful state rather than an error: the member still gets their file, just not rendered in place.

Job results are held **transiently, in memory, for minutes** — long enough for the panel to poll, fetch, and re-fetch when the iframe loads, and no longer. This is deliberately *not* a conversion cache: reopening the same document converts it again. Caching converted PDFs is a purely additive change if repeat-open latency ever becomes annoying, and leaving it out means there is no second copy of a tenant's document to keep consistent, invalidate, or clean up. Holding results in the backend's own memory is sound because the backend runs single-replica with autoscaling off; the honest cost is that a job started just before a rolling restart is lost, which the panel surfaces as a retryable failure.

Like every other file surface, conversion is plain filesystem work on the shared volume plus one in-cluster HTTP call. **The Agent's pod is not involved and does not need to be awake.**

## The content endpoint

Serving a file for reading is a different thing from serving it for saving, so it is a different endpoint. Download stays attachment-only forever; the content endpoint serves inline. Keeping them apart means the download path can never be talked into rendering something in the browser, and the preview path can never quietly become the download path.

Inline disposition is **allow-listed, not defaulted**: PDFs, the raster image types, the inert text types, and HTML get `inline`; everything else is served `attachment` even though the panel can display some of it. SVG and XML are the reason for the asymmetry — served inline from the app's own origin they would be a stored-XSS vector for anyone who navigated straight to the URL. Nothing is lost by refusing them, because `Content-Disposition` is ignored for subresource loads: an SVG still renders in an `img` tag and text still arrives through `fetch`.

HTML is the one format where inline is unavoidable and that XSS problem is real, so it is answered rather than dodged. Every HTML response carries a `Content-Security-Policy` that both sandboxes the document and cuts it off from the network:

```
sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:
```

The `sandbox` directive is the header form of the iframe attribute, so the browser drops the document into an opaque origin whether it arrives in the preview frame or in a tab the member opened deliberately — which is what lets Open-in-new-tab cover HTML alongside PDFs and images. All of this was measured, not assumed. Served without the header, a probe document reads the session cookie, `localStorage`, and the parent page's DOM; served with it, every one of those throws `SecurityError` and `self.origin` is `null`.

**The opaque origin alone was not enough, which is why the rest of the policy exists.** A probe in a sandboxed frame could still `fetch()` the platform's own API *with credentials* and get a `200` — the request is same-site, so the session cookie rode along, and CORS let the reply be read. An Agent-authored or user-uploaded HTML file could therefore have enumerated the workspace and posted it anywhere. `default-src 'none'` closes that: every fetch, XHR, WebSocket, beacon, remote script, remote style, and remote image now fails. What survives is exactly what a finished, self-contained report needs — inline scripts still run, inline CSS still applies, and `data:`/`blob:` images still draw, so a report that renders its own charts is unaffected. The cost is deliberate: a preview cannot pull a chart library off a CDN or fetch live data, which is the right trade for a surface whose whole job is showing *finished* files.

Beyond that the endpoint is deliberately boring: the correct content type, `nosniff` so the browser cannot second-guess it, `no-store` because tenant files have no business in a shared cache, and Range support so a browser PDF viewer can seek in a long report instead of refetching it. The path guards are not restated here — traversal and null-byte rejection, the shared private-path policy, and the post-open check that the file descriptor really resolves inside the workspace are the same shared helpers download uses, and the tenant plus project-membership check is the same one every file surface applies.

Because the backend pod mounts the same volume as the agent pods, all of this is plain filesystem work. **Reading yesterday's report never wakes the Agent** — the preview works with the environment's pod suspended, which is exactly the case where a member is most likely to be catching up on what was produced.

## See also

- [File Downloads](file-downloads.md) — the `/workspace/...` link convention this extends, and the attachment-only download endpoint.
- [Files Tab](files-tab.md) — the other entry point into this panel, and the other place workspace files are surfaced; it shares the same curation and guards.
- [Document Generation](../agents/document-generation.md) — how the Agent produces the deliverables being previewed.
- [Project Apps](project-apps.md) — the App preview that shares this panel.
- [Deployment](../development/deployment.md) — where the converter sits in the deploy chain.
- Code: backend `backend/src/files/` (`content.controller.ts`, `convert.controller.ts` and the shared open/stream/disposition helpers next to it), the converter chart in `helm/opsiforce-gotenberg/`, frontend `frontend/src/components/project/preview/` and the chat link decoration in `frontend/src/components/project/workspace-file-links.tsx`.
