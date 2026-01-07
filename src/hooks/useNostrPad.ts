import { useState, useCallback, useEffect, useRef } from 'react'
import { SimplePool } from 'nostr-tools/pool'
import type { Event } from 'nostr-tools/core'
import { useDebounce } from './useDebounce'
import { useRelayDiscovery } from './useRelayDiscovery'
import { createPadEvent, createPadIdSearchFilter, publishEvent, isValidPadEvent, getPadIdFromPubkey, decodePayload } from '../lib/nostr'
import { DEBOUNCE_MS } from '../lib/constants'

interface UseNostrPadOptions {
  padId: string
  publicKey: string
  secretKey: Uint8Array | null
}

interface UseNostrPadReturn {
  content: string
  setContent: (content: string) => void
  relayStatus: Map<string, boolean>
  activeRelays: string[]
  isSaving: boolean
  canEdit: boolean
  lastSaved: Date | null
  foundPublicKey: string | null
  isDiscovering: boolean
}

export function useNostrPad({ padId, publicKey, secretKey }: UseNostrPadOptions): UseNostrPadReturn {
  const [content, setContentState] = useState('')
  const [relayStatus, setRelayStatus] = useState<Map<string, boolean>>(new Map())
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [foundPublicKey, setFoundPublicKey] = useState<string | null>(publicKey || null)

  const poolRef = useRef<SimplePool | null>(null)
  const latestEventRef = useRef<Event | null>(null)
  const latestTimestampRef = useRef<number>(0)
  const latestTextRef = useRef<string>('')
  const isLocalChangeRef = useRef(false)
  const pendingPublishRef = useRef(false)

  const canEdit = secretKey !== null
  const storageKey = `nostrpad:${padId}`

  // Use relay discovery
  const {
    relays: activeRelays,
    isDiscovering
  } = useRelayDiscovery()

  // Handle incoming events
  const handleEvent = useCallback((event: Event) => {
    if (!isValidPadEvent(event)) return

    // For view-only mode, check if this event's pubkey matches our padId
    if (!publicKey) {
      const eventPadId = getPadIdFromPubkey(event.pubkey)
      if (eventPadId !== padId) return
      setFoundPublicKey(event.pubkey)
    }

    // Decode the payload to get text and timestamp
    const payload = decodePayload(event.content, padId)
    if (!payload) return

    // Only update if this is a newer event (compare embedded timestamps)
    if (payload.timestamp > latestTimestampRef.current) {
      latestEventRef.current = event
      latestTimestampRef.current = payload.timestamp
      latestTextRef.current = payload.text

      // Don't overwrite local changes that are being typed
      if (!isLocalChangeRef.current) {
        setContentState(payload.text)
      }
    }
  }, [padId, publicKey])

  // Reset state and refs when padId changes
  useEffect(() => {
    setContentState('')
    setFoundPublicKey(publicKey || null)
    setLastSaved(null)
    latestEventRef.current = null
    latestTimestampRef.current = 0
    latestTextRef.current = ''
    isLocalChangeRef.current = false
    pendingPublishRef.current = false
  }, [padId, publicKey])

  // Load content from session storage on init (editor mode only)
  useEffect(() => {
    if (!canEdit) return
    const saved = sessionStorage.getItem(storageKey)
    if (saved) {
      setContentState(saved)
      latestTextRef.current = saved
    }
  }, [canEdit, storageKey])

  // Save to session storage on content change (editor mode only)
  useEffect(() => {
    if (!canEdit) return
    sessionStorage.setItem(storageKey, content)
  }, [canEdit, content, storageKey])

  // Initialize pool for editor mode (publish-only, no subscription)
  useEffect(() => {
    if (isDiscovering || activeRelays.length === 0) return
    if (!canEdit) return

    const pool = new SimplePool()
    poolRef.current = pool

    // Ensure connections are established to all relays
    activeRelays.forEach(relay => {
      pool.ensureRelay(relay)
    })

    // Poll connection status periodically
    const statusInterval = setInterval(() => {
      const status = pool.listConnectionStatus()
      setRelayStatus(new Map(status))
    }, 2000)

    return () => {
      clearInterval(statusInterval)
      pool.close(activeRelays)
    }
  }, [canEdit, activeRelays, isDiscovering])

  // Initialize pool and subscribe for view-only mode
  useEffect(() => {
    if (isDiscovering || activeRelays.length === 0) return
    if (canEdit) return

    const pool = new SimplePool()
    poolRef.current = pool

    const filter = createPadIdSearchFilter()

    const sub = pool.subscribe(activeRelays, filter, {
      onevent: handleEvent,
      oneose: () => {
        setRelayStatus(new Map(pool.listConnectionStatus()))
      }
    })

    const statusInterval = setInterval(() => {
      const status = pool.listConnectionStatus()
      setRelayStatus(new Map(status))
    }, 2000)

    return () => {
      clearInterval(statusInterval)
      sub.close()
      pool.close(activeRelays)
    }
  }, [canEdit, handleEvent, activeRelays, isDiscovering])

  // Debounced content for publishing
  const debouncedContent = useDebounce(content, DEBOUNCE_MS)

  const connectedCount = Array.from(relayStatus.values()).filter(Boolean).length

  // Publish when debounced content changes
  useEffect(() => {
    if (!canEdit || !secretKey || connectedCount === 0 || isDiscovering) return
    if (pendingPublishRef.current) return

    // Don't publish if content matches latest text and we already have a known event
    if (debouncedContent === latestTextRef.current && latestTimestampRef.current > 0) {
      isLocalChangeRef.current = false
      return
    }

    // Don't publish empty content on initial load
    if (!debouncedContent && latestTimestampRef.current === 0) return

    const doPublish = async () => {
      pendingPublishRef.current = true
      setIsSaving(true)

      try {
        const event = createPadEvent(debouncedContent, padId, secretKey)
        const pool = poolRef.current
        if (pool) {
          // Use discovered relays
          await publishEvent(pool, event, activeRelays)
          latestEventRef.current = event
          // Update timestamp and text refs from the published event
          const payload = decodePayload(event.content, padId)
          if (payload) {
            latestTimestampRef.current = payload.timestamp
            latestTextRef.current = payload.text
          } else {
            // decodePayload already handles errors; log context to avoid conflating with publish failures
            console.warn(`Failed to decode payload for event ${event.id} (padId: ${padId})`)
          }
          setLastSaved(new Date())
        }
      } catch (error) {
        console.error('Failed to publish:', error)
      } finally {
        setIsSaving(false)
        isLocalChangeRef.current = false
        pendingPublishRef.current = false
      }
    }

    doPublish()
  }, [debouncedContent, canEdit, secretKey, connectedCount, activeRelays, isDiscovering, padId])

  // Set content handler
  const setContent = useCallback((newContent: string) => {
    if (!canEdit) return
    isLocalChangeRef.current = true
    setContentState(newContent)
  }, [canEdit])

  return {
    content,
    setContent,
    relayStatus,
    activeRelays,
    isSaving,
    canEdit,
    lastSaved,
    foundPublicKey,
    isDiscovering
  }
}
