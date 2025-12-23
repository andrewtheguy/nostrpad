import { useState, useEffect, useCallback, useRef } from 'react'
import { SimplePool } from 'nostr-tools/pool'
import { BOOTSTRAP_RELAYS, CANDIDATE_RELAYS } from '../lib/constants'
import {
  fetchPadRelayList,
  selectBestRelays,
  publishRelayList,
  getCachedRelays,
  cacheRelays
} from '../lib/relayDiscovery'

export type RelaySource = 'discovered' | 'bootstrap' | 'cached'

export interface UseRelayDiscoveryOptions {
  padId: string
  publicKey: string
  secretKey: Uint8Array | null
  isEditor: boolean
}

export interface UseRelayDiscoveryReturn {
  relays: string[]
  relaySource: RelaySource
  isDiscovering: boolean
  initializeRelays: () => Promise<void>
}

export function useRelayDiscovery({
  padId,
  publicKey,
  secretKey,
  isEditor
}: UseRelayDiscoveryOptions): UseRelayDiscoveryReturn {
  const [relays, setRelays] = useState<string[]>(BOOTSTRAP_RELAYS)
  const [relaySource, setRelaySource] = useState<RelaySource>('bootstrap')
  const [isDiscovering, setIsDiscovering] = useState(true)
  const initializedRef = useRef(false)
  const poolRef = useRef<SimplePool | null>(null)

  const initializeRelays = useCallback(async () => {
    if (initializedRef.current) return
    initializedRef.current = true
    setIsDiscovering(true)

    // Create pool for discovery
    const pool = new SimplePool()
    poolRef.current = pool

    try {
      // Step 1: Check cache first
      const cachedRelays = getCachedRelays(padId)
      if (cachedRelays && cachedRelays.length > 0) {
        setRelays(cachedRelays)
        setRelaySource('cached')
        setIsDiscovering(false)
        return
      }

      if (isEditor && secretKey) {
        // Editor mode: discover best relays and publish relay list
        const bestRelays = await selectBestRelays(CANDIDATE_RELAYS)

        if (bestRelays.length > 0) {
          setRelays(bestRelays)
          setRelaySource('discovered')
          cacheRelays(padId, bestRelays)

          // Publish relay list to bootstrap relays
          await publishRelayList(pool, bestRelays, secretKey)
        } else {
          // Fallback to bootstrap if no relays available
          setRelays(BOOTSTRAP_RELAYS)
          setRelaySource('bootstrap')
        }
      } else if (publicKey) {
        // Viewer mode: fetch relay list from bootstrap relays
        const discoveredRelays = await fetchPadRelayList(pool, publicKey)

        if (discoveredRelays && discoveredRelays.length > 0) {
          setRelays(discoveredRelays)
          setRelaySource('discovered')
          cacheRelays(padId, discoveredRelays)
        } else {
          // Fallback to bootstrap relays
          setRelays(BOOTSTRAP_RELAYS)
          setRelaySource('bootstrap')
        }
      }
    } catch (error) {
      console.error('Relay discovery failed:', error)
      // Fallback to bootstrap relays
      setRelays(BOOTSTRAP_RELAYS)
      setRelaySource('bootstrap')
    } finally {
      setIsDiscovering(false)
      // Close the discovery pool
      if (poolRef.current) {
        poolRef.current.close(BOOTSTRAP_RELAYS)
        poolRef.current = null
      }
    }
  }, [padId, publicKey, secretKey, isEditor])

  useEffect(() => {
    initializeRelays()

    return () => {
      if (poolRef.current) {
        poolRef.current.close(BOOTSTRAP_RELAYS)
      }
    }
  }, [initializeRelays])

  return {
    relays,
    relaySource,
    isDiscovering,
    initializeRelays
  }
}
