import { finalizeEvent, verifyEvent } from 'nostr-tools/pure'
import { encrypt as nip44Encrypt, decrypt as nip44Decrypt } from 'nostr-tools/nip44'
import { sha256 } from '@noble/hashes/sha256'
import { utf8ToBytes } from '@noble/hashes/utils'
import { SimplePool } from 'nostr-tools/pool'
import type { Event } from 'nostr-tools/core'
import type { Filter } from 'nostr-tools/filter'
import { NOSTRPAD_KIND, D_TAG, BOOTSTRAP_RELAYS, PAD_ID_BYTES, PAD_ID_LENGTH } from './constants'
import { encodeFixed } from './encoding'
import type { PadPayload } from './types'

function deriveConversationKeyFromPadId(padId: string): Uint8Array {
  // Deterministic key so anyone with the padId can decrypt.
  return sha256(utf8ToBytes(`nostrpad:${padId}`))
}

/**
 * Encode text content into an encrypted JSON payload with timestamp
 */
export function encodePayload(text: string, padId: string): string {
  const payload: PadPayload = {
    text,
    timestamp: Date.now()
  }
  const plaintext = JSON.stringify(payload)
  return nip44Encrypt(plaintext, deriveConversationKeyFromPadId(padId))
}

/**
 * Decode and decrypt content from an event, extracting text and timestamp
 */
export function decodePayload(content: string, padId: string): PadPayload | null {
  try {
    const plaintext = nip44Decrypt(content, deriveConversationKeyFromPadId(padId))
    return JSON.parse(plaintext) as PadPayload
  } catch (error) {
    console.warn('Failed to decode payload:', error)
    return null
  }
}

/**
 * Create a signed pad event
 */
export function createPadEvent(text: string, padId: string, secretKey: Uint8Array): Event {
  const event = finalizeEvent({
    kind: NOSTRPAD_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', D_TAG],
      ['client', 'nostrpad']
    ],
    content: encodePayload(text, padId)
  }, secretKey)

  return event
}

/**
 * Verify a pad event
 */
export function isValidPadEvent(event: Event): boolean {
  return (
    event.kind === NOSTRPAD_KIND &&
    event.tags.some(t => t[0] === 'd' && t[1] === D_TAG) &&
    verifyEvent(event)
  )
}

/**
 * Create a logout event (ephemeral)
 */
export function createLogoutEvent(padId: string, secretKey: Uint8Array): Event {
  return finalizeEvent({
    kind: 21000,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', padId],
      ['client', 'nostrpad']
    ],
    content: 'logout'
  }, secretKey)
}

/**
 * Verify a logout event
 */
export function isValidLogoutEvent(event: Event): boolean {
  return (
    event.kind === 21000 &&
    event.tags.some(t => t[0] === 'd') &&
    verifyEvent(event)
  )
}

/**
 * Get padId from a public key
 */
export function getPadIdFromPubkey(publicKey: string): string {
  const pubkeyBytes = hexToBytes(publicKey)
  return encodeFixed(pubkeyBytes.slice(0, PAD_ID_BYTES), PAD_ID_LENGTH)
}

/**
 * Create a filter for subscribing to a pad by pubkey
 */
export function createPadFilter(publicKey: string): Filter {
  return {
    kinds: [NOSTRPAD_KIND],
    authors: [publicKey],
    '#d': [D_TAG]
  }
}

/**
 * Create a filter to find pads matching a padId (partial pubkey search)
 * This is used for view-only mode where we don't have the full pubkey
 */
export function createPadIdSearchFilter(): Filter {
  return {
    kinds: [NOSTRPAD_KIND],
    '#d': [D_TAG],
    limit: 100
  }
}

/**
 * Publish event to relays
 */
export async function publishEvent(
  pool: SimplePool,
  event: Event,
  relays: string[] = BOOTSTRAP_RELAYS
): Promise<string[]> {
  const successRelays: string[] = []

  const promises = relays.map(async (relay) => {
    try {
      await pool.publish([relay], event)
      successRelays.push(relay)
    } catch (error) {
      console.warn(`Failed to publish to ${relay}:`, error)
    }
  })

  await Promise.allSettled(promises)
  return successRelays
}

// Helper
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}
