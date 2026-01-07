import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { encode, encodeFixed } from './encoding'
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
  isEdit: boolean
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
 * Parse hash URL into padId and edit flag
 * Formats: #padId or #padId:rw
 */
export function parseUrl(hash: string): ParsedUrl {
  // Remove leading # if present
  const cleanHash = hash.startsWith('#') ? hash.slice(1) : hash

  if (!cleanHash) {
    return { padId: null, isEdit: false }
  }

  const colonIndex = cleanHash.indexOf(':')

  if (colonIndex === -1) {
    // View-only URL: just padId
    return { padId: cleanHash, isEdit: false }
  }

  // Check if it's :rw
  const suffix = cleanHash.slice(colonIndex + 1)
  if (suffix === 'rw') {
    const padId = cleanHash.slice(0, colonIndex)
    return { padId, isEdit: true }
  }

  // Invalid format, treat as view-only
  return { padId: cleanHash, isEdit: false }
}

/**
 * Derive keys from padId and edit intent, checking IndexedDB for stored session
 * Returns null if derivation fails
 */
export async function deriveKeys(padId: string, isEdit: boolean): Promise<{ secretKey: Uint8Array | null, publicKey: string } | null> {
  try {
    if (isEdit) {
      // Edit mode requested: check if we have a stored session for this padId
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
        // Edit requested but no stored session: view-only
        return { secretKey: null, publicKey: '' }
      }
    } else {
      // View-only mode: no need to check storage
      return { secretKey: null, publicKey: '' }
    }
  } catch (error) {
    console.error('Failed to derive keys:', error)
    return null
  }
}

/**
 * Generate URLs for sharing
 */
export function generateShareUrls(padId: string): { viewerUrl: string, editorUrl: string } {
  const base = window.location.origin + window.location.pathname
  return {
    viewerUrl: `${base}#${padId}`,
    editorUrl: `${base}#${padId}:rw`
  }
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
