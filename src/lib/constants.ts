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

// Pair roles
export const PAIR_ROLE_INITIATOR = 1 as const
export const PAIR_ROLE_JOINER = 2 as const
export type PairRole = typeof PAIR_ROLE_INITIATOR | typeof PAIR_ROLE_JOINER

// Pair code: 5 data chars + 1 checksum char = 6 total
// Uses 29-char alphabet (prime) for short channel identifiers
export const PAIR_CODE_ALPHABET = '23456789abcdefghjkmnpqrstvwxy'
export const PAIR_CODE_LENGTH = 6

// Secret key encoding: 59-char alphabet (prime), 44 data + 2 checksum = 46 total
export const SECRET_KEY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz-.,'
export const SECRET_KEY_DATA_LENGTH = 44
export const SECRET_KEY_CHECKSUM_LENGTH = 2
export const SECRET_KEY_ENCODED_LENGTH = 46
