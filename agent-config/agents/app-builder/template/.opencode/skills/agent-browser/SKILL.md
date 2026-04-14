---
name: agent-browser
description: Browser automation for testing and debugging — open pages, take snapshots, click/fill elements, inspect network requests, verify UI. Use when you need to visually test the app, verify a feature works, debug UI issues, or investigate what the user sees.
---

# agent-browser

Browser automation tool for testing your app and debugging UI issues.

## Core commands

```bash
agent-browser open <url>                    # navigate to URL
agent-browser snapshot                      # accessibility tree with element refs (best for AI)
agent-browser screenshot [path]             # take screenshot (--full for full page, --annotate for labeled elements)
agent-browser close                         # close browser
```

## Interacting with elements

Use refs from `snapshot` output (e.g. `@e2`, `@e3`):

```bash
agent-browser click @e2                     # click element
agent-browser fill @e3 "text"               # clear and fill input
agent-browser type @e3 "text"               # type into element (appends)
agent-browser select @e5 "option"           # select dropdown option
agent-browser check @e4                     # check checkbox
agent-browser hover @e2                     # hover element
agent-browser press Enter                   # press key
agent-browser scroll down 500               # scroll direction + pixels
```

## Reading page state

```bash
agent-browser get text @e2                  # get element text content
agent-browser get value @e3                 # get input value
agent-browser get title                     # get page title
agent-browser get url                       # get current URL
agent-browser is visible @e2                # check if element is visible
agent-browser is enabled @e3                # check if element is enabled
```

## Waiting

```bash
agent-browser wait @e2                      # wait for element to appear
agent-browser wait --text "Success"         # wait for text to appear
agent-browser wait --load networkidle       # wait for all network requests to complete
agent-browser wait 2000                     # wait milliseconds
```

## Finding elements semantically

```bash
agent-browser find text "Submit" click      # find by text and click
agent-browser find label "Email" fill "a@b" # find by label and fill
agent-browser find role button click        # find by ARIA role
agent-browser find placeholder "Search" fill "query"
```

## Network inspection

```bash
agent-browser network requests              # view tracked requests
agent-browser network requests --status 4xx # filter by status
agent-browser network requests --filter api # filter by URL pattern
```

## Running JavaScript

```bash
agent-browser eval "document.title"         # run JS in page context
```

## Debugging workflow

**Before opening the browser**, verify the dev servers are running — see §Verifying the app runs in the agent instructions. A blank page is almost always a crashed process, not a UI bug.

When investigating UI issues, pair browser output with platform-DB queries (see §Debugging with sqlite3 in the agent instructions for the SQL):

1. `agent-browser open http://localhost:3000` — see what the user sees
2. `agent-browser snapshot` — inspect the DOM
3. Query `app_requests` for failed API calls (4xx/5xx + response body)
4. Query `process_logs` / `process_events` for dev-server errors or crashes
