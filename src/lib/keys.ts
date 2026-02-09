import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { sha256 } from '@noble/hashes/sha256'
import { utf8ToBytes } from '@noble/hashes/utils'
import { encode, encodeFixed } from './encoding'
import { PAD_ID_BYTES, PAD_ID_LENGTH, PAIR_CODE_ALPHABET, PAIR_CODE_LENGTH } from './constants'
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
 * Compute checksum character for pair code data using position-weighted sum.
 * Catches all single-character substitutions and transpositions of different characters.
 */
export function computePairChecksum(data: string): string {
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    sum += PAIR_CODE_ALPHABET.indexOf(data[i]) * (i + 1)
  }
  return PAIR_CODE_ALPHABET[sum % PAIR_CODE_ALPHABET.length]
}

/**
 * Validate a pair code: correct length, valid characters, and checksum matches.
 */
export function isValidPairCode(code: string): boolean {
  if (code.length !== PAIR_CODE_LENGTH) return false
  for (const ch of code) {
    if (!PAIR_CODE_ALPHABET.includes(ch)) return false
  }
  const data = code.slice(0, -1)
  const checksum = code.slice(-1)
  return computePairChecksum(data) === checksum
}

/**
 * Generate a random pair code: (PAIR_CODE_LENGTH - 1) random chars + 1 checksum char
 */
export function generatePairCode(): string {
  const dataLength = PAIR_CODE_LENGTH - 1
  const bytes = crypto.getRandomValues(new Uint8Array(dataLength))
  const data = Array.from(bytes).map(b => PAIR_CODE_ALPHABET[b % PAIR_CODE_ALPHABET.length]).join('')
  return data + computePairChecksum(data)
}

/**
 * Derive deterministic keypairs for a pair session
 * Each side gets its own secret key derived from sha256("nostrpad-pair:" + code + ":" + side)
 */
export function derivePairKeys(code: string, role: 1 | 2): {
  localSecretKey: Uint8Array
  localPublicKey: string
  localPadId: string
  remotePadId: string
} {
  const localSide = role
  const remoteSide = role === 1 ? 2 : 1

  const localSecretKey = sha256(utf8ToBytes(`nostrpad-pair:${code}:${localSide}`))
  const localPublicKey = getPublicKey(localSecretKey)
  const localPadId = encodeFixed(hexToBytes(localPublicKey).slice(0, PAD_ID_BYTES), PAD_ID_LENGTH)

  const remoteSecretKey = sha256(utf8ToBytes(`nostrpad-pair:${code}:${remoteSide}`))
  const remotePublicKey = getPublicKey(remoteSecretKey)
  const remotePadId = encodeFixed(hexToBytes(remotePublicKey).slice(0, PAD_ID_BYTES), PAD_ID_LENGTH)

  return { localSecretKey, localPublicKey, localPadId, remotePadId }
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
