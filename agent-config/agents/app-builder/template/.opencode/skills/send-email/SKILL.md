---
name: send-email
description: Use when the app needs to send emails (notifications, reports, summaries, welcome emails, password resets, etc). NEVER install nodemailer, @sendgrid/mail, mailgun.js, or any email SDK directly — always use the platform email service.
---

# Sending Emails

The platform provides an email service via the service gateway. Real Mailgun credentials are held centrally — they are never exposed to the app.

**NEVER** install email libraries (nodemailer, @sendgrid/mail, mailgun.js, etc). Always use the gateway.

## Environment Variables

- `SERVICE_GATEWAY_URL` — gateway API URL (pre-configured)
- `SERVICE_GATEWAY_API_KEY` — Bearer token (pre-configured)

## Send an Email

```bash
curl -X POST "$SERVICE_GATEWAY_URL" \
  -H "Authorization: Bearer $SERVICE_GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "email",
    "payload": {
      "to": "user@example.com",
      "subject": "Daily Report",
      "html": "<html>...</html>"
    }
  }'
```

## In NestJS

```typescript
const gatewayUrl = process.env.SERVICE_GATEWAY_URL;
const gatewayKey = process.env.SERVICE_GATEWAY_API_KEY;

async function sendEmail(to: string, subject: string, html: string, text?: string) {
  const response = await fetch(gatewayUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${gatewayKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      service: "email",
      payload: { to, subject, html, text },
    }),
  });

  const result = await response.json();
  if (!result.success) throw new Error(result.error);
  return result.data;
}
```

## Payload Fields

| Field | Required | Description |
|-------|----------|-------------|
| `to` | Yes | Recipient email address (string or array of strings for multiple recipients) |
| `subject` | Yes | Email subject line |
| `html` | Yes* | HTML body (*at least one of `html` or `text` required) |
| `text` | No | Plain text fallback (always include for accessibility) |

The sender address is controlled by the platform — you cannot set a custom `from`.

## Response

```json
{ "success": true, "data": { "messageId": "..." } }
```

On failure:
```json
{ "success": false, "error": "..." }
```

---

# Email HTML Styling Guide

Email HTML is NOT like web HTML. Email clients strip, ignore, or break modern CSS. Follow these rules strictly.

## Layout Rules

### Use tables for layout — NOT flexbox, grid, or floats

- `display: flex` — stripped by Gmail, broken in Outlook
- `display: grid` — no support in most clients
- `float` — unreliable, avoid entirely
- Tables (`<table>`, `<tr>`, `<td>`) — the only reliable layout method

### Container width: 600px max

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto;">
  <tr>
    <td style="padding: 24px;">
      <!-- content here -->
    </td>
  </tr>
</table>
```

600px is the sweet spot — fits desktop clients and scales down on mobile.

### All critical styles must be inline

Many email clients (Gmail, Outlook) strip `<style>` blocks from `<head>`. Put styles directly on elements:

```html
<!-- WRONG: will be stripped -->
<style>.title { color: #111; }</style>
<h1 class="title">Report</h1>

<!-- CORRECT: inline styles -->
<h1 style="color: #111827; font-size: 24px; margin: 0 0 16px;">Report</h1>
```

### Multi-column layout with tables

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td width="50%" style="padding-right: 12px; vertical-align: top;">
      <!-- Left column -->
    </td>
    <td width="50%" style="padding-left: 12px; vertical-align: top;">
      <!-- Right column -->
    </td>
  </tr>
</table>
```

## What Works vs What Doesn't

| CSS Feature | Support | Use? |
|-------------|---------|------|
| `color`, `background-color` | 100% | Yes |
| `font-family`, `font-size`, `font-weight` | 100% | Yes |
| `padding` | 100% | Yes |
| `margin` | ~90% (no margin on `<table>`) | Use on `<p>`, `<h1>`, `<td>` |
| `border`, `border-radius` | ~91% | Yes (radius ignored in Outlook) |
| `text-align`, `line-height` | 100% | Yes |
| `max-width` | ~90% | Yes (use `width` attr as fallback) |
| `display: flex` | 0% usable | **Never** |
| `display: grid` | 0% usable | **Never** |
| `float` | Unreliable | **Never** |
| `position: absolute/relative` | Stripped | **Never** |
| `box-shadow` | ~60% | Avoid (ignored in Outlook/Gmail) |
| `@media queries` | ~70% | OK for progressive enhancement only |
| `<style>` in `<head>` | ~70% | Stripped by Gmail if >8KB or has syntax error |
| Web fonts (`@font-face`) | ~50% | Use as enhancement, always declare fallback |
| `background-image` | ~80% | Ignored in Outlook; always have a solid `background-color` fallback |

## Typography & Readability

### Font stack
```
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
```
Do not rely on custom/web fonts. Always use a system font stack.

### Sizes
- Body text: **14–16px** minimum (never smaller)
- Headings: 20–28px
- Small/caption text: 12px minimum
- Line height: **1.5×** the font size (WCAG 1.4.12)

### Alignment
- **Left-align** body text (most readable)
- Never use `text-align: justify` (creates uneven word spacing)
- Center-align is OK for headings and short single-line elements only

## Color & Contrast (WCAG AA)

### Minimum contrast ratios
- Normal text (<18px): **4.5:1** against background
- Large text (≥18px or ≥14px bold): **3:1** against background

### Safe color pairings

| Text | Background | Ratio | Use for |
|------|-----------|-------|---------|
| `#111827` | `#ffffff` | 16:1 | Body text |
| `#374151` | `#ffffff` | 10:1 | Secondary text |
| `#ffffff` | `#1d4ed8` | 8:1 | Button text on blue |
| `#ffffff` | `#dc2626` | 5.6:1 | Alert/error badges |
| `#065f46` | `#d1fae5` | 5:1 | Success badge |
| `#92400e` | `#fef3c7` | 4.6:1 | Warning badge |

### Never use
- Light gray text on white (`#9ca3af` on `#fff` = 2.9:1 — fails WCAG)
- White text on light backgrounds
- Color as the only way to convey meaning (add icons or text labels)

## Dark Mode

~41% of users read email in dark mode. Some clients auto-invert colors, others respect CSS hints.

### Add meta tags and color-scheme

```html
<head>
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <style>
    :root { color-scheme: light dark; }
    @media (prefers-color-scheme: dark) {
      .email-body { background-color: #1a1a2e !important; }
      .email-card { background-color: #16213e !important; }
      .text-primary { color: #e5e7eb !important; }
      .text-secondary { color: #9ca3af !important; }
    }
  </style>
</head>
```

### Dark mode rules
- Always set explicit `background-color` on every element (don't rely on transparent → white)
- Use dark text on light backgrounds as the default — dark mode inverts gracefully
- Logos/icons with transparency: use a white or light background padding so they don't disappear on dark backgrounds
- Test that status badges remain readable when colors invert — use high-contrast pairs from the contrast table above
- `@media (prefers-color-scheme: dark)` works in Apple Mail and Outlook Mac. Gmail ignores it and does its own inversion. Outlook Windows ignores it entirely. So these are progressive enhancements, not requirements.

## Preheader (Preview Text)

The preheader is the short text snippet shown next to the subject line in the inbox. If you don't set it, email clients pull the first text from the body (often "View in browser" or navigation links).

### Add hidden preheader text

```html
<body>
  <!-- Preheader: visible in inbox, hidden in email body -->
  <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #f3f4f6;">
    {{preheader text — 40-80 characters, complements the subject line}}
    <!-- Pad with whitespace to prevent email clients from pulling body text -->
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
```

### Preheader rules
- 40–80 characters (longer gets clipped)
- Complement the subject, don't repeat it. Subject: "Your Daily Report" → Preheader: "3 pending tasks, 2 overdue"
- Match the hidden text color to the body background (`color: #f3f4f6` on `background: #f3f4f6`) as a safety net
- Pad with `&nbsp;&zwnj;` entities to prevent clients from pulling body text after the preheader

## Images

- **Always export at 2× resolution** for retina displays (render a 600px-wide image at 1200px, set `width="600"`)
- **Always set `width` and `height` attributes** — prevents layout shifts when images load slowly
- **Always include meaningful `alt` text** — many clients block images by default; alt text is what the user sees
- **Use `style="display: block;"` on all `<img>`** — prevents phantom 4px gap below images in some clients
- `srcset` and `<picture>` only work in Apple Mail — don't rely on them
- Keep total email size under **100KB** including images (Gmail clips at 102KB of HTML)

```html
<img src="https://example.com/chart.png" alt="Monthly revenue: $42,000 (+12%)"
     width="560" height="300" style="display: block; max-width: 100%; height: auto;">
```

## Size Limits

| Client | Limit | What happens |
|--------|-------|--------------|
| Gmail | 102KB HTML | Email clipped with "View entire message" link — loses footer, unsubscribe |
| Outlook | No hard limit | Word engine slows with large HTML |
| General | ~100KB recommended | Keep HTML lean; externalize images, don't inline base64 |

To stay under 102KB: avoid base64-encoded images in HTML, minimize inline CSS repetition, use short class names if you include a `<style>` block.

## Template Structure

Every email should follow this skeleton:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>{{subject}}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <!-- Hidden preheader -->
  <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #f3f4f6;">
    {{preheader — 40-80 chars, complements subject}}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px;">

          <!-- Header -->
          <tr>
            <td style="padding: 24px 24px 0; border-bottom: 1px solid #e5e7eb;">
              <h1 style="margin: 0 0 12px; font-size: 22px; font-weight: 700; color: #111827;">
                {{title}}
              </h1>
              <p style="margin: 0 0 16px; font-size: 14px; color: #6b7280;">
                {{subtitle or date}}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 24px;">
              {{content — use <p>, <table>, <ul> with inline styles}}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 24px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                Sent automatically by {{app name}}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

## Design Principles

1. **Tailor to the use case** — a daily task summary should look different from a welcome email or an alert. Match the content structure to what the user asked for.
2. **Data first** — for reports and summaries, lead with the key metric or count, then show details. Don't bury the important number in a paragraph.
3. **Status badges** — use inline background-color + padding for status indicators:
   ```html
   <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; background-color: #d1fae5; color: #065f46;">Completed</span>
   ```
4. **Tables for data** — reports with rows of data should use actual `<table>` with alternating row colors:
   ```html
   <tr style="background-color: #f9fafb;">
     <td style="padding: 8px 12px; font-size: 14px; color: #111827; border-bottom: 1px solid #e5e7eb;">Task name</td>
     <td style="padding: 8px 12px; font-size: 14px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Due date</td>
   </tr>
   ```
5. **Call-to-action buttons** — use a table-based button (not `<a>` with padding, which breaks in Outlook):
   ```html
   <table role="presentation" cellpadding="0" cellspacing="0">
     <tr>
       <td style="background-color: #1d4ed8; border-radius: 6px;">
         <a href="{{url}}" style="display: inline-block; padding: 10px 20px; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none;">
           View Dashboard
         </a>
       </td>
     </tr>
   </table>
   ```
6. **Always include `text` fallback** — some clients or users prefer plain text. Generate a clean text version alongside HTML.
7. **Images** — always include `alt` text, set `width` and `height` attributes, and use `style="display: block;"` to prevent phantom spacing.

## Outlook-Specific Gotchas

- Outlook uses Word's rendering engine — no `border-radius`, no `background-image`, no `max-width`
- Use `width` attribute on `<table>` (not just CSS `width`)
- `line-height` must be set on `<td>`, not `<p>` or `<span>`
- Padding on `<a>` tags doesn't work — use the table-button pattern above
- `border-width` cannot exceed 8px

## Common Mistakes to Avoid

1. **Using divs for layout** — use `<table role="presentation">`. Divs with CSS layout properties break in Outlook and older clients.
2. **Forgetting inline styles** — a single `<style>` block with all your CSS will be stripped by Gmail if it has any syntax error or exceeds 8KB. Critical styles MUST be inline.
3. **No `alt` text on images** — many clients block images by default. Without alt text, the user sees nothing.
4. **Missing `text` fallback** — always send both `html` and `text` versions. Some users or corporate policies force plain text.
5. **Base64-encoded images in HTML** — bloats the HTML size past Gmail's 102KB clip limit. Always use external image URLs.
6. **Transparent logos on no background** — dark mode inverts the background but not the image, making logos invisible. Add a solid background or padding behind logos.
7. **Using only color to indicate status** — red/green for good/bad is invisible to colorblind users (~8% of men). Always pair color with text labels or icons.
8. **Justified text** — `text-align: justify` creates uneven word spacing that hurts readability. Use `left`.
9. **Tiny text** — never go below 14px for body text, 12px for captions. Mobile users pinch-zoom, which breaks email layouts.
10. **Missing `role="presentation"` on layout tables** — screen readers announce layout tables as data tables without this attribute, confusing visually impaired users.
