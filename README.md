# NostrPad

A simple shared notepad powered by Nostr relays. Create a pad, share the link, and collaborate in real-time.

## Features

- **Unique URLs** - Each pad gets a unique URL with unambiguous characters
- **Real-time sync** - Content syncs across clients via Nostr relays
- **Creator-only editing** - Only the creator (with the secret in URL) can edit
- **Read-only sharing** - Share view-only links without the secret
- **Decentralized** - No central server, data stored on Nostr relays
- **CRC32 checksum** - Verify content integrity at a glance
- **No backend required** - Pure static site, host anywhere (Vercel, Netlify, GitHub Pages, Cloudflare Pages)

## Demo

Try it out at [https://nostrpad.kuvi.app/](https://nostrpad.kuvi.app/)

## URL Structure

```
/#79ggjXVPkQ2z:xK9mNpQr...   → Editor view (pad ID + secret, don't share)
/#79ggjXVPkQ2z               → Read-only view (pad ID only, shared with others)
```

## How It Works

1. Visit the app to create a new pad (auto-redirects to editor URL)
2. Type your content - it syncs to Nostr relays after 500ms debounce
3. Click "Share" to get the read-only URL for viewers
4. Keep the editor URL private - anyone with it can edit
5. Content is encrypted with NIP-44 using a key derived from the pad ID

## Encryption & Privacy

Pad content is encrypted before publishing using NIP-44. The encryption key is deterministically
derived from the `padId`, which means anyone with the view-only `#padId` link can decrypt and read
the content. This design keeps URLs short and shareable, but it is **not** confidential against
anyone who can guess or obtain the pad ID. Treat pad IDs as semi-public identifiers, not secrets.

## Tech Stack

- React 19 + TypeScript + Vite
- [nostr-tools](https://github.com/nbd-wtf/nostr-tools) for Nostr protocol
- Tailwind CSS for styling

## Default Relays

- wss://relay.damus.io
- wss://nos.lol
- wss://relay.primal.net

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Limits

- Content limited to 16,000 characters (safe for most Nostr relays)
- Pad IDs are 12 Base58 URL-safe characters (~70 bits of entropy) for low-collision sharing
- Uses Nostr kind 30078 (replaceable application-specific events)
  - Only the latest version is stored on relays (no edit history)
  - Content may be deleted if relays prune old/inactive events

## License

MIT
