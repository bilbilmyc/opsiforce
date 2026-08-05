# Incoming Email

> Giving an app an email address it can receive mail at. Unlike [WhatsApp](whatsapp.md), the routing identity here is **self-served**: the agent asks for an address and gets one, with no operator in the loop — the only manual work is one-time, per-deployment Mailgun setup.

Every ProjectEnvironment can have its own receiving address — a random local part on the deployment's receiving domain, like `k3p9x2mq7fd41abv@mail.example.com`. Mail sent to it is verified, stored in that environment's `external-services.db` with attachments inline, counted for the Organization, and announced to the app by the [doorbell](overview.md#the-doorbell) if it declares the capability. Everything in [External Services](overview.md) applies; this doc is the email-specific half. Inbound only: sending mail is a different feature entirely (the platform's outbound Mailgun account, the `send-email` skill's territory).

## Addresses belong to environments

An address row is a one-to-one mapping: ProjectEnvironment → address. It is **issued lazily** — no environment has an address until something asks for one, and the first ask creates it. The agent asks through two environment-scoped gateway endpoints (riding the [Service Gateway](../gateways/service-gateway.md) token, which already answers "which environment is calling"): one returns the address, creating it on first call and returning the same one forever after; the other regenerates it.

The random local part is the entire access model. There is no password on an inbox and no sender allowlist — anyone who knows the address can feed the app, so the address is unguessable (16 random characters) and **rotatable**. Regeneration is immediate and graceless: the old address stops resolving the moment the row updates, mail to it bounces, and already-stored emails are untouched. That is the whole story for a leaked or spammed address — rotate it, hand out the new one.

Development and each published environment are **separate environments with separate addresses**, which is why the agent skill insists the address is never hard-coded: an app that embeds its Development address keeps pointing at Development after publish. The address lives in exactly two places — chat, and the endpoint that returns it.

## Ingest specifics

Mailgun receives mail for the domain (it holds the MX records), parses the MIME, and forwards each message as **one HTTP POST of the fully parsed message** — sender, subject, bodies, headers, and each attachment as a file part. The platform never parses MIME and never fetches anything: unlike WhatsApp's media-by-reference, everything arrives in the single request, bounded by Mailgun's message size limit.

Verification is Mailgun's webhook signature: an HMAC over two form fields checked in constant time against the deployment's signing key — this is what lets the front door skip raw-body capture entirely. No configured signing key means inbound email is not set up on this deployment, and the handler answers **503** rather than accepting anything unverified.

Routing is the `recipient` field, lowercased, looked up in the address table. An unknown recipient — nobody was issued that address, or it was rotated away — is a **406**: Mailgun stops retrying and bounces the original sender, which is the honest outcome for a permanently wrong address (contrast WhatsApp's accept-and-drop, forced by a provider with no permanent-reject). Deduplication keys on the message id from the payload, falling back to the signature token, so a redelivered POST writes nothing.

Stored rows keep the useful fields as real columns — envelope sender, `From:` header, subject, plain and HTML bodies, and Mailgun's `stripped-text` (the body minus quoted replies and signatures, usually the right field to parse) — plus attachment rows with bytes inline, per the [storage conventions](overview.md#storage-one-database-per-environment).

## Setting up a deployment's Mailgun

One-time operator work, done by hand in the Mailgun dashboard — deliberately not automated: it is one rule per deployment, and keeping the platform off Mailgun's Routes API means nothing can drift or be clobbered.

1. **Pick a receiving domain** — a domain (or subdomain) not already receiving mail elsewhere, because the route below claims *all* of its inbound mail. This is deliberately a separate setting from the outbound sending domain: replies to platform-sent notifications must not be sucked into app inboxes, and separate domains per deployment keep dev and prod inbound apart. Only MX records are needed (`mxa`/`mxb.mailgun.org`) — the domain never sends, so no SPF/DKIM. Mailgun's sandbox domain works for local testing.
2. **Create one catch-all Route**: match every recipient on the domain, forward to `https://<backend>/api/webhooks/incoming-email`, and stop. Catch-all is what makes address issuance free — a new address works the instant the row exists, with no per-address provider work. For a local backend the forward URL is a tunnel (the backend is only reachable on loopback).
3. **Configure the backend** with the receiving domain and the account's webhook signing key. Without them the feature fails closed: address issuance and the webhook both answer 503.

Per-address routing lives entirely in the platform's database — Mailgun's job ends at "deliver everything on this domain to the front door".

## Publish

Publish issues the published environment **its own fresh address** — it never copies the source's, since an address identifies exactly one environment. The carry runs when the source environment has an address or the app declares the capability, so a published app is receivable immediately; like every publish carry, a failure logs and does not fail the publish. (Contrast WhatsApp, which *copies* chat routes — fan-out is meaningful there, a shared address is not.)

## What the agent does

The `incoming-email` skill teaches the app-side half: fetch the address from the gateway endpoint and tell the user in chat, implement the doorbell handler the template stubs, declare `"externalServices": ["incoming-email"]` in `app.meta.json`, and read `incoming_emails` / `email_attachments` read-only — including the catch-up query over undelivered rows. It is explicit that the address is fetched, never hard-coded; that rotation is for leaked or spammed addresses and only on the user's ask; and that an empty database means "no mail yet", not a broken setup.

## See also

- [External Services](overview.md) — the pipeline, storage conventions, doorbell and metering this service plugs into.
- [WhatsApp](whatsapp.md) — the other shipped service, and the contrast in how routing identity is obtained.
- [Service Gateway](../gateways/service-gateway.md) — the environment-scoped token the address endpoints ride.
- Code: `backend/src/external-services/incoming-email.definition.ts` (verification, routing, row mapping, publish carry), `incoming-email-address.service.ts` + `incoming-email-address.controller.ts` (issuance and rotation); `incomingEmailAddresses` in `backend/db/schema.ts`; skill `agent-config/skills/incoming-email/SKILL.md`.
