# NostrPad

A simple shared notepad powered by Nostr relays. Create a pad, share the link, and collaborate in real-time.

## Features

- **Session Management** - Secure session storage with AES-GCM encryption in IndexedDB
- **Real-time Sync** - Content syncs across clients via Nostr relays with debounced publishing
- **Editor/Viewer Modes** - Full editing for session owners, read-only view for shared links
- **Encrypted Content** - NIP-44 encryption using a key derived from the pad ID
- **Decentralized** - No central server, data stored on Nostr relays
- **CRC32 Checksum** - Verify content integrity at a glance
- **Relay Discovery** - Automatic relay health checking and connection management
- **No Backend Required** - Pure static site, host anywhere

## Demo

Try it out at [https://nostrpad.kuvi.app/](https://nostrpad.kuvi.app/)

## How It Works

1. Visit the app to start a new session or resume an existing one
2. A new session generates a keypair - save your secret key for backup
3. Type your content - it syncs to Nostr relays after 500ms debounce
4. Click "Share" to get the read-only URL for viewers
5. Use "Import" to restore a session from your backed-up secret key

## URL Structure

```
/#padId        -> View-only mode (shared with others)
/#padId:rw     -> Edit mode (requires active session)
/              -> Session start modal
```

The pad ID is a 12-character Base59 identifier derived from the first 8 bytes of the public key.

## Encryption & Privacy

Pad content is encrypted before publishing using NIP-44. The encryption key is deterministically
derived from the `padId`, which means anyone with the view-only `#padId` link can decrypt and read
the content. This design keeps URLs short and shareable, but it is **not** confidential against
anyone who can guess or obtain the pad ID.

Session secret keys are stored encrypted in IndexedDB using AES-GCM with non-extractable keys,
providing protection against casual access while the browser is open.

## Tech Stack

- React 19 + TypeScript + Vite
- [nostr-tools](https://github.com/nbd-wtf/nostr-tools) for Nostr protocol
- Tailwind CSS for styling
- Web Crypto API for session encryption

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

# Lint
npm run lint
```

## Limits

- Content limited to 16,000 characters (safe for most Nostr relays)
- Pad IDs are 12 Base59 characters (~70 bits from 8 bytes of pubkey)
- Uses Nostr kind 30078 (replaceable application-specific events)
  - Only the latest version is stored on relays (no edit history)
  - Content may be deleted if relays prune old/inactive events

## Documentation

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed technical documentation.

## License

MIT
