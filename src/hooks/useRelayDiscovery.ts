import { useState, useEffect, useCallback, useRef } from 'react'
import { BOOTSTRAP_RELAYS } from '../lib/constants'
import { probeRelaysSimple } from '../lib/relayDiscovery'

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

export function useRelayDiscovery(
  _options: UseRelayDiscoveryOptions
): UseRelayDiscoveryReturn {
  const [relays, setRelays] = useState<string[]>(BOOTSTRAP_RELAYS)
  const [relaySource, setRelaySource] = useState<RelaySource>('bootstrap')
  const [isDiscovering, setIsDiscovering] = useState(true)
  const initializedRef = useRef(false)

  const initializeRelays = useCallback(async () => {
    if (initializedRef.current) return
    initializedRef.current = true
    setIsDiscovering(true)

    try {
      // Simple probe - just check which bootstrap relays are reachable
      const available = await probeRelaysSimple(BOOTSTRAP_RELAYS)

      if (available.length > 0) {
        setRelays(available)
      }
      // Always use 'bootstrap' source since we're using bootstrap relays
      setRelaySource('bootstrap')
    } catch (error) {
      console.error('Relay probe failed:', error)
      // Fallback to all bootstrap relays
      setRelays(BOOTSTRAP_RELAYS)
      setRelaySource('bootstrap')
    } finally {
      setIsDiscovering(false)
    }
  }, [])

  useEffect(() => {
    initializeRelays()
  }, [initializeRelays])

  return {
    relays,
    relaySource,
    isDiscovering,
    initializeRelays
  }
}
