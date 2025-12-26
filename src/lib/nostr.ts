import { finalizeEvent, verifyEvent } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import type { Event } from 'nostr-tools/core'
import type { Filter } from 'nostr-tools/filter'
import { NOSTRPAD_KIND, D_TAG, BOOTSTRAP_RELAYS } from './constants'
import { encodeFixed } from './encoding'
import type { PadPayload } from './types'

const PAD_ID_LENGTH = 8

/**
 * Encode text content into a JSON payload with timestamp
 */
export function encodePayload(text: string): string {
  const payload: PadPayload = {
    text,
    timestamp: Date.now()
  }
  return JSON.stringify(payload)
}

/**
 * Decode content from an event, extracting text and timestamp
 */
export function decodePayload(content: string): PadPayload {
  return JSON.parse(content) as PadPayload
}

/**
 * Create a signed pad event
 */
export function createPadEvent(text: string, secretKey: Uint8Array): Event {
  const event = finalizeEvent({
    kind: NOSTRPAD_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', D_TAG],
      ['client', 'nostrpad']
    ],
    content: encodePayload(text)
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
 * Get padId from a public key
 */
export function getPadIdFromPubkey(publicKey: string): string {
  const pubkeyBytes = hexToBytes(publicKey)
  return encodeFixed(pubkeyBytes.slice(0, 6), PAD_ID_LENGTH)
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
