---
name: react-markdown
description: Render markdown content as React components. Use when displaying user-generated content, documentation, blog posts, chat messages, AI responses, or any text that uses markdown formatting.
---

# react-markdown

## Basic usage

```tsx
import ReactMarkdown from "react-markdown"

<ReactMarkdown>{markdownString}</ReactMarkdown>
```

## With styled components (recommended)

```tsx
<ReactMarkdown
  components={{
    h1: ({ children }) => <h1 className="text-2xl font-bold mb-4">{children}</h1>,
    h2: ({ children }) => <h2 className="text-xl font-semibold mb-3">{children}</h2>,
    h3: ({ children }) => <h3 className="text-lg font-semibold mb-2">{children}</h3>,
    p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
    a: ({ href, children }) => <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
    ul: ({ children }) => <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>,
    li: ({ children }) => <li className="text-sm">{children}</li>,
    blockquote: ({ children }) => <blockquote className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground mb-3">{children}</blockquote>,
    code: ({ className, children }) => {
      const isBlock = className?.includes("language-")
      if (isBlock) {
        return <pre className="bg-muted rounded-lg p-4 overflow-x-auto mb-3"><code className="text-sm">{children}</code></pre>
      }
      return <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
    },
    table: ({ children }) => <div className="overflow-x-auto mb-3"><table className="w-full border">{children}</table></div>,
    th: ({ children }) => <th className="border px-3 py-2 text-left text-sm font-medium bg-muted">{children}</th>,
    td: ({ children }) => <td className="border px-3 py-2 text-sm">{children}</td>,
    hr: () => <hr className="my-6 border-border" />,
    img: ({ src, alt }) => <img src={src} alt={alt} className="rounded-lg max-w-full my-3" />,
  }}
>
  {content}
</ReactMarkdown>
```

## GFM support (tables, strikethrough, task lists)

GFM (GitHub Flavored Markdown) requires `remark-gfm`:

```bash
cd /workspace/app && bun add remark-gfm
```

```tsx
import remarkGfm from "remark-gfm"

<ReactMarkdown remarkPlugins={[remarkGfm]}>
  {content}
</ReactMarkdown>
```

This enables: tables (`| a | b |`), strikethrough (`~~text~~`), task lists (`- [x] done`), autolinks.

## With Tailwind Typography (prose classes)

For long-form content where you don't need custom component mapping:

```bash
cd /workspace/app && bun add @tailwindcss/typography
```

```tsx
<div className="prose prose-sm max-w-none dark:prose-invert">
  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
</div>
```

`prose-invert` handles dark mode. `max-w-none` removes the prose default max-width.

## Chat message / AI response pattern

```tsx
function ChatMessage({ role, content }: { role: "user" | "assistant"; content: string }) {
  return (
    <div className={cn("rounded-lg px-4 py-3", role === "user" ? "bg-primary text-primary-foreground ml-12" : "bg-muted mr-12")}>
      {role === "assistant" ? (
        <ReactMarkdown components={{ p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p> }}>
          {content}
        </ReactMarkdown>
      ) : (
        <p>{content}</p>
      )}
    </div>
  )
}
```

## Common mistakes

1. **Not installing `remark-gfm`** — tables in markdown won't render without it. If users paste markdown with tables, it appears as raw text.
2. **Forgetting `dark:prose-invert`** when using `@tailwindcss/typography` — prose has hardcoded dark colors.
3. **XSS with HTML in markdown** — react-markdown escapes HTML by default, which is safe. Don't add `rehype-raw` unless you trust the content source.
