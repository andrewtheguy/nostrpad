import { useState, useEffect, useCallback, useRef } from 'react'
import { BOOTSTRAP_RELAYS } from '../lib/constants'
import { probeRelaysSimple } from '../lib/relayDiscovery'

export interface UseRelayDiscoveryReturn {
  relays: string[]
  isDiscovering: boolean
  initializeRelays: () => Promise<void>
}

export function useRelayDiscovery(): UseRelayDiscoveryReturn {
  const [relays, setRelays] = useState<string[]>(BOOTSTRAP_RELAYS)
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
    } catch (error) {
      console.error('Relay probe failed:', error)
      // Fallback to all bootstrap relays
      setRelays(BOOTSTRAP_RELAYS)
    } finally {
      setIsDiscovering(false)
    }
  }, [])

  useEffect(() => {
    initializeRelays()
  }, [initializeRelays])

  return {
    relays,
    isDiscovering,
    initializeRelays
  }
}
