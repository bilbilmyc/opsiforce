# Document Generation

> How the Agent produces docx, pptx, xlsx, and pdf deliverables offline, where they land, and why the whole generation stack is baked into the agent image instead of installed on demand. Read this before changing the document libraries, the `document-generation` skill, or the Generated files convention.

People go elsewhere for document-shaped work. Asked for a report, a deck, or a spreadsheet, an Agent with no libraries improvises — a markdown file, a hand-rolled CSV, or a runtime `pip install` — and the user gets something they can't open in Office. **Document Generation** is the pod-side half of the Files feature: the Agent has the same generation stack claude.ai uses, one skill that tells it how to use it, and a single convention for where the file goes so the platform can find, list, and preview it.

## Everything is baked into the image

The stack is installed at image build time, never at runtime. Two constraints force this: the planned per-pod egress allow-list ([ADR-0015](../adr/0015-app-liveness-pushed-not-polled.md) is the sibling case of pod-side capability shipping in the image) would block `npm install` outright, and a standalone air-gapped deployment has no registry to reach at all. A capability that depends on a package manager succeeding is a capability that works in the demo and fails at the customer.

What that buys, per format:

- **Word and PowerPoint** are JavaScript — the `docx` and `pptxgenjs` packages, the same creation path Anthropic's own open-source skills use. They are installed once into `/opt/doc-tools` and exposed through a root `/node_modules` symlink, so `require("docx")` resolves from any throwaway script anywhere in the filesystem with no `package.json` and no install step. The app's own dependencies are untouched: the app resolves through Yarn PnP, which never consults `node_modules`.
- **Excel** is Python — `openpyxl`, which covers formatting, formulas, and multiple sheets. There is deliberately no `pandas`: it and its `numpy` dependency cost about 100 MB installed, against 2 MB for openpyxl, and buy only `to_excel` convenience over an `append()` loop — for a spreadsheet the Agent is authoring row by row anyway, that is not a trade worth a tenth of a gigabyte in every pod.
- **PDF has two paths on purpose.** For anything that needs to look designed, the Agent writes HTML and CSS and prints it with the Chromium already in the image (it is there for `agent-browser`, and headless print-to-PDF is the same binary). Models are far better at CSS than at PDF coordinates, and Chromium brings full paged-media CSS and whatever fonts the system has. For programmatic and tabular output — per-record documents, thousand-page tables — `reportlab` generates directly. `pypdf` and `pdf-lib` cover manipulation of existing PDFs: merge, split, stamp, fill forms.
- **Reading** an existing document is a separate toolchain from writing one: `pandoc` converts docx to markdown, `poppler-utils` gives `pdftotext` and `pdftoppm` (the latter is also how the Agent *looks* at a PDF it produced).

Fonts are part of the stack, not an afterthought, and the base image has none. Debian's `chromium-common` only *recommends* `fonts-liberation`, and this image installs with `--no-install-recommends` — so Chromium arrives with `libfontconfig1` and `libfreetype6`, a font engine and nothing to render. `fonts-liberation` (2 MB, metric-compatible with Arial/Times/Courier) plus `fontconfig` for a build-time cache are therefore load-bearing, not polish: without them printed text is blank boxes.

**CJK and emoji fonts are deliberately not installed** (decided 2026-08-20, amending the spec's font criterion). `fonts-noto-cjk` alone is 91 MB — most of what the whole feature would add to every pod — and emoji buy 10 MB that `reportlab` cannot use anyway, since Noto Color Emoji is a bitmap face it will not embed. Latin, accents included, is fully covered. The consequence is real and the skill names it: non-Latin text in a **PDF** renders as blank boxes and does so *silently*, the generator reporting success, so the skill tells the Agent to deliver docx or pptx instead (readers supply their own fonts) or to say what it cannot do. Adding the packs back is a one-line Dockerfile change plus an image-version bump if that trade stops making sense.

There is deliberately **no LibreOffice** — it would double the image for two things. One is lost with a mitigation: nothing recalculates spreadsheet formulas after the Agent writes them, so the skill tells the Agent to write computed values for anything the user needs to read. The other is validation — no headless docx/pptx renderer means the Agent can't visually check its own Word and PowerPoint output. Conversion for *preview* is not affected: that runs backend-side on a cluster-internal Gotenberg the Agent cannot reach.

## One skill, and two lines that make sure it gets loaded

`agent-config/skills/document-generation/` is a single shared skill covering all four formats, adapted from Anthropic's open-source skills so the recipes match the stack. It leads with the inventory of what is preinstalled and an instruction never to install any of it — otherwise a model's reflex is `npm install docx`, which now fails slowly instead of working. Beyond the recipes it carries only **lightweight taste defaults**: Liberation as the body font, one-inch margins, a decks-open-with-a-title-slide rule, one idea per slide. User-suppliable templates and branding are out of scope.

Skills are loaded on demand, so a skill that is never loaded is worse than no skill. Two lines in each Agent's `agent.md` guard against that, in the section that already governs handing files to the user: one points at the `/workspace/generated_files/` convention, one says to load `document-generation` for any docx, pptx, xlsx, or pdf deliverable.

## Where the file goes

The announcement protocol is the one that already exists — save the file under `/workspace`, end the turn with a markdown link to its absolute path ([File Downloads](../projects/file-downloads.md)). Document Generation only tightens it: deliverables go in **`/workspace/generated_files/`**, created lazily on first write, which the Files tab surfaces as its own **Generated files** section and which chat links render as file cards. No new event machinery — the save-and-link convention is the sole signal that a deliverable exists.

Revisions default to **versioned filenames** (`report.docx` → `report_v2.docx`). A link already sitting in the chat transcript is a promise about a specific document; overwriting the file breaks that promise silently, and the user scrolling back finds a different report under the old announcement. The Agent overwrites only when the user explicitly asks it to fix that file.

## Rollout

The libraries live in the image, so the capability lands only when a pod is **recreated onto a new image** — which makes this a two-part rollout, and both parts are required.

The skill and the prompt are agent-owned files: they reach existing workspaces through [Agent Updates](agent-updates.md) when each Agent's template `version` in `agents.json` is bumped, and a cheap dispose picks them up. The libraries cannot travel that way — a migration patches volume files, not the image. A skill that arrives on a pod still running the old image is actively harmful: it promises libraries that aren't there, and the Agent obeys and fails. So the change also ships an empty `requiresPodRecreate` agent-update migration (`20260820_document_generation_stack`) in both Agents' migration directories, alongside the `agent-config/agent-image-version.json` bump — the same lever used for the log-writer and `agent-control` binaries ([ADR-0015 § Consequences](../adr/0015-app-liveness-pushed-not-polled.md)). A version bump alone would only trigger an in-place reload.

## See also

- [Agents](agent-system.md) — the profile the skill and prompt belong to, and how skills compose across Agents.
- [Agent Updates](agent-updates.md) — the pipeline that carries the skill and prompt to existing workspaces, and what `requiresPodRecreate` costs.
- [File Downloads](../projects/file-downloads.md) — the `/workspace/...` link convention this builds on.
- Code: `docker/Dockerfile.agent` (the baked stack), `agent-config/skills/document-generation/SKILL.md`, the two pointer lines in each `agent.md`, and the `20260820_document_generation_stack` migrations.
