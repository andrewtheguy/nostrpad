export const NOSTRPAD_KIND = 30078
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
