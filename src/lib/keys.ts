import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { encode, decode, encodeFixed } from './encoding'
import { PAD_ID_BYTES, PAD_ID_LENGTH } from './constants'
import { getDecryptedPrivateKey } from './sessionStorage'

export interface PadKeys {
  padId: string
  secret: string
  secretKey: Uint8Array
  publicKey: string
}

export interface ParsedUrl {
  padId: string | null
  secret: string | null
}

/**
 * Create a new pad with fresh keypair
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
 * Parse hash URL into padId
 * Format: #padId
 */
export function parseUrl(hash: string): ParsedUrl {
  // Remove leading # if present
  const cleanHash = hash.startsWith('#') ? hash.slice(1) : hash

  if (!cleanHash) {
    return { padId: null, secret: null }
  }

  // Only padId, no secret
  return { padId: cleanHash, secret: null }
}

/**
 * Derive keys from padId, checking IndexedDB for stored session
 * Returns null if derivation fails
 */
export async function deriveKeys(padId: string): Promise<{ secretKey: Uint8Array | null, publicKey: string } | null> {
  try {
    // Check if we have a stored session for this padId
    const storedSecretKey = await getDecryptedPrivateKey(padId)
    if (storedSecretKey) {
      // We have the secret key from storage
      if (storedSecretKey.length !== 32) {
        return null
      }
      const publicKey = getPublicKey(storedSecretKey)

      // Verify padId matches (first PAD_ID_BYTES bytes of pubkey)
      const pubkeyBytes = hexToBytes(publicKey)
      const expectedPadId = encodeFixed(pubkeyBytes.slice(0, PAD_ID_BYTES), PAD_ID_LENGTH)

      if (expectedPadId !== padId) {
        console.warn('PadId mismatch - stored key may be corrupted')
        return null
      }

      return { secretKey: storedSecretKey, publicKey }
    } else {
      // View-only mode: no stored session
      return { secretKey: null, publicKey: '' }
    }
  } catch (error) {
    console.error('Failed to derive keys:', error)
    return null
  }
}

/**
 * Generate URL for sharing
 */
export function generateShareUrl(padId: string): string {
  const base = window.location.origin + window.location.pathname
  return `${base}#${padId}`
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
