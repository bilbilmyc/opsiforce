# WhatsApp

> Feeding messages from real WhatsApp chats and groups into an app. Unlike [incoming email](incoming-email.md), the routing identity here is **assigned by a platform operator**, never self-served by the agent — which shapes both the data model and the onboarding story.

A WhatsApp number is connected to the platform as a *channel* (via Whapi, which links the number by QR code). Messages from **allowlisted chats** — an individual conversation or a group — are verified, stored in the target environment's `external-services.db` with media bytes included, counted for the Organization, and announced to the app by the [doorbell](overview.md#the-doorbell). Everything in [External Services](overview.md) applies; this doc is the WhatsApp-specific half. Inbound only: nothing in the platform sends or replies on WhatsApp.

## Channels are global; allowlists belong to environments

The data splits along the grain of what the two halves actually are. A **channel is a resource**: one row per physical number, platform-global, holding the provider's channel id, the API token an operator pasted from the provider dashboard, a server-generated webhook secret, and a human label. There is no tenant column — the label ("Sales number, Acme GmbH") carries the human context instead, and one number shared by two Organizations is one row referenced by both, not two copies of the same credential. That is the point: the token and secret exist exactly once, so they cannot drift, rotation is a single update, and the media-fetch path never has to guess which copy to use.

The earlier design made a channel an Organization⇄channel *grant* and validated that an allowlisted environment belonged to the channel's Organization. Both dissolve here, safely: registration is global-admin-only (`can_manage_external_services`), and metering still attributes a tenant through the environment that received the message.

Resource values are **encrypted at rest** (AES-256-GCM, key from the environment) — which protects database dumps, backups and SQL-level read access, not a compromised app server; that honesty matters more than the checkbox. The API token is used outbound — enumerating chats, configuring the webhook, fetching media. The webhook secret goes the other way: the platform generates it, pushes it to the provider, which echoes it back as a header on every delivery, and never returns it to an operator afterwards (a token preview and a rotate action are all the UI offers).

## The allowlist, and fan-out

The other half is per-environment **configuration**: one document per (service, environment) listing the channels this environment listens to and, under each, the allowlisted chats. A chat delivers to an app only if that document says so. Nothing arrives by default and there is no wildcard — connecting a conversation is a deliberate act. Chat ids carry their kind in the suffix (`…@s.whatsapp.net` individual, `…@g.us` group), which is all the platform needs to handle both on the same event stream.

**Fan-out is allowed**: one chat may appear in several environments' documents, so a test group can feed Development and a published environment at once. Each destination is stored and metered independently. Because the documents are small, the webhook path finds them by scanning this service's rows and filtering on (channel, chat) rather than by index.

Lifecycle follows the environment: the config document cascades away with a deleted environment (the channel resource survives — it was never environment-owned), duplication and import copy nothing, and **publish copies the document** to the published environment once that version is healthy — deliberate fan-out, so both keep receiving, and republishing is an idempotent upsert. A publish that never came online leaves the published environment's existing document untouched.

## Ingest specifics

Whapi posts batches — one event can carry several messages, individual and group mixed — and **does not sign its webhooks at all**. Verification is therefore the secret header compared, in constant time, against the secret stored on the resource row for that channel id; an unknown channel or a mismatched secret is a **406**.

Each message is routed by its chat id. Non-allowlisted chats are **accepted and dropped**: Whapi has no permanent-reject, so answering anything but 200 would only buy retries that can never succeed. That is the single most common reason a user reports "WhatsApp isn't working" — the platform received the message and deliberately discarded it, so nothing appears in the app's database at all.

Media (`image`, `document`, `voice`, …) arrives as a reference, not bytes, so the platform fetches it **before** storing — a row isn't complete without its blob — using the channel's token, falling back to the payload's temporary download link. It is stored as an **attachment row**, the same shape email attachments get, with `media_id` left in the message payload; a media caption is promoted into `text_body`, so "the text of this message" is one column regardless of message type. If both fetches fail the attachment row is still written with its bytes null and the failure logged loudly; losing the text, or hiding the fact that a photo existed, would be worse. Deduplication keys on the provider's message id, as everywhere else.

## Onboarding a WhatsApp number

This is manual operator work, and it spans both external-service permissions. Steps 2 and 3 touch the platform-wide channel registry shared by every organization, so they need `can_manage_external_service_resources` — a platform-operator permission no ordinary organization admin should hold. Step 4 is the organization's own business and needs only `can_manage_external_services`. Each has its own Keycloak role and group, both deliberately *outside* the admin bundle and granted by hand, so external-service administration can be delegated without handing over everything else — and the resource group carries the per-environment permission too, so platform staff need only the one group. The agent cannot do any of it; its skill tells the user what to ask an admin for. It can, however, *see* the result — `GET agent/whatsapp/identity` projects the environment's wired channels and allowlisted chats (labels included, credentials never), so an agent can tell the user what is connected without guessing.

1. **Create the channel in the provider dashboard** and **link the number by QR code** — on the phone, WhatsApp → Settings → Linked devices. The channel must reach an authorised state before it delivers anything.
2. **Register it** under **Admin → External services** (`/admin/external-services`): paste the channel id and API token, give it a label. Channels are platform-global — the label carries the human context. The platform generates the webhook secret itself; nobody types it, and it is never shown back.
3. **Configure the webhook** with the channel's action. The platform calls the provider to set the delivery URL, the secret header and the message-event filter in one go, so the URL and secret can never drift from what the backend expects. The URL comes from the deployment's configured webhook base (or an explicit override — useful when pointing a local backend at a tunnel); with neither, the action answers 503 rather than configuring something wrong.
4. **Allowlist chats** from the project page: the environment dropdown's **External services** item opens a per-environment dialog. It enumerates the picked channel's chats and groups through the stored token so ids can be picked rather than transcribed from a phone, with validated manual entry as a fallback.

Until step 4 names a specific environment, that environment receives nothing. Step 3 is what makes messages arrive at the platform at all.

## What the agent does

The `whatsapp` skill teaches the app-side half: replace the template's catch-all 501 stub with a real `POST /api/external-services/whatsapp` handler, and read the shared `messages` / `attachments` tables with a `service = 'whatsapp'` filter — chat id in `routing_key`, sender and text (body or caption) promoted, the rest (`type`, `from_me`, `media_id`, …) reached through `json_extract` on `payload`, media as attachment rows, and the undelivered rows to catch up on. It is explicit that connecting numbers and chats is operator work, and that the app can build everything *before* that work is done — but the skill now also has `GET $EXTERNAL_SERVICES_URL/whatsapp/identity`, so it can *see* the wiring (including chats allowlisted but never used, which the stored data cannot show) instead of inferring it from the table.

## See also

- [External Services](overview.md) — the pipeline, storage conventions, doorbell and metering this service plugs into.
- [Incoming email](incoming-email.md) — the other shipped service, and the contrast in how routing identity is obtained.
- [Admin](../organization/admin.md) — the operational admin section this tab lives in ([ADR-0014](../adr/0014-admin-section-and-operational-view-module.md)).
- [Permissions](../organization/permissions.md) — `can_manage_external_services` and why frontend gating isn't enforcement.
- Code: `backend/src/external-services/whatsapp/whatsapp.definition.ts` (verification, routing, media fetch, publish carry, the identity projection and the admin route table), `whatsapp-channel.service.ts` (operator surface behind those routes), `whapi.client.ts` (provider calls); channel credentials in `externalServiceResource` and per-environment chat allowlists in `externalServiceConfig` (`backend/db/schema.ts`); UI in `frontend/src/pages/external-services-admin.tsx` and `frontend/src/components/external-services/`; skill `agent-config/skills/whatsapp/SKILL.md`.
