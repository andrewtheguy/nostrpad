import { SimplePool } from 'nostr-tools/pool'
import { finalizeEvent } from 'nostr-tools/pure'
import type { Event } from 'nostr-tools/core'
import type { Filter } from 'nostr-tools/filter'
import {
  RELAY_LIST_KIND,
  BOOTSTRAP_RELAYS,
  TARGET_RELAY_COUNT,
  RELAY_PROBE_TIMEOUT,
  RELAY_CACHE_DURATION,
  RELAY_CACHE_KEY
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

interface RelayCache {
  padId: string
  relays: string[]
  timestamp: number
}

// ====== NIP-65 Event Creation ======

/**
 * Create a kind 10002 relay list event
 */
export function createRelayListEvent(
  relays: RelayInfo[],
  secretKey: Uint8Array
): Event {
  const tags = relays.map(relay => {
    if (relay.read && relay.write) {
      return ['r', relay.url]
    } else if (relay.read) {
      return ['r', relay.url, 'read']
    } else {
      return ['r', relay.url, 'write']
    }
  })

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
 * Create filter to fetch relay list for a pubkey
 */
export function createRelayListFilter(publicKey: string): Filter {
  return {
    kinds: [RELAY_LIST_KIND],
    authors: [publicKey],
    limit: 1
  }
}

// ====== Relay Probing ======

/**
 * Probe a single relay to check availability and response time
 */
export async function probeRelay(url: string): Promise<RelayProbeResult> {
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
  const results = await Promise.all(urls.map(probeRelay))
  return results
    .filter(r => r.available)
    .sort((a, b) => a.responseTime - b.responseTime)
}

/**
 * Select best relays from candidates
 */
export async function selectBestRelays(candidateUrls: string[]): Promise<string[]> {
  const probeResults = await probeRelays(candidateUrls)
  return probeResults
    .slice(0, TARGET_RELAY_COUNT)
    .map(r => r.url)
}

// ====== Relay List Fetching ======

/**
 * Fetch the relay list for a pad's pubkey from bootstrap relays
 */
export async function fetchPadRelayList(
  pool: SimplePool,
  publicKey: string
): Promise<string[] | null> {
  const filter = createRelayListFilter(publicKey)

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

// ====== Publishing ======

/**
 * Publish relay list event to bootstrap relays
 */
export async function publishRelayList(
  pool: SimplePool,
  relays: string[],
  secretKey: Uint8Array
): Promise<void> {
  const relayInfos: RelayInfo[] = relays.map(url => ({
    url,
    read: true,
    write: true
  }))

  const event = createRelayListEvent(relayInfos, secretKey)

  // Publish to bootstrap relays so others can discover
  await Promise.allSettled(
    BOOTSTRAP_RELAYS.map(relay => pool.publish([relay], event))
  )
}

// ====== Caching ======

/**
 * Get cached relays for a pad
 */
export function getCachedRelays(padId: string): string[] | null {
  try {
    const cacheJson = localStorage.getItem(RELAY_CACHE_KEY)
    if (!cacheJson) return null

    const cache: Record<string, RelayCache> = JSON.parse(cacheJson)
    const entry = cache[padId]

    if (!entry) return null

    // Check if cache is still valid
    if (Date.now() - entry.timestamp > RELAY_CACHE_DURATION) {
      return null
    }

    return entry.relays
  } catch {
    return null
  }
}

/**
 * Cache relays for a pad
 */
export function cacheRelays(padId: string, relays: string[]): void {
  try {
    const cacheJson = localStorage.getItem(RELAY_CACHE_KEY)
    const cache: Record<string, RelayCache> = cacheJson ? JSON.parse(cacheJson) : {}

    cache[padId] = {
      padId,
      relays,
      timestamp: Date.now()
    }

    localStorage.setItem(RELAY_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Ignore cache errors
  }
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
