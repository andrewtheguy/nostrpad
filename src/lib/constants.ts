export const NOSTRPAD_KIND = 30078
export const D_TAG = 'nostrpad'

// NIP-65 Relay List Metadata
export const RELAY_LIST_KIND = 10002

// Bootstrap relays for initial discovery
export const BOOTSTRAP_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net'
]

// Keep DEFAULT_RELAYS as alias for backward compatibility
export const DEFAULT_RELAYS = BOOTSTRAP_RELAYS

// Additional candidate relays to probe
export const CANDIDATE_RELAYS = [
  ...BOOTSTRAP_RELAYS,
  'wss://nostr.wine',
  'wss://relay.snort.social'
]

// Number of relays to select for a pad
export const TARGET_RELAY_COUNT = 5

// Timeout for relay probing (ms)
export const RELAY_PROBE_TIMEOUT = 5000

// Cache duration for discovered relays (5 minutes)
export const RELAY_CACHE_DURATION = 5 * 60 * 1000

// LocalStorage key for relay cache
export const RELAY_CACHE_KEY = 'nostrpad_relay_cache'

export const DEBOUNCE_MS = 500

// Character limit for pad content (16KB is safe for most relays)
export const MAX_CONTENT_LENGTH = 16000

// Base56 alphabet - excludes 0, O, I, l, 1 for unambiguous characters
export const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
