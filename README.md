# tglive

**Telegram-grade live chat for Next.js.** A floating widget for visitors, an
admin console for you, realtime over SSE — and the part nobody else nails:
**mobile-keyboard behavior that matches Telegram Web** on iOS Safari, Chrome,
Firefox and installed PWAs. No third-party service, your data, your database.

```bash
npm i tglive
npx tglive init
```

---

## Features

- 💬 Realtime messaging over **Server-Sent Events** (no webssocket infra, no SaaS)
- 📷 Photo & file attachments — staged like Telegram, progress, cancel, lightbox
- 😀 Reactions, replies (swipe / double-tap), delete with a particle "dissolve"
- ✓✓ Read receipts, typing indicators, unread badges
- 👤 One identity across chat + your own forms (cookie + normalized-contact merge)
- 📱 **The headline:** the composer never hides under the keyboard, the line above
  the input stays put through every open/close, tall messages get a scrollable
  context menu — zero layout jumps
- 🔒 Admin console gated by **your** existing auth

## Requirements

- **Next.js 15** (App Router), **React 19**, **TypeScript**
- **PostgreSQL** + **Prisma**
- **Tailwind CSS**
- A long-running Node server for SSE (VPS / Docker / Render / Fly — not edge
  functions that cap connection time)

## Setup

`npx tglive init` writes the thin route files for you. Then six one-time steps:

### 1. Database

Append the models from `node_modules/tglive/prisma/chat.prisma` to your
`prisma/schema.prisma`:

```bash
npx prisma migrate dev --name tglive
npx prisma generate
```

### 2. Tailwind

```js
// tailwind.config.js
module.exports = {
  presets: [require("tglive/tailwind")], // colors + animations + the package's content glob
  content: ["./src/**/*.{ts,tsx}"],          // your own content
};
```

Rebrand by overriding the `bg-*/fg-*/accent` colors in your own config.

### 3. Styles

Import once (e.g. in your root layout):

```ts
import "tglive/styles.css";
```

### 4. next.config

```js
const nextConfig = { transpilePackages: ["tglive"] };
```

### 5. Wire your auth

```ts
// instrumentation.ts  (runs once at server startup)
export async function register() {
  const { configureChat } = await import("tglive/server");
  const { getCurrentUser } = await import("@/lib/auth"); // your existing auth
  configureChat({ getCurrentUser }); // return your admin (any truthy) or null
}
```

### 6. Viewport (mobile anti-zoom + keyboard resize)

```ts
// app/layout.tsx
import type { Viewport } from "next";
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-content",
};
```

### Mount the components

```tsx
// public layout — wrap your page in #pf-page, render the widget as a SIBLING
import { ChatWidget } from "tglive";

export default function PublicLayout({ children }) {
  return (
    <>
      <div id="pf-page">{children}</div>
      <ChatWidget />
    </>
  );
}
```

```tsx
// admin layout — protect this route with YOUR auth; root needs id="admin-shell"
import { AdminChatProvider } from "tglive/admin";

export default function AdminLayout({ children }) {
  return (
    <AdminChatProvider>
      <div id="admin-shell">{children}</div>
    </AdminChatProvider>
  );
}
```

```tsx
// app/admin/chat/page.tsx
import { ChatConsole } from "tglive/admin";
export default function Page() {
  return <ChatConsole />;
}
```

Optional unread badge anywhere in your admin nav:

```tsx
"use client";
import { useAdminChat } from "tglive/admin";
export function Badge() {
  const { unreadTotal } = useAdminChat();
  return unreadTotal ? <span>{unreadTotal}</span> : null;
}
```

Open a public page on your phone, send a message, answer from `/admin/chat`. ✅

## Notes

- **File storage** — local disk + `sharp` (images → webp) by default, served by the
  generated `app/uploads/[...path]` route. Set `UPLOADS_DIR` / `UPLOADS_PUBLIC_PREFIX`
  env vars; in production serve `UPLOADS_DIR` with nginx/CDN. Swap in S3/R2 by
  implementing the `StorageAdapter` interface.
- **Push notifications** are a no-op by default (SSE already covers open tabs).
- **Scaling realtime** — the pub/sub bus is in-process (one Node instance). For
  multiple instances, back it with Redis or Postgres `LISTEN/NOTIFY`.
- **Security** — message bodies are sanitized and rendered as text nodes (no XSS);
  admin endpoints are refused unless `getCurrentUser()` returns a user; chat send
  is IP rate-limited.

## Versioning & updates

Semantic versioning. `npm update tglive` (or Dependabot/Renovate) pulls new
component/logic versions; the generated route files, your Prisma models and config
stay yours and rarely change. Breaking changes only ever land in a major version.

## Contributing

Issues and PRs welcome. This started as the live chat of a freelance portfolio and
grew into something worth sharing.

## License

MIT
