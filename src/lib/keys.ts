import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { encode, encodeFixed } from './encoding'
import { PAD_ID_BYTES, PAD_ID_LENGTH, PAIR_CODE_ALPHABET, PAIR_CODE_LENGTH, SECRET_KEY_ALPHABET, SECRET_KEY_DATA_LENGTH, SECRET_KEY_ENCODED_LENGTH } from './constants'
import { getDecryptedPrivateKey } from './sessionStorage'

export interface PadKeys {
  padId: string
  secret: string
  secretKey: Uint8Array
  publicKey: string
}

export interface ParsedUrl {
  padId: string | null
  isEdit: boolean
}

/**
 * Create a new pad with fresh keypair.
 * Note: This only generates keys - caller must persist via createAndStoreSession()
 * from sessionStorage.ts before the secretKey can be retrieved by deriveKeys().
 */
export function createNewPad(): PadKeys {
  const secretKey = generateSecretKey()
  const publicKey = getPublicKey(secretKey)

  // padId uses the first PAD_ID_BYTES bytes of the pubkey, encoded to PAD_ID_LENGTH (short URL identifier)
  const pubkeyBytes = hexToBytes(publicKey)
  const padId = encodeFixed(pubkeyBytes.slice(0, PAD_ID_BYTES), PAD_ID_LENGTH)

  // secret is the full secret key encoded
  const secret = encode(secretKey)

  return { padId, secret, secretKey, publicKey }
}

/**
 * Parse pathname into padId and edit flag
 * Formats: /s/PADID (view-only), /s/PADID/rw (edit)
 */
export function parseUrl(pathname: string): ParsedUrl {
  const match = pathname.match(/^\/s\/([^/]+)(\/rw)?$/)
  if (!match) {
    return { padId: null, isEdit: false }
  }
  return { padId: match[1], isEdit: match[2] === '/rw' }
}

/**
 * Derive keys from padId and edit intent, checking IndexedDB for stored session
 * Falls back to view-only mode if edit is requested but no valid session exists or on errors
 */
export async function deriveKeys(padId: string, isEdit: boolean): Promise<{ secretKey: Uint8Array | null, publicKey: string, sessionCreatedAt?: number }> {
  try {
    if (isEdit) {
      // Edit mode requested: check if we have a stored session for this padId
      const stored = await getDecryptedPrivateKey(padId)
      if (stored) {
        const { privateKey: storedSecretKey, createdAt } = stored
        // We have the secret key from storage
        if (storedSecretKey.length !== 32) {
          return { secretKey: null, publicKey: '' }
        }
        const publicKey = getPublicKey(storedSecretKey)

        // Verify padId matches (first PAD_ID_BYTES bytes of pubkey)
        const pubkeyBytes = hexToBytes(publicKey)
        const expectedPadId = encodeFixed(pubkeyBytes.slice(0, PAD_ID_BYTES), PAD_ID_LENGTH)

        if (expectedPadId !== padId) {
          console.warn('PadId mismatch - stored key may be corrupted')
          return { secretKey: null, publicKey: '' }
        }

        return { secretKey: storedSecretKey, publicKey, sessionCreatedAt: createdAt }
      } else {
        // Edit requested but no stored session: view-only
        return { secretKey: null, publicKey: '' }
      }
    } else {
      // View-only mode: no need to check storage
      return { secretKey: null, publicKey: '' }
    }
  } catch (error) {
    console.error('Failed to derive keys:', error)
    return { secretKey: null, publicKey: '' }
  }
}

/**
 * Generate URLs for sharing
 */
export function generateShareUrls(padId: string): { viewerUrl: string, editorUrl: string } {
  const origin = window.location.origin
  return {
    viewerUrl: `${origin}/s/${padId}`,
    editorUrl: `${origin}/s/${padId}/rw`
  }
}

/**
 * Compute 1 checksum character for pair code data using position-weighted sum mod 29.
 */
export function computePairChecksum(data: string): string {
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    const val = PAIR_CODE_ALPHABET.indexOf(data[i])
    sum += val * (i + 1)
  }
  return PAIR_CODE_ALPHABET[sum % PAIR_CODE_ALPHABET.length]
}

/**
 * Validate a pair code: correct length (6), all chars in PAIR_CODE_ALPHABET, checksum match.
 */
export function isValidPairCode(code: string): boolean {
  if (code.length !== PAIR_CODE_LENGTH) return false
  for (const ch of code) {
    if (!PAIR_CODE_ALPHABET.includes(ch)) return false
  }
  const data = code.slice(0, PAIR_CODE_LENGTH - 1)
  const checksum = code.slice(PAIR_CODE_LENGTH - 1)
  return computePairChecksum(data) === checksum
}

/**
 * Generate a random pair code: 5 random PAIR_CODE_ALPHABET chars + 1 checksum char = 6 total
 */
export function generatePairCode(): string {
  const dataLen = PAIR_CODE_LENGTH - 1
  const bytes = crypto.getRandomValues(new Uint8Array(dataLen))
  const data = Array.from(bytes).map(b => PAIR_CODE_ALPHABET[b % PAIR_CODE_ALPHABET.length]).join('')
  return data + computePairChecksum(data)
}

/**
 * Derive deterministic keypairs for a pair session.
 * Uses secretKey (non-extractable HMAC CryptoKey) + pairCode (6-char channel ID) + role to derive keys.
 * The root secret key never leaves Web Crypto — only derived keys are exposed as raw bytes.
 */
export async function derivePairKeys(secretKey: CryptoKey, pairCode: string, role: 1 | 2): Promise<{
  localSecretKey: Uint8Array
  localPublicKey: string
  localPadId: string
  remotePadId: string
}> {
  const localSide = role
  const remoteSide = role === 1 ? 2 : 1

  const encoder = new TextEncoder()

  const localDerivedKey = new Uint8Array(await crypto.subtle.sign('HMAC', secretKey, encoder.encode(`nostrpad-pair:${pairCode}:${localSide}`)))
  const localPublicKey = getPublicKey(localDerivedKey)
  const localPadId = encodeFixed(hexToBytes(localPublicKey).slice(0, PAD_ID_BYTES), PAD_ID_LENGTH)

  const remoteDerivedKey = new Uint8Array(await crypto.subtle.sign('HMAC', secretKey, encoder.encode(`nostrpad-pair:${pairCode}:${remoteSide}`)))
  const remotePublicKey = getPublicKey(remoteDerivedKey)
  const remotePadId = encodeFixed(hexToBytes(remotePublicKey).slice(0, PAD_ID_BYTES), PAD_ID_LENGTH)

  return { localSecretKey: localDerivedKey, localPublicKey, localPadId, remotePadId }
}

// First 44 primes for dual-weighted checksum
const SECRET_KEY_PRIMES = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29,
  31, 37, 41, 43, 47, 53, 59, 61, 67, 71,
  73, 79, 83, 89, 97, 101, 103, 107, 109, 113,
  127, 131, 137, 139, 149, 151, 157, 163, 167, 173,
  179, 181, 191, 193
]

const SECRET_KEY_BASE = BigInt(SECRET_KEY_ALPHABET.length) // 59

/**
 * Compute 2 checksum characters for secret key data using dual weighted sums mod 59.
 * c1 = position-weighted: catches single substitutions + adjacent transpositions
 * c2 = prime-weighted: independent second check
 */
export function computeSecretKeyChecksum(data: string): string {
  let sum1 = 0
  let sum2 = 0
  for (let i = 0; i < data.length; i++) {
    const val = SECRET_KEY_ALPHABET.indexOf(data[i])
    sum1 += val * (i + 1)
    sum2 += val * SECRET_KEY_PRIMES[i]
  }
  const c1 = SECRET_KEY_ALPHABET[sum1 % SECRET_KEY_ALPHABET.length]
  const c2 = SECRET_KEY_ALPHABET[sum2 % SECRET_KEY_ALPHABET.length]
  return c1 + c2
}

/**
 * Encode 32 bytes to a 46-char secret key string (44 data + 2 checksum).
 * Fixed-length base-59 encoding.
 */
export function encodeSecretKey(bytes: Uint8Array): string {
  let num = BigInt(0)
  for (const byte of bytes) {
    num = num * BigInt(256) + BigInt(byte)
  }

  // Fixed-length base-59: always produce exactly SECRET_KEY_DATA_LENGTH chars
  const chars: string[] = []
  for (let i = 0; i < SECRET_KEY_DATA_LENGTH; i++) {
    const remainder = Number(num % SECRET_KEY_BASE)
    chars.unshift(SECRET_KEY_ALPHABET[remainder])
    num = num / SECRET_KEY_BASE
  }

  const data = chars.join('')
  return data + computeSecretKeyChecksum(data)
}

/**
 * Decode a 46-char encoded secret key back to 32 bytes.
 * Validates length, alphabet, and checksum.
 */
export function decodeSecretKey(encoded: string): Uint8Array {
  if (encoded.length !== SECRET_KEY_ENCODED_LENGTH) {
    throw new Error(`Invalid secret key length: expected ${SECRET_KEY_ENCODED_LENGTH}, got ${encoded.length}`)
  }

  const data = encoded.slice(0, SECRET_KEY_DATA_LENGTH)
  const checksum = encoded.slice(SECRET_KEY_DATA_LENGTH)

  for (const ch of data) {
    if (!SECRET_KEY_ALPHABET.includes(ch)) {
      throw new Error(`Invalid character in secret key: "${ch}"`)
    }
  }

  if (computeSecretKeyChecksum(data) !== checksum) {
    throw new Error('Invalid secret key checksum')
  }

  // Decode base-59 data to BigInt
  let num = BigInt(0)
  for (const ch of data) {
    num = num * SECRET_KEY_BASE + BigInt(SECRET_KEY_ALPHABET.indexOf(ch))
  }

  // Convert BigInt to 32 bytes (fixed length)
  const bytes = new Uint8Array(32)
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(num % BigInt(256))
    num = num / BigInt(256)
  }

  return bytes
}

/**
 * Validate a secret key encoding: length + alphabet + checksum.
 */
export function isValidSecretKeyEncoding(encoded: string): boolean {
  if (encoded.length !== SECRET_KEY_ENCODED_LENGTH) return false

  const data = encoded.slice(0, SECRET_KEY_DATA_LENGTH)
  const checksum = encoded.slice(SECRET_KEY_DATA_LENGTH)

  for (const ch of encoded) {
    if (!SECRET_KEY_ALPHABET.includes(ch)) return false
  }

  return computeSecretKeyChecksum(data) === checksum
}

// Helper functions
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

