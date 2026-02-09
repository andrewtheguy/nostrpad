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

// Pair code: 29-char alphabet (prime, enables perfect checksum detection)
// Excludes 0/1/i/l/o/u/z for non-ambiguity; 29 is prime so weighted checksum
// catches all single-char substitutions and transpositions of different chars
export const PAIR_CODE_ALPHABET = '23456789abcdefghjkmnpqrstvwxy'
export const PAIR_CODE_LENGTH = 6
