export const NOSTRPAD_KIND = 30078
export const LOGOUT_KIND = 21000
export const D_TAG = 'nostrpad'

// Pad ID format (Base59, URL-safe)
export const PAD_ID_LENGTH = 12
export const PAD_ID_BYTES = 8

// Bootstrap relays
export const BOOTSTRAP_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net'
]

// Timeout for relay probing (ms)
export const RELAY_PROBE_TIMEOUT = 3000

export const DEBOUNCE_MS = 500

// Character limit for pad content (16KB is safe for most relays)
export const MAX_CONTENT_LENGTH = 16000

// URL-safe Base59 alphabet: standard Base58 plus '-' and '_' (59 characters)
// Excludes 0, O, I, l, 1 for unambiguous characters
export const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz-_'

// Pair secret: 22 data chars + 2 checksum chars = 24 total
// Uses full ALPHABET (59 chars, prime) for ~129 bits entropy
export const PAIR_SECRET_DATA_LENGTH = 22
export const PAIR_SECRET_CHECKSUM_LENGTH = 2
export const PAIR_SECRET_LENGTH = 24

// Pair fingerprint: sha256 prefix encoded to Base59 for visual identification
export const PAIR_FINGERPRINT_BYTES = 4
export const PAIR_FINGERPRINT_LENGTH = 6
