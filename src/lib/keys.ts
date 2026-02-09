import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { sha256 } from '@noble/hashes/sha256'
import { utf8ToBytes } from '@noble/hashes/utils'
import { encode, encodeFixed } from './encoding'
import { PAD_ID_BYTES, PAD_ID_LENGTH, ALPHABET, PAIR_SECRET_DATA_LENGTH, PAIR_SECRET_LENGTH, PAIR_FINGERPRINT_BYTES, PAIR_FINGERPRINT_LENGTH } from './constants'
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

// First 22 primes for the second checksum weight
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79]

/**
 * Compute 2 checksum characters for pair secret data using dual weighted sums mod 59.
 * c1 = sum(val[i] * (i+1)) mod 59 — catches all single-char substitutions + transpositions
 * c2 = sum(val[i] * primes[i]) mod 59 — independent second check with prime weights
 */
export function computePairSecretChecksum(data: string): string {
  let sum1 = 0
  let sum2 = 0
  for (let i = 0; i < data.length; i++) {
    const val = ALPHABET.indexOf(data[i])
    sum1 += val * (i + 1)
    sum2 += val * PRIMES[i]
  }
  return ALPHABET[sum1 % ALPHABET.length] + ALPHABET[sum2 % ALPHABET.length]
}

/**
 * Validate a pair secret: correct length (24), all chars in ALPHABET, checksum match.
 */
export function isValidPairSecret(secret: string): boolean {
  if (secret.length !== PAIR_SECRET_LENGTH) return false
  for (const ch of secret) {
    if (!ALPHABET.includes(ch)) return false
  }
  const data = secret.slice(0, PAIR_SECRET_DATA_LENGTH)
  const checksum = secret.slice(PAIR_SECRET_DATA_LENGTH)
  return computePairSecretChecksum(data) === checksum
}

/**
 * Generate a random pair secret: 22 random ALPHABET chars + 2 checksum chars = 24 total
 * Provides ~129 bits entropy (log2(59^22))
 */
export function generatePairSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(PAIR_SECRET_DATA_LENGTH))
  const data = Array.from(bytes).map(b => ALPHABET[b % ALPHABET.length]).join('')
  return data + computePairSecretChecksum(data)
}

/**
 * Derive deterministic keypairs for a pair session
 * Each side gets its own secret key derived from sha256("nostrpad-pair:" + secret + ":" + side)
 */
export function derivePairKeys(secret: string, role: 1 | 2): {
  localSecretKey: Uint8Array
  localPublicKey: string
  localPadId: string
  remotePadId: string
} {
  const localSide = role
  const remoteSide = role === 1 ? 2 : 1

  const localSecretKey = sha256(utf8ToBytes(`nostrpad-pair:${secret}:${localSide}`))
  const localPublicKey = getPublicKey(localSecretKey)
  const localPadId = encodeFixed(hexToBytes(localPublicKey).slice(0, PAD_ID_BYTES), PAD_ID_LENGTH)

  const remoteSecretKey = sha256(utf8ToBytes(`nostrpad-pair:${secret}:${remoteSide}`))
  const remotePublicKey = getPublicKey(remoteSecretKey)
  const remotePadId = encodeFixed(hexToBytes(remotePublicKey).slice(0, PAD_ID_BYTES), PAD_ID_LENGTH)

  return { localSecretKey, localPublicKey, localPadId, remotePadId }
}

/**
 * Compute a 6-char fingerprint from a pair secret for visual identification.
 * Role-agnostic: same fingerprint regardless of which side you are.
 */
export function computePairFingerprint(secret: string): string {
  const hash = sha256(utf8ToBytes('nostrpad-pair-fp:' + secret))
  return encodeFixed(hash.slice(0, PAIR_FINGERPRINT_BYTES), PAIR_FINGERPRINT_LENGTH)
}

// Helper functions
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}
