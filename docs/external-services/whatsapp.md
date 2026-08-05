# WhatsApp

> Feeding messages from real WhatsApp chats and groups into an app. Unlike [incoming email](incoming-email.md), the routing identity here is **assigned by a platform operator**, never self-served by the agent — which shapes both the data model and the onboarding story.

A WhatsApp number is connected to the platform as a *channel* (via Whapi, which links the number by QR code). Messages from **allowlisted chats** — an individual conversation or a group — are verified, stored in the target environment's `external-services.db` with media bytes included, counted for the Organization, and announced to the app by the [doorbell](overview.md#the-doorbell) if it declares the capability. Everything in [External Services](overview.md) applies; this doc is the WhatsApp-specific half. Inbound only: nothing in the platform sends or replies on WhatsApp.

## Channels belong to Organizations

A channel row models an **Organization⇄channel grant**, not a physical phone number. It holds the provider's channel id, the Organization it serves, the API token an operator pasted from the provider dashboard, a server-generated webhook secret, and a label — unique per (channel, Organization). Per-Organization channels are the operating model; sharing one physical number across two Organizations is simply two rows, at the cost of duplicated credentials.

The alternative — one platform-wide number — was rejected because of what a chat id *is*: it identifies the counterpart, so a shared number would force every external contact to belong to at most one Organization. Tying the grant to an Organization instead keeps that constraint local.

Credentials sit in Postgres in plaintext, matching the platform's existing key storage: the database plus the backend is the trust boundary, and column encryption-at-rest is a platform-wide hardening question rather than something this feature settles. The API token is used outbound — enumerating chats, configuring the webhook, fetching media. The webhook secret goes the other way: the platform generates it and pushes it to the provider, which echoes it back as a header on every delivery.

## The allowlist, and fan-out

A chat delivers to an app only if a route says so: (channel row, chat id, ProjectEnvironment). Nothing arrives by default, and there is no wildcard — connecting a conversation is a deliberate act. Chat ids carry their kind in the suffix (`…@s.whatsapp.net` individual, `…@g.us` group), which is all the platform needs to handle both on the same event stream.

**Fan-out is allowed**: one chat may route to several environments, so a test group can feed Development and a published environment at once. Each destination is stored and metered independently. Route creation validates that the environment belongs to the *channel's* Organization, so an operator cannot accidentally wire one tenant's conversations into another tenant's app.

Lifecycle follows the environment: routes cascade away with a deleted environment, duplication and import copy nothing, and **publish copies routes** to the published environment — deliberate fan-out, so both keep receiving, and republishing is idempotent.

## Ingest specifics

Whapi posts batches — one event can carry several messages, individual and group mixed — and **does not sign its webhooks at all**. Verification is therefore the secret header compared, in constant time, against the secret stored for that channel id; an unknown channel or a mismatched secret is a **406**.

Each message is routed by its chat id. Non-allowlisted chats are **accepted and dropped**: Whapi has no permanent-reject, so answering anything but 200 would only buy retries that can never succeed. That is the single most common reason a user reports "WhatsApp isn't working" — the platform received the message and deliberately discarded it, so nothing appears in the app's database at all.

Media (`image`, `document`, `voice`, …) arrives as a reference, not bytes, so the platform fetches it **before** storing — a row isn't complete without its blob — using the channel's token, falling back to the payload's temporary download link. If both fail, the message is still stored with its media column null and the failure logged loudly; losing the text because a fetch failed would be worse. Deduplication keys on the provider's message id, as everywhere else.

## Onboarding an Organization's WhatsApp

This is manual operator work, gated by `can_manage_whapi_channels` — a permission with its own Keycloak role and group, deliberately *not* part of the admin bundle, so WhatsApp administration can be delegated without handing over everything else. The agent cannot do any of it and has no endpoint to discover it; its skill tells the user what to ask an admin for.

1. **Create the channel in the provider dashboard** and **link the number by QR code** — on the phone, WhatsApp → Settings → Linked devices. The channel must reach an authorised state before it delivers anything.
2. **Register it** under **Admin → WhatsApp** (`/admin/whatsapp`): pick the Organization, paste the channel id and API token, give it a label. The platform generates the webhook secret itself; nobody types it.
3. **Configure the webhook** with the channel's action. The platform calls the provider to set the delivery URL, the secret header and the message-event filter in one go, so the URL and secret can never drift from what the backend expects. The URL comes from the deployment's configured webhook base (or an explicit override — useful when pointing a local backend at a tunnel); with neither, the action answers 503 rather than configuring something wrong.
4. **Allowlist chats.** The admin UI enumerates the channel's chats and groups through the stored token so ids can be picked rather than transcribed from a phone, with validated manual entry as a fallback, and maps each to one of *that Organization's* environments.

Until step 4 names a specific environment, that environment receives nothing. Step 3 is what makes messages arrive at the platform at all.

## What the agent does

The `whatsapp` skill teaches the app-side half: implement the handler the template stubs at `POST /api/external-services/whatsapp`, declare `"externalServices": ["whatsapp"]` in `app.meta.json`, and read `whatsapp_messages` — text, sender, chat, media blobs, and the undelivered rows to catch up on. It is explicit that connecting numbers and chats is operator work, that the app can build everything *before* that work is done, and that querying the stored table is the only way to see which chats have actually delivered here (an allowlisted chat that has never sent anything is invisible).

## See also

- [External Services](overview.md) — the pipeline, storage conventions, doorbell and metering this service plugs into.
- [Incoming email](incoming-email.md) — the other shipped service, and the contrast in how routing identity is obtained.
- [Admin](../organization/admin.md) — the operational admin section this tab lives in ([ADR-0014](../adr/0014-admin-section-and-operational-view-module.md)).
- [Permissions](../organization/permissions.md) — `can_manage_whapi_channels` and why frontend gating isn't enforcement.
- Code: `backend/src/external-services/whatsapp.definition.ts` (verification, routing, media fetch, publish carry), `whapi-channel.service.ts` + `whapi-channels.controller.ts` (operator surface), `whapi.client.ts` (provider calls); `whapiChannels` / `whapiChatRoutes` in `backend/db/schema.ts`; UI in `frontend/src/pages/whatsapp-channels.tsx` and `frontend/src/components/whatsapp-channels/`; skill `agent-config/skills/whatsapp/SKILL.md`.
