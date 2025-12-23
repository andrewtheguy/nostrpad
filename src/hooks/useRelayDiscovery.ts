import { useState, useEffect, useCallback, useRef } from 'react'
import { SimplePool } from 'nostr-tools/pool'
import { BOOTSTRAP_RELAYS } from '../lib/constants'
import {
  fetchPadRelayList,
  selectBestRelays,
  probeRelays,
  publishRelayList
} from '../lib/relayDiscovery'

export type RelaySource = 'discovered' | 'bootstrap'

export interface UseRelayDiscoveryOptions {
  padId: string
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
      if (isEditor && secretKey) {
        // Editor mode: only discover if bootstrap relays are unavailable
        const bootstrapProbes = await probeRelays(BOOTSTRAP_RELAYS)
        if (bootstrapProbes.length > 0) {
          setRelays(BOOTSTRAP_RELAYS)
          setRelaySource('bootstrap')

          // Publish relay list to bootstrap relays with padId tag
          await publishRelayList(pool, BOOTSTRAP_RELAYS, padId, secretKey)
        } else {
          // Bootstrap failed, discover best relays and publish relay list
          const bestRelays = await selectBestRelays(pool, BOOTSTRAP_RELAYS)

          if (bestRelays.length > 0) {
            setRelays(bestRelays)
            setRelaySource('discovered')

            // Publish relay list to bootstrap relays with padId tag
            await publishRelayList(pool, bestRelays, padId, secretKey)
          } else {
            // Fallback to bootstrap if no relays available
            setRelays(BOOTSTRAP_RELAYS)
            setRelaySource('bootstrap')
          }
        }
      } else {
        // Viewer mode: fetch relay list from bootstrap relays using padId tag
        // This works even without the full pubkey (like secure-send-web's PIN hint)
        const discoveredRelays = await fetchPadRelayList(pool, padId)

        if (discoveredRelays && discoveredRelays.length > 0) {
          // Always include bootstrap relays for redundancy
          const allRelays = [...new Set([...discoveredRelays, ...BOOTSTRAP_RELAYS])]
          setRelays(allRelays)
          setRelaySource('discovered')
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
  }, [padId, secretKey, isEditor])

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
