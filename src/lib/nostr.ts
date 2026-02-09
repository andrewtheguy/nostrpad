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

const PAIR_WIRE_VERSION = 0x01

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
 * @param event The event to verify
 * @param padId Optional padId to validate the 'd' tag value against
 */
export function isValidLogoutEvent(event: Event, padId?: string): boolean {
  const hasValidDTag = padId
    ? event.tags.some(t => t[0] === 'd' && t[1] === padId)
    : event.tags.some(t => t[0] === 'd' && t[1])

  return (
    event.kind === 21000 &&
    hasValidDTag &&
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

/**
 * Encode text content into an AES-GCM encrypted payload for pair mode.
 * Wire format: base64( 0x01 || IV[12] || AES-GCM-ciphertext-with-tag )
 */
export async function encodePairPayload(text: string, contentKey: CryptoKey): Promise<string> {
  const payload: PadPayload = { text, timestamp: Date.now() }
  const plaintext = new TextEncoder().encode(JSON.stringify(payload))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, contentKey, plaintext))
  const buf = new Uint8Array(1 + iv.length + ciphertext.length)
  buf[0] = PAIR_WIRE_VERSION
  buf.set(iv, 1)
  buf.set(ciphertext, 1 + iv.length)
  return uint8ToBase64(buf)
}

/**
 * Decode an AES-GCM encrypted payload from pair mode.
 */
export async function decodePairPayload(content: string, contentKey: CryptoKey): Promise<PadPayload | null> {
  try {
    const buf = base64ToUint8(content)
    if (buf.length < 1 + 12 + 16 || buf[0] !== PAIR_WIRE_VERSION) return null
    const iv = buf.slice(1, 13)
    const ciphertext = buf.slice(13)
    const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, contentKey, ciphertext))
    return JSON.parse(new TextDecoder().decode(plaintext)) as PadPayload
  } catch {
    return null
  }
}

/**
 * Create a signed pad event using AES-GCM encryption for pair mode.
 */
export async function createPairPadEvent(text: string, contentKey: CryptoKey, secretKey: Uint8Array): Promise<Event> {
  const content = await encodePairPayload(text, contentKey)
  return finalizeEvent({
    kind: NOSTRPAD_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', D_TAG],
      ['client', 'nostrpad']
    ],
    content
  }, secretKey)
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// Helper
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}
