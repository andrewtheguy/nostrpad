# NostrPad

A simple shared notepad powered by Nostr relays. Create a pad, share the link, and collaborate in real-time.

> [!WARNING]
> **Pre-release Software**: This program is still pre-release and no backward compatibility is expected between any versions.

> [!WARNING]
> NostrPad is designed for **temporary sharing** and collaboration rather than long-term storage. Sessions and data are ephemeral and **can be cleared from time to time** (e.g. browser updates, database upgrades, or relay limits). Always back up the data you want to keep elsewhere.

## Features

- **Two Modes** - Sender/Receiver (single pad) and Pair Mode (split-screen bidirectional)
- **Session Management** - Secure session storage with AES-GCM encryption in IndexedDB
- **Real-time Sync** - Content syncs across clients via Nostr relays with debounced publishing
- **Editor/Viewer Modes** - Full editing for session owners, read-only view for shared links
- **Pair Mode** - Share a secret key across devices, then create split-screen sessions with Send and Receive panes
- **Encrypted Content** - NIP-44 encryption using a key derived from the pad ID
- **Tamperproof Storage** - Integrity tags and fingerprints detect corruption in stored keys and sessions
- **Decentralized** - No central server, data stored on Nostr relays
- **CRC32 Checksum** - Verify content integrity at a glance
- **Relay Discovery** - Automatic relay health checking and connection management
- **No Backend Required** - Pure static site, host anywhere

## Demo

Try it out at [https://nostrpad.kuvi.app/](https://nostrpad.kuvi.app/)

## How It Works

### Sender / Receiver Mode

1. Visit the app and choose **Sender / Receiver**
2. Start a new session — a keypair is generated; save your secret key for backup
3. Type your content — it syncs to Nostr relays after 500ms debounce
4. Click "Share" to get the read-only URL for viewers
5. Use "Import" to restore a session from your backed-up secret key

### Pair Mode

1. Choose **Pair Mode** and generate or import a secret key (46-character encoded string)
2. The secret key is stored as a non-extractable HMAC key — a fingerprint is displayed for verification across devices
3. One user creates a pair session (generates a 6-character code), the other joins with the same code
4. Both users see a split screen: **Send** (editable) and **Receive** (read-only from partner)
5. Each pair code derives independent keypairs from the shared root key

## URL Structure

```
/s/<padId>     -> View-only mode (shared with others)
/s/<padId>/rw  -> Edit mode (requires active session)
/p/<padId>     -> Pair mode (split-screen send/receive)
/              -> Session start modal
```

The pad ID is a 12-character Base59 identifier derived from the first 8 bytes of the public key.

## Encryption & Privacy

> **Do not store sensitive data.** NostrPad is designed for convenience, not security. Treat it as a semi-public scratchpad. Sessions never expire and anyone with access to your browser can resume your session unless it is cleared.

Pad content is encrypted before publishing using NIP-44. The encryption key is deterministically
derived from the `padId`, which means anyone with the view-only `#padId` link can decrypt and read
the content. This design keeps URLs short and shareable, but it is **not** confidential against
anyone who can guess or obtain the pad ID.

Session secret keys are stored encrypted in IndexedDB using AES-GCM with non-extractable keys,
providing protection against casual access while the browser is open.

In Pair Mode, the root secret key is stored as a non-extractable HMAC-SHA256 CryptoKey — the raw
bytes never re-enter JavaScript after import. Derived keys for each pair session are independent,
so compromising one derived key does not affect the root key or other sessions.

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
