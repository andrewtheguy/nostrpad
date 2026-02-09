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
│   ├── PadPage.tsx       # Sender/receiver pad view orchestrator
│   ├── PairModal.tsx     # Create/join pair session modal
│   ├── SessionStartModal.tsx  # Session & pair setup management UI
│   ├── ShareModal.tsx    # Share URLs and QR code
│   └── SplitPadPage.tsx  # Split-screen pair mode view
├── hooks/
│   ├── useDebounce.ts    # Debounce hook for publish delay
│   ├── useNostrPad.ts    # Core Nostr sync logic
│   └── useRelayDiscovery.ts  # Relay health checking
├── lib/
│   ├── constants.ts      # App constants
│   ├── encoding.ts       # Base59 encoding/decoding utilities
│   ├── keys.ts           # Key derivation, URL parsing, pair code generation
│   ├── keys.test.ts      # Key derivation tests
│   ├── navigation.ts     # Path-based navigation helper
│   ├── nostr.ts          # Nostr event creation/validation
│   ├── pairSessionStorage.ts  # IndexedDB pair mode session management
│   ├── relayDiscovery.ts # Relay probing logic
│   ├── sessionStorage.ts # IndexedDB sender/receiver session management
│   └── types.ts          # TypeScript types
└── utils/
    └── crc32.ts          # CRC32 checksum for content
```

## Core Concepts

### Identity Model

Each pad is associated with a Nostr keypair. In **sender/receiver mode**, the keypair is generated directly. In **pair mode**, it is derived from a root HMAC key.

**Sender/Receiver mode:**
```
Secret Key (32 random bytes)
       │
       ▼
Public Key (32 bytes hex)
       │
       ▼
Pad ID = Base59(pubkey[0:8]) = 12 characters
```

**Pair mode:**
```
Root Secret Key (32 bytes) → non-extractable HMAC CryptoKey
       │
       ▼  HMAC-SHA256(rootKey, "nostrpad-pair:{code}:{role}")
       │
Derived Nostr Secret Key (32 bytes, raw in memory)
       │
       ▼
Public Key (32 bytes hex)
       │
       ▼
Pad ID = Base59(pubkey[0:8]) = 12 characters
```

In both modes, the pad ID is a 12-character Base59 identifier derived from the first 8 bytes of the public key.

### URL Routing

Path-based routing with three route families:

| URL Pattern | Mode | Description |
|-------------|------|-------------|
| `/s/<padId>` | View | Read-only sender/receiver pad |
| `/s/<padId>/rw` | Edit | Edit mode, requires active session with matching secret key |
| `/p/<pairCode>` | Pair | Split-screen pair mode (send + receive panes) |
| `/` | Start | Session management modal |

The `App.tsx` component handles routing via `popstate` events and `navigation.ts` provides `navigateTo()` for programmatic path changes using `history.pushState`.

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

The `integrityTag` cryptographically binds the displayed padId and timestamp to the actual encrypted data, preventing tampering attacks.

**serializeSession Specification:**

```typescript
function serializeSession(
  padId: string,           // 12-character Base59 string
  createdAt: number,       // Milliseconds since Unix epoch
  iv: Uint8Array,          // 12 bytes (96-bit AES-GCM IV)
  encryptedPrivateKey: Uint8Array  // 48 bytes (32-byte key + 16-byte auth tag)
): Uint8Array {
  // padId: UTF-8 encoded bytes (12 bytes for 12 ASCII characters)
  const padIdBytes = new TextEncoder().encode(padId)  // 12 bytes

  // createdAt: 8-byte big-endian unsigned integer
  const createdAtBytes = new Uint8Array(8)
  const view = new DataView(createdAtBytes.buffer)
  view.setBigUint64(0, BigInt(createdAt), false)  // false = big-endian

  // Concatenate in order: padId || createdAt || iv || encryptedPrivateKey
  // Total: 12 + 8 + 12 + 48 = 80 bytes (no delimiters)
  const result = new Uint8Array(padIdBytes.length + 8 + iv.length + encryptedPrivateKey.length)
  let offset = 0
  result.set(padIdBytes, offset);        offset += padIdBytes.length
  result.set(createdAtBytes, offset);    offset += 8
  result.set(iv, offset);                offset += iv.length
  result.set(encryptedPrivateKey, offset)

  return result
}

// integrityTag computation
integrityTag = SHA-256(serializeSession(padId, createdAt, iv, encryptedPrivateKey))
```

**Example:**

```
padId:              "ABC123xyz789"
createdAt:          1704067200000 (2024-01-01T00:00:00.000Z)
iv:                 <12 random bytes>
encryptedPrivateKey: <48 bytes from AES-GCM>

Serialized (80 bytes):
  Bytes  0-11:  UTF-8("ABC123xyz789")           = 0x41 0x42 0x43 0x31 0x32 0x33 0x78 0x79 0x7a 0x37 0x38 0x39
  Bytes 12-19:  BigEndian(1704067200000)        = 0x00 0x00 0x01 0x8c 0xf3 0x4c 0x98 0x00
  Bytes 20-31:  iv (raw bytes)
  Bytes 32-79:  encryptedPrivateKey (raw bytes)

integrityTag = SHA-256(serialized) → 32 bytes
```

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

### Pair Mode

Pair mode allows two users sharing the same secret key to create split-screen sessions for bidirectional communication. Each user sees a "Send" pane (editable) and a "Receive" pane (read-only from the partner).

#### Pair Secret Key Storage

The pair secret key is stored in a separate IndexedDB database (`nostrpad-pair-sessions`, version 5) with two object stores: `pairSecretKey` and `pairSessions`.

```typescript
interface PairSecretKeyData {
  hmacKey: CryptoKey        // non-extractable HMAC-SHA256 (for signing key derivation)
  hkdfKey: CryptoKey        // non-extractable HKDF base key (for content encryption key derivation)
  fingerprint: string       // 11-char base59 string
  createdAt: number
  integrityTag: Uint8Array  // SHA-256(fingerprint + createdAt)
}
```

The raw secret key bytes are imported as both a non-extractable HMAC-SHA256 `CryptoKey` (for signing key derivation) and a non-extractable HKDF `CryptoKey` (for content encryption key derivation) on store. After import, the raw bytes are never accessible to JavaScript.

**Secret Key Encoding:** For generation and import, the 32-byte secret key is encoded as a 46-character string (44 data chars in base-59 + 2 checksum chars). The checksum uses dual weighted sums (position-weighted + prime-weighted) mod 59 to catch single substitutions and transpositions.

#### Fingerprint

Since the key is non-extractable, the fingerprint provides a visual confirmation of which key is loaded:

```
fingerprint = encodeFixed(HMAC-SHA256(hmacKey, "nostrpad-pair-fingerprint")[0:8], 11)
```

This produces an 11-character base59 string (~47 bits). The same raw secret key always produces the same fingerprint, so users can compare across devices after import. Displayed as `Secret key fingerprint: ABCDE-FGHIJK`.

#### Integrity Verification

The integrity tag binds the fingerprint and timestamp together:

```
integrityTag = SHA-256(utf8(fingerprint) || bigEndian64(createdAt))
```

On read (`getPairSecretKey`):
1. Recompute fingerprint from hmacKey (sign known label)
2. Constant-time compare with stored fingerprint
3. Recompute integrity tag from fingerprint + createdAt
4. Constant-time compare with stored integrity tag
5. Return null if either check fails

This detects CryptoKey swap (fingerprint changes), createdAt tampering (integrity tag changes), and partial record corruption.

#### Key Derivation

Each pair session derives deterministic keypairs from the root HMAC key:

```
localKey  = HMAC-SHA256(secretKey, "nostrpad-pair:{pairCode}:{role}")
remoteKey = HMAC-SHA256(secretKey, "nostrpad-pair:{pairCode}:{otherRole}")
```

Where `role` is 1 (creator) or 2 (joiner). Each derived key is a 32-byte nostr secret key from which public keys and pad IDs are computed.

#### Pair Code

A 6-character code (5 random + 1 checksum) using a 29-character lowercase alphabet. The checksum uses position-weighted sum mod 29 to catch typos and transpositions.

#### Pair Session Data

```typescript
interface PairSessionData {
  localPadId: string
  remotePadId: string
  pairCode: string
  role: 1 | 2
  createdAt: number
}
```

Sessions are keyed by `pairCode` in IndexedDB. On load (`getDecryptedPairSession(pairCode)`), derived pad IDs are verified against stored values. If they don't match, the session is cleared as corrupt. Content encryption keys are also derived at load time using HKDF (see Content Encryption below).

### Content Encryption

Content encryption differs between sender/receiver mode and pair mode.

**Sender/Receiver mode (NIP-44):**

Content is encrypted using NIP-44 with a key derived deterministically from the padId:

```typescript
const conversationKey = sha256(`nostrpad:${padId}`)
const encrypted = nip44Encrypt(JSON.stringify(payload), conversationKey)
```

Since the padId is in the URL, anyone with the URL can decrypt content. This provides obfuscation from relay operators, not confidentiality.

**Pair mode (AES-GCM with HKDF-derived keys):**

Content is encrypted using AES-GCM-256 with keys derived from the root secret via HKDF. Each side of the pair has its own content key:

```typescript
// Derive content keys from HKDF root key
const localContentKey = crypto.subtle.deriveKey(
  { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0),
    info: encode(`nostrpad-pair-content:${pairCode}:${role}`) },
  hkdfKey,
  { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
)
```

Wire format: `base64( 0x01 || IV[12] || AES-GCM-ciphertext-with-tag )`
- `0x01` version byte for format detection
- 12-byte random IV per encryption
- AES-GCM ciphertext includes 16-byte auth tag automatically

Both users derive the same two content keys (one per side) because they share the same HKDF root key and pairCode. The content keys are non-extractable `CryptoKey` objects, providing protection even if someone has scripting access to IndexedDB.

**Common payload structure:**

```typescript
interface PadPayload {
  text: string      // Actual content
  timestamp: number // Client timestamp (ms)
}
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
  content: "<NIP-44 (sender/receiver) or AES-GCM (pair mode) encrypted payload>",
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
- Path-based routing (`/s/`, `/p/`, `/`)
- Renders `SplitPadPage` for pair routes, `PadPage` for sender/receiver routes
- Session modal display logic
- Route state management via `popstate` events

### SessionStartModal.tsx

Session management UI with modes:
- **Mode Select**: Choose between Sender/Receiver and Pair Mode
- **Sender/Receiver**: Resume/New/Import options
- **Show Secret**: Display generated secret key for backup
- **Import**: Paste existing secret key
- **Pair Setup**: Generate or import a pair secret key (46-char encoded)
- **Pair**: Create or join pair sessions, list saved sessions, display secret key fingerprint

State validations:
- Validates session exists before resume
- Confirms secret key backup before proceeding
- Validates pair code checksum before joining
- Handles storage errors gracefully

### PadPage.tsx

Sender/receiver view orchestrator:
- Derives keys from padId and session
- Redirects to view-only if edit requested without valid session
- Single-tab editor enforcement via BroadcastChannel
- Composes Header, Editor, Footer components

### SplitPadPage.tsx

Pair mode split-screen view:
- Accepts `pairCode` prop (URL is `/p/<pairCode>`, same for both users)
- Loads pair session from IndexedDB via `getDecryptedPairSession(pairCode)`
- Derives HKDF content keys (localContentKey, remoteContentKey) for AES-GCM encryption
- Creates two `useNostrPad` instances: local (editable, with localContentKey) and remote (view-only, with remoteContentKey)
- Single-tab editor enforcement via BroadcastChannel (keyed by pairCode)
- Renders Send pane (left/top, editable) and Receive pane (right/bottom, read-only)
- Shows loading, error, and multi-tab-blocked states

### PairModal.tsx

Modal for creating/joining pair sessions from within the app:
- Two tabs: Create Pair and Join Pair
- Generates 6-character pair codes with checksum validation
- Displays secret key fingerprint
- Fetches pair secret key on mount, derives keys via `derivePairKeys`

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

**Options:**
```typescript
interface UseNostrPadOptions {
  padId: string
  publicKey: string
  secretKey: Uint8Array | null
  contentKey?: CryptoKey | null  // When provided, uses AES-GCM (pair mode) instead of NIP-44
  sessionCreatedAt?: number
  onLogoutSignal?: () => void
  isBlocked?: boolean  // Skip subscriptions and publishing when true
}
```

**Key behaviors:**
- Editor mode: One-time content fetch on init, then subscribe to logout events only
- Viewer mode: Subscribe to all kind 30078 events, filter by padId match
- Debounced publishing (500ms) to avoid relay spam
- Nostr relay is the sole source of truth for content (no local caching)
- Ref-based state to prevent stale closures
- Guards: skips all subscriptions when `padId` is falsy or `isBlocked` is true

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
Component Mount
    │
    ▼
pool.querySync(relays, contentFilter)
    │
    └─► Fetch latest content event once
    │
    ▼
User Types
    │
    ▼
setContent()
    │
    ▼ (500ms debounce)
    │
createPadEvent (sender/receiver) or createPairPadEvent (pair mode)
    │
    ├─► Encrypt payload (NIP-44 or AES-GCM)
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

- **Session secret keys (sender/receiver)**: Encrypted at rest in IndexedDB with non-extractable AES keys
- **Pair mode root key**: Stored as both a non-extractable HMAC-SHA256 CryptoKey and a non-extractable HKDF CryptoKey in IndexedDB — raw bytes never enter JavaScript after initial import
- **Content on relays (sender/receiver)** (obfuscation only): NIP-44 encryption using `sha256("nostrpad:" + padId)`. This prevents casual reading by relay operators but is **not confidential** — anyone with the padId (which is in the URL) can derive the key and decrypt.
- **Content on relays (pair mode)** (confidential): AES-GCM-256 with HKDF-derived non-extractable keys from the root secret. Only someone with the root secret key can derive the content encryption keys. The content keys are non-extractable CryptoKey objects — even with scripting access to IndexedDB, they cannot be exported. Knowing the pairCode, the URL, or even the derived signing keys is **not sufficient** to decrypt content.
- **Pair mode signing/content key separation**: The derived nostr signing key (from HMAC) and the content encryption key (from HKDF) are independent. Leaking the signing key does not reveal the content key, and vice versa.

### What's NOT Protected

- **Content confidentiality (sender/receiver only)**: Anyone with the padId can derive the decryption key (`sha256("nostrpad:" + padId)`) — the padId is in the URL. This does **not** apply to pair mode, where content keys require the root secret.
- **Metadata**: Relay operators can see pubkeys, timestamps, and event sizes in both modes. In pair mode, the pairCode is in the URL but does not reveal which relay events correspond to the session (that requires the HMAC key to derive the pubkeys).
- **Browser-level attacks (both modes)**: XSS could access decrypted content in memory. In pair mode, XSS can also call `crypto.subtle.encrypt`/`decrypt` using the non-extractable content keys (they can't export the keys, but can use them while the page is compromised).
- **Signing keys in memory (both modes)**: Nostr signing keys exist as raw `Uint8Array` in JavaScript memory at runtime (Web Crypto doesn't support secp256k1). In sender/receiver mode, the signing key also implicitly grants content decryption (via padId derivation). In pair mode, the signing key only grants write access — content decryption requires the separate HKDF-derived content key, which remains non-extractable.
- **Pair code entropy**: Pair codes are 5 random characters from a 29-character alphabet (~24 bits). An attacker who has the same root secret key could enumerate all ~20M possible codes. The pair code is a channel identifier, not a security boundary — the root secret key is the security boundary.
- **Session expiration**: There is no server-side session management or automatic expiration. Sessions persist indefinitely in IndexedDB until manually cleared.
- **Physical access**: Anyone with access to the browser (same device, same browser profile) can resume an active session. In sender/receiver mode this grants full read/write access. In pair mode, the attacker can use the non-extractable CryptoKey objects through the browser's Web Crypto API (decrypt content, encrypt new content, sign events) but cannot export the root key or content keys.

### Data Safety When Derived Keys Are Compromised

#### Pair mode — secret key and content safe even if derived signing key leaks

The pair secret key is the root HMAC/HKDF key. Derived nostr signing keys are `HMAC-SHA256(secretKey, "nostrpad-pair:" + code + ":" + role)`. Content keys are `HKDF(secretKey, info="nostrpad-pair-content:" + code + ":" + role)`. These are independent derivation paths. If an attacker obtains a derived signing key (e.g., from memory, a compromised environment, or a leaked nostr event signature):

- **Secret key is NOT compromised.** HMAC is a one-way keyed function — knowing the output for one input does not reveal the key.
- **Content is NOT compromised.** The content encryption keys are derived via HKDF with a different info string than the signing keys. Knowing the signing key does not reveal the HKDF-derived content key. The attacker can publish events but cannot decrypt existing content.
- **Other pair sessions are NOT compromised.** Each (pairCode, role) combination produces a cryptographically independent derived key.
- **Attacker capability is limited to write access on one pad.** With a leaked derived signing key they can sign nostr events for that single pad, but they cannot decrypt content (requires the HKDF root key) and cannot create new pair sessions or impersonate the user on any other pair.

In short: if someone runs the app in an untrusted environment and the derived nostr signing keys are extracted from memory, the root pair secret key (stored as a non-extractable CryptoKey) remains safe, and existing content remains confidential. The user can clear that pair session and create new ones without needing to rotate their secret key.

#### Sender/receiver mode — at-rest data safe even if signing key leaks at runtime

In sender/receiver mode, the nostr key IS the signing key (not derived from a root). It must exist as raw bytes in memory for `nostr-tools` signing. A leaked signing key grants **both write and read access**: the attacker can derive the padId from the public key, then derive the NIP-44 conversation key (`sha256("nostrpad:" + padId)`) to decrypt all content.

However:

- **At-rest protection holds.** The nostr key is encrypted in IndexedDB with a non-extractable AES-256-GCM CryptoKey. An attacker who only has IndexedDB access (e.g., a backup, another app on the same origin) cannot decrypt the stored key without the CryptoKey object in the same browser session.
- **No root key to protect.** Unlike pair mode there's no derivation hierarchy, so the signing key compromise IS the full compromise for that pad. This is inherent to the single-key-per-pad design.

#### Summary

| Scenario | Secret key safe? | Content safe? | Other sessions safe? |
|----------|-----------------|---------------|---------------------|
| Pair mode: derived signing key leaked | Yes (HMAC is one-way) | Yes (HKDF content key is separate) | Yes (independent derivation per code) |
| Pair mode: IndexedDB accessed without CryptoKey | Yes (non-extractable) | Yes (content keys non-extractable) | Yes |
| Sender/receiver: signing key leaked at runtime | N/A (it IS the key) | No (padId → NIP-44 key) | N/A (single pad) |
| Sender/receiver: IndexedDB accessed without CryptoKey | Yes (AES non-extractable) | Yes (can't decrypt key) | N/A |

### Recommendations

- **Sender/receiver mode**: Treat pad URLs as semi-public — sharing the URL shares read access (the padId in the URL is sufficient to derive the decryption key)
- **Pair mode**: URLs (`/p/<pairCode>`) do not grant read access — the pairCode alone cannot derive content keys without the root secret. However, treat the root secret key as the trust boundary
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
| `PAIR_CODE_ALPHABET` | 29-char lowercase | Pair code character set (prime size) |
| `PAIR_CODE_LENGTH` | 6 | Pair code length (5 data + 1 checksum) |
| `SECRET_KEY_ALPHABET` | 59-char set | Secret key encoding alphabet (includes `.-,`) |
| `SECRET_KEY_DATA_LENGTH` | 44 | Data characters in encoded secret key |
| `SECRET_KEY_CHECKSUM_LENGTH` | 2 | Checksum characters in encoded secret key |
| `SECRET_KEY_ENCODED_LENGTH` | 46 | Total encoded secret key length (44 + 2) |

## Base59 Encoding

Custom URL-safe alphabet excluding ambiguous characters:

```
23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz-_
```

Excluded: `0`, `O`, `I`, `l`, `1` (visually ambiguous)

This provides ~5.88 bits per character, so 12 characters encode ~70 bits.
