import { SimplePool } from 'nostr-tools/pool'
import { finalizeEvent } from 'nostr-tools/pure'
import type { Event } from 'nostr-tools/core'
import type { Filter } from 'nostr-tools/filter'
import {
  RELAY_LIST_KIND,
  RELAY_DISCOVERY_KIND,
  BOOTSTRAP_RELAYS,
  TARGET_RELAY_COUNT,
  RELAY_PROBE_TIMEOUT,
  RELAY_DISCOVERY_TIMEOUT,
  RELAY_INFO_TIMEOUT,
  MAX_RELAYS_TO_PROBE,
  MIN_MESSAGE_LENGTH,
  MIN_CONTENT_LENGTH
} from './constants'

// Types
export interface RelayInfo {
  url: string
  read: boolean
  write: boolean
}

export interface RelayProbeResult {
  url: string
  responseTime: number
  available: boolean
}

interface RelayInformationDocument {
  limitation?: {
    max_message_length?: number
    max_content_length?: number
    payment_required?: boolean
    auth_required?: boolean
  }
}

// ====== Relay Exchange Event Creation ======

/**
 * Create a kind 10002 relay list event with padId tag for discovery
 * Similar to secure-send-web's PIN hint approach
 */
export function createRelayListEvent(
  relays: RelayInfo[],
  padId: string,
  secretKey: Uint8Array
): Event {
  const tags: string[][] = [
    ['d', `nostrpad:${padId}`],  // Makes it replaceable per pad
    ['p', padId]                  // Tag for easy lookup by padId
  ]

  // Add relay tags
  for (const relay of relays) {
    if (relay.read && relay.write) {
      tags.push(['r', relay.url])
    } else if (relay.read) {
      tags.push(['r', relay.url, 'read'])
    } else {
      tags.push(['r', relay.url, 'write'])
    }
  }

  return finalizeEvent({
    kind: RELAY_LIST_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: ''
  }, secretKey)
}

/**
 * Parse relay list from a kind 10002 event
 */
export function parseRelayListEvent(event: Event): RelayInfo[] {
  if (event.kind !== RELAY_LIST_KIND) return []

  return event.tags
    .filter(tag => tag[0] === 'r' && tag[1])
    .map(tag => {
      const marker = tag[2]?.toLowerCase()
      return {
        url: tag[1],
        read: !marker || marker === 'read',
        write: !marker || marker === 'write'
      }
    })
}

/**
 * Create filter to fetch relay list by padId tag
 * This allows discovery without knowing the full pubkey
 */
export function createRelayListFilter(padId: string): Filter {
  return {
    kinds: [RELAY_LIST_KIND],
    '#d': [`nostrpad:${padId}`],
    limit: 1
  }
}

function createRelayListFallbackFilter(padId: string): Filter {
  return {
    kinds: [RELAY_LIST_KIND],
    '#p': [padId],
    limit: 1
  }
}

function normalizeRelayUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

function relayHttpUrl(url: string): string {
  return url
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://')
}

async function fetchRelayInfo(url: string): Promise<RelayInformationDocument | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), RELAY_INFO_TIMEOUT)

  try {
    const response = await fetch(relayHttpUrl(url), {
      method: 'GET',
      headers: { Accept: 'application/nostr+json' },
      signal: controller.signal
    })

    if (!response.ok) return null
    const json = await response.json()
    return json as RelayInformationDocument
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function isRelaySuitable(info: RelayInformationDocument): boolean {
  const limitation = info.limitation
  if (!limitation) return true

  if (limitation.payment_required === true) return false
  if (limitation.auth_required === true) return false

  if (typeof limitation.max_message_length === 'number' && limitation.max_message_length < MIN_MESSAGE_LENGTH) {
    return false
  }

  if (typeof limitation.max_content_length === 'number' && limitation.max_content_length < MIN_CONTENT_LENGTH) {
    return false
  }

  return true
}

// ====== Relay Probing ======

/**
 * Probe a single relay to check availability and response time
 */
export async function probeRelay(url: string): Promise<RelayProbeResult> {
  const info = await fetchRelayInfo(url)
  if (info && !isRelaySuitable(info)) {
    return { url, responseTime: Infinity, available: false }
  }

  const start = Date.now()

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ url, responseTime: Infinity, available: false })
    }, RELAY_PROBE_TIMEOUT)

    try {
      const ws = new WebSocket(url)

      ws.onopen = () => {
        clearTimeout(timeout)
        const responseTime = Date.now() - start
        ws.close()
        resolve({ url, responseTime, available: true })
      }

      ws.onerror = () => {
        clearTimeout(timeout)
        resolve({ url, responseTime: Infinity, available: false })
      }
    } catch {
      clearTimeout(timeout)
      resolve({ url, responseTime: Infinity, available: false })
    }
  })
}

/**
 * Probe multiple relays and return sorted by response time
 */
export async function probeRelays(urls: string[]): Promise<RelayProbeResult[]> {
  return new Promise((resolve) => {
    const results: RelayProbeResult[] = []
    let completed = 0
    let resolved = false

    const tryResolve = () => {
      if (resolved) return
      const available = results.filter(r => r.available)
      if (available.length >= TARGET_RELAY_COUNT || completed === urls.length) {
        resolved = true
        resolve(available.sort((a, b) => a.responseTime - b.responseTime))
      }
    }

    urls.forEach((url) => {
      probeRelay(url)
        .then((result) => {
          results.push(result)
        })
        .catch(() => {
          results.push({ url, responseTime: Infinity, available: false })
        })
        .finally(() => {
          completed += 1
          tryResolve()
        })
    })
  })
}

/**
 * Select best relays from candidates
 */
export async function selectBestRelays(
  pool: SimplePool,
  seedRelays: string[]
): Promise<string[]> {
  const discoveredRelays = await discoverRelaysFromSeeds(pool, seedRelays)
  const relaysToProbe = discoveredRelays.slice(0, MAX_RELAYS_TO_PROBE)
  const probeResults = await probeRelays(relaysToProbe)
  return probeResults.slice(0, TARGET_RELAY_COUNT).map(r => r.url)
}

// ====== Relay Discovery ======

async function fetchEventsFromRelays(
  pool: SimplePool,
  relays: string[],
  filter: Filter,
  timeoutMs: number
): Promise<Event[]> {
  return new Promise((resolve) => {
    const events: Event[] = []
    const sub = pool.subscribe(relays, filter, {
      onevent: (event) => {
        events.push(event)
      },
      oneose: () => {
        // Wait for timeout to maximize relay coverage
      }
    })

    const timeout = setTimeout(() => {
      sub.close()
      resolve(events)
    }, timeoutMs)

  })
}

function extractRelayFromNip66(event: Event): string | null {
  const tag = event.tags.find(t => t[0] === 'd' && typeof t[1] === 'string')
  const url = tag?.[1]
  if (!url) return null
  if (url.startsWith('wss://') || url.startsWith('ws://')) return url
  return null
}

function extractRelaysFromNip65(event: Event): string[] {
  return parseRelayListEvent(event).map(r => r.url)
}

async function discoverRelaysFromSeeds(
  pool: SimplePool,
  seedRelays: string[]
): Promise<string[]> {
  const discovered = new Set(seedRelays.map(normalizeRelayUrl))

  const nip66Events = await fetchEventsFromRelays(
    pool,
    seedRelays,
    { kinds: [RELAY_DISCOVERY_KIND], limit: 100 },
    RELAY_DISCOVERY_TIMEOUT
  )

  for (const event of nip66Events) {
    const relayUrl = extractRelayFromNip66(event)
    if (relayUrl) discovered.add(normalizeRelayUrl(relayUrl))
  }

  const nip65Events = await fetchEventsFromRelays(
    pool,
    seedRelays,
    { kinds: [RELAY_LIST_KIND], limit: 100 },
    RELAY_DISCOVERY_TIMEOUT
  )

  for (const event of nip65Events) {
    for (const relayUrl of extractRelaysFromNip65(event)) {
      discovered.add(normalizeRelayUrl(relayUrl))
    }
  }

  return [...discovered]
}

// ====== Relay List Fetching ======

/**
 * Fetch the relay list for a pad from bootstrap relays using padId tag
 * Similar to secure-send-web's PIN hint discovery
 */
export async function fetchPadRelayList(
  pool: SimplePool,
  padId: string
): Promise<string[] | null> {
  const tryFilter = (filter: Filter): Promise<string[] | null> => {
    return new Promise((resolve) => {
      let found = false
      const timeout = setTimeout(() => {
        if (!found) {
          sub.close()
          resolve(null)
        }
      }, RELAY_PROBE_TIMEOUT)

      const sub = pool.subscribe(BOOTSTRAP_RELAYS, filter, {
        onevent: (event) => {
          if (!found && event.kind === RELAY_LIST_KIND) {
            found = true
            clearTimeout(timeout)
            sub.close()
            const relays = parseRelayListEvent(event)
            resolve(relays.filter(r => r.read).map(r => r.url))
          }
        },
        oneose: () => {
          // Wait for timeout to handle resolution
        }
      })
    })
  }

  const primary = await tryFilter(createRelayListFilter(padId))
  if (primary && primary.length > 0) return primary

  return await tryFilter(createRelayListFallbackFilter(padId))
}

// ====== Publishing ======

/**
 * Publish relay list event to bootstrap relays
 * Includes padId tag for easy discovery by viewers
 */
export async function publishRelayList(
  pool: SimplePool,
  relays: string[],
  padId: string,
  secretKey: Uint8Array
): Promise<void> {
  const relayInfos: RelayInfo[] = relays.map(url => ({
    url,
    read: true,
    write: true
  }))

  const event = createRelayListEvent(relayInfos, padId, secretKey)

  // Publish to bootstrap relays so others can discover
  await Promise.allSettled(
    BOOTSTRAP_RELAYS.map(relay => pool.publish([relay], event))
  )
}


/**
 * Clear cached relays for a pad
 */
export function clearCachedRelays(padId: string): void {
  try {
    const cacheJson = localStorage.getItem(RELAY_CACHE_KEY)
    if (!cacheJson) return

    const cache: Record<string, RelayCache> = JSON.parse(cacheJson)
    delete cache[padId]

    localStorage.setItem(RELAY_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Ignore cache errors
  }
}
