---
name: send-email
description: The platform does NOT currently support sending emails. Use when the user asks for email features (notifications, reports, welcome emails, password resets, etc.) to explain this limitation.
---

# Sending Emails — NOT SUPPORTED

The platform does **not** currently support sending emails. Do not attempt to send emails from apps built on this platform.

## What to do instead

If the user asks for a feature that would normally involve sending an email:

1. **Tell the user directly** that email sending is not supported on this platform right now.
2. **Suggest an in-app alternative** that delivers the same value without email, for example:
   - A dashboard page, list view, or banner that surfaces the information the user would have received by email.
   - A scheduled job (see the `schedules` skill) that updates an in-app record the user checks when they open the app.
   - An export button (CSV/JSON download) for reports the user would otherwise receive by email.
3. **Do not install** email libraries (`nodemailer`, `@sendgrid/mail`, `mailgun.js`, `resend`, etc.). They will not work — there are no outbound SMTP/API credentials available to the app.
4. **Do not call** the service gateway with `service: "email"`. The backend rejects that request with an error.
