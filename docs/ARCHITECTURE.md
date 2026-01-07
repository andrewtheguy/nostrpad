# NostrPad Architecture

This document describes the technical architecture of NostrPad.

## Overview

NostrPad is a decentralized notepad application built on the Nostr protocol. It uses client-side encryption, IndexedDB for session persistence, and communicates with Nostr relays for real-time data synchronization.

> **Note**: NostrPad is designed for **temporary sharing** and collaboration, not permanent storage. Sessions and data are treated as ephemeral. Always back up important information elsewhere.

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │   React UI  │  │  Nostr Pool  │  │  IndexedDB        │  │
│  │  Components │◄─►│  (nostr-tools)│  │  (Session Store)  │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
│         │                 │                    │            │
└─────────┼─────────────────┼────────────────────┼────────────┘
          │                 │                    │
          │         ┌───────▼────────┐           │
          │         │  Nostr Relays  │           │
          │         │  (wss://...)   │           │
          │         └────────────────┘           │
          │                                      │
          └──────────────────────────────────────┘
```

## Directory Structure

```
src/
├── main.tsx              # Entry point
├── App.tsx               # Root component, routing logic
├── components/
│   ├── Editor.tsx        # Textarea editor component
│   ├── Footer.tsx        # Status bar with CRC32 and relay status
│   ├── Header.tsx        # Top bar with actions
│   ├── InfoModal.tsx     # Encryption info modal
│   ├── PadPage.tsx       # Main pad view orchestrator
│   ├── SessionStartModal.tsx  # Session management UI
│   └── ShareModal.tsx    # Share URLs and QR code
├── hooks/
│   ├── useDebounce.ts    # Debounce hook for publish delay
│   ├── useNostrPad.ts    # Core Nostr sync logic
│   └── useRelayDiscovery.ts  # Relay health checking
├── lib/
│   ├── constants.ts      # App constants
│   ├── encoding.ts       # Base59 encoding/decoding utilities
│   ├── keys.ts           # Key derivation and URL parsing
│   ├── nostr.ts          # Nostr event creation/validation
│   ├── relayDiscovery.ts # Relay probing logic
│   ├── sessionStorage.ts # IndexedDB session management
│   └── types.ts          # TypeScript types
└── utils/
    └── crc32.ts          # CRC32 checksum for content
```

## Core Concepts

### Identity Model

Each pad is associated with a Nostr keypair:
- **Secret Key**: 32-byte random key, stored encrypted in IndexedDB
- **Public Key**: Derived from secret key, used as Nostr author
- **Pad ID**: First 8 bytes of public key, Base59-encoded to 12 characters

```
Secret Key (32 bytes)
       │
       ▼
Public Key (32 bytes hex)
       │
       ▼
Pad ID = Base59(pubkey[0:8]) = 12 characters
```

### URL Routing

Hash-based routing with two modes:

| URL Pattern | Mode | Description |
|-------------|------|-------------|
| `/#<padId>` | View | Read-only access, anyone can view |
| `/#<padId>:rw` | Edit | Requires active session with matching secret key |
| `/` | Start | Session management modal |

The `App.tsx` component handles routing via `hashchange` events.

### Session Storage

Sessions are stored in IndexedDB with AES-GCM encryption:

```typescript
interface SessionData {
  padId: string
  encryptedPrivateKey: Uint8Array  // AES-GCM encrypted
  aesKey: CryptoKey                // Non-extractable
  iv: Uint8Array                   // 96-bit IV
  createdAt: number                // Session creation timestamp (ms)
  integrityTag: Uint8Array         // SHA-256 binding padId + createdAt to encrypted data
}
```

The AES key is generated with `extractable: false`, meaning it cannot be exported from the browser's crypto subsystem. This provides protection against JavaScript-based key theft.

**Integrity Verification:**

The `integrityTag` is computed as `SHA-256(padId + createdAt + iv + encryptedPrivateKey)`. This cryptographically binds the displayed padId and timestamp to the actual encrypted data, preventing tampering attacks.

**Strict Schema Enforcement:**
Sessions without a `createdAt` timestamp (legacy sessions) are considered invalid and will not be loaded. This forces a migration to the new secure session format.

**Flow:**
1. New session: Generate keypair → Encrypt secret key → Compute integrity tag → Store in IndexedDB
2. Resume session: Load from IndexedDB → Verify integrity tag → Decrypt secret key → Derive keys
3. Import session: Decode Base59 secret → Encrypt → Compute integrity tag → Store in IndexedDB

**Temporary Storage Philosophy:**
Since NostrPad is a tool for temporary sharing, the local session storage is not guaranteed to persist indefinitely. 

**Database Schema Upgrades:**
The application uses a destructive upgrade strategy for IndexedDB. When the database version is incremented (due to schema changes), the `onupgradeneeded` handler **deletes the existing object store** before recreating it. 
- This ensures a clean state and prevents compatibility issues with outdated session formats.
- Users must re-import their secret keys after an application update that changes the schema.
- This is by design, aligning with the ephemeral nature of the tool.

Users are encouraged to save their secret keys if they need to restore access later.

**Relay Data Retention:**
In addition to local session clearance, the content itself is stored on external Nostr relays which have their own retention policies.
- Relays may **purge old events** to save space.
- Relays may strictly limit the number of events per kind/author (NIP-77 limits).
- If all relays housing a specific pad's content purge that event, the content is permanently lost unless a client republishes it.

This reinforces the temporary nature of the application; neither the local session nor the remote content is guaranteed to persist.

### Session Logout & Invalidation

To support multiple devices where importing a key on a new device invalidates the old one:

1. **Logout Event (Kind 21000)**: Ephemeral event published when a key is imported.
   ```typescript
   {
     kind: 21000,
     tags: [["d", padId]],
     content: "logout",
     created_at: <now>
   }
   ```

2. **Detection**:
   - Editors subscribe to Kind 21000.
   - If `event.created_at * 1000 > session.createdAt`, the session is considered "overridden" by a newer session.
   - Action: Local session is cleared, and the user is downgraded to view-only mode.

### Content Encryption

All pad content is encrypted using NIP-44 before publishing:

```typescript
// Derive encryption key deterministically from padId
const conversationKey = sha256(`nostrpad:${padId}`)

// Payload structure
interface PadPayload {
  text: string      // Actual content
  timestamp: number // Client timestamp (ms)
}

// Encrypt payload
const encrypted = nip44Encrypt(JSON.stringify(payload), conversationKey)
```

The `timestamp` field enables conflict resolution - newer timestamps win.

### Nostr Events

NostrPad uses kind 30078 (replaceable application-specific events):

```typescript
{
  kind: 30078,
  created_at: <unix timestamp>,
  tags: [
    ["d", "nostrpad"],      // Makes it replaceable per-author
    ["client", "nostrpad"]  // Client identifier
  ],
  content: "<NIP-44 encrypted payload>",
  pubkey: "<author public key>",
  sig: "<signature>"
}
```

Properties of kind 30078:
- Replaceable: Only the latest event per author+d-tag is kept
- No edit history preserved on relays
- May be pruned by relays based on their retention policies

## Component Architecture

### App.tsx

Root component handling:
- Hash-based routing
- Session modal display logic
- Route state management

### SessionStartModal.tsx

Session management UI with modes:
- **Choice**: Resume/New/Import options
- **Show Secret**: Display generated secret key for backup
- **Import**: Paste existing secret key

State validations:
- Validates session exists before resume
- Confirms secret key backup before proceeding
- Handles storage errors gracefully

### PadPage.tsx

Main view orchestrator:
- Derives keys from padId and session
- Redirects to view-only if edit requested without valid session
- Composes Header, Editor, Footer components

### useNostrPad Hook

Core synchronization logic:

```
Content Change
     │
     ▼
┌─────────────┐     500ms      ┌─────────────┐
│ setContent  │ ───────────────► debouncedContent │
└─────────────┘    debounce    └──────┬──────┘
                                      │
                                      ▼
                               ┌─────────────┐
                               │  Publish    │
                               │  to Relays  │
                               └─────────────┘
```

**Key behaviors:**
- Editor mode: Publish-only, no subscription
- Viewer mode: Subscribe to all kind 30078 events, filter by padId match
- Debounced publishing (500ms) to avoid relay spam
- Session storage backup of content
- Ref-based state to prevent stale closures

### useRelayDiscovery Hook

Probes bootstrap relays and maintains connection status:

```typescript
const BOOTSTRAP_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net'
]
```

Returns list of responsive relays for use by useNostrPad.

## Data Flow

### Publishing (Edit Mode)

```
User Types
    │
    ▼
setContent() ─► sessionStorage backup
    │
    ▼ (500ms debounce)
    │
createPadEvent(text, padId, secretKey)
    │
    ├─► Encrypt payload (NIP-44)
    ├─► Sign event
    └─► Finalize event
    │
    ▼
publishEvent(pool, event, relays)
    │
    └─► pool.publish([relay], event) for each relay
```

### Subscribing (View Mode)

```
Component Mount
    │
    ▼
pool.subscribe(relays, filter)
    │
    filter: { kinds: [30078], '#d': ['nostrpad'], limit: 100 }
    │
    ▼
For each event received:
    │
    ├─► isValidPadEvent(event) - verify signature, kind, d-tag
    ├─► getPadIdFromPubkey(event.pubkey) - check padId match
    ├─► decodePayload(event.content, padId) - decrypt
    └─► Update content if timestamp is newer
```

## Security Considerations

### What's Protected

- **Session secret keys**: Encrypted at rest in IndexedDB with non-extractable AES keys
- **Content in transit**: NIP-44 encryption between client and relays

### What's NOT Protected

- **Content confidentiality**: Anyone with the padId can derive the decryption key
- **Metadata**: Relay operators can see pubkeys, timestamps, event sizes
- **Browser-level attacks**: XSS could access decrypted content in memory
- **Session expiration**: There is no server-side session management or automatic expiration. Sessions persist indefinitely in IndexedDB until manually cleared.
- **Physical access**: Anyone with access to the browser (same device, same browser profile) can resume an active session and gain full read/write access to the pad unless the session is cleared.

### Recommendations

- **Do not store sensitive data** - NostrPad is designed for convenience, not security. Treat it as a semi-public scratchpad.
- Treat pad URLs as semi-public - sharing the URL shares read access
- Clear sessions when done on shared or public computers
- Back up secret keys for important pads
- Use browser private/incognito mode on untrusted devices

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `NOSTRPAD_KIND` | 30078 | Nostr event kind |
| `LOGOUT_KIND` | 21000 | Ephemeral logout signal |
| `D_TAG` | "nostrpad" | Replaceable event identifier |
| `PAD_ID_LENGTH` | 12 | Characters in pad ID |
| `PAD_ID_BYTES` | 8 | Bytes from pubkey for pad ID |
| `DEBOUNCE_MS` | 500 | Publish debounce delay |
| `MAX_CONTENT_LENGTH` | 16000 | Character limit |
| `RELAY_PROBE_TIMEOUT` | 3000 | Relay health check timeout |

## Base59 Encoding

Custom URL-safe alphabet excluding ambiguous characters:

```
23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz-_
```

Excluded: `0`, `O`, `I`, `l`, `1` (visually ambiguous)

This provides ~5.88 bits per character, so 12 characters encode ~70 bits.
