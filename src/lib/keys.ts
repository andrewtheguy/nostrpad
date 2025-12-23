import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { encode, decode, encodeFixed } from './encoding'

const PAD_ID_LENGTH = 8

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

  // padId is derived from first 6 bytes of pubkey (for short URL)
  const pubkeyBytes = hexToBytes(publicKey)
  const padId = encodeFixed(pubkeyBytes.slice(0, 6), PAD_ID_LENGTH)

  // secret is the full secret key encoded
  const secret = encode(secretKey)

  return { padId, secret, secretKey, publicKey }
}

/**
 * Parse hash URL into padId and optional secret
 * Formats: #padId or #padId:secret
 */
export function parseUrl(hash: string): ParsedUrl {
  // Remove leading # if present
  const cleanHash = hash.startsWith('#') ? hash.slice(1) : hash

  if (!cleanHash) {
    return { padId: null, secret: null }
  }

  const colonIndex = cleanHash.indexOf(':')

  if (colonIndex === -1) {
    // View-only URL: just padId
    return { padId: cleanHash, secret: null }
  }

  // Editor URL: padId:secret
  const padId = cleanHash.slice(0, colonIndex)
  const secret = cleanHash.slice(colonIndex + 1)

  return { padId, secret }
}

/**
 * Derive keys from URL parts
 * Returns null if derivation fails
 */
export function deriveKeys(padId: string, secret: string | null): { secretKey: Uint8Array | null, publicKey: string } | null {
  try {
    if (secret) {
      // We have the secret key, derive everything from it
      const secretKey = decode(secret)
      if (secretKey.length !== 32) {
        return null
      }
      const publicKey = getPublicKey(secretKey)

      // Verify padId matches (first 6 bytes of pubkey)
      const pubkeyBytes = hexToBytes(publicKey)
      const expectedPadId = encodeFixed(pubkeyBytes.slice(0, 6), PAD_ID_LENGTH)

      if (expectedPadId !== padId) {
        console.warn('PadId mismatch - URL may be tampered')
        // Still allow it to work, as padId is just for display
      }

      return { secretKey, publicKey }
    } else {
      // View-only mode: we only have padId (partial pubkey)
      // We can't derive the full pubkey from partial, so we need to
      // store the full pubkey somewhere or query relays
      // For now, we'll query relays to find events matching this padId
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
export function generateShareUrls(padId: string, secret: string): { viewerUrl: string, editorUrl: string } {
  const base = window.location.origin + window.location.pathname
  return {
    viewerUrl: `${base}#${padId}`,
    editorUrl: `${base}#${padId}:${secret}`
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
