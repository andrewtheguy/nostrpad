export const NOSTRPAD_KIND = 30078
export const D_TAG = 'nostrpad'

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

// Base56 alphabet - excludes 0, O, I, l, 1 for unambiguous characters
export const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
