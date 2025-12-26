import { useState, useCallback, useEffect, useRef } from 'react'
import { SimplePool } from 'nostr-tools/pool'
import type { Event } from 'nostr-tools/core'
import { useDebounce } from './useDebounce'
import { useRelayDiscovery } from './useRelayDiscovery'
import { createPadEvent, createPadFilter, createPadIdSearchFilter, publishEvent, isValidPadEvent, getPadIdFromPubkey, decodePayload } from '../lib/nostr'
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
    const payload = decodePayload(event.content)

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

  // Initialize pool and subscribe after relay discovery
  useEffect(() => {
    // Wait for relay discovery to complete
    if (isDiscovering || activeRelays.length === 0) return

    const pool = new SimplePool()
    poolRef.current = pool

    let filter
    if (publicKey) {
      // We have the full public key (editor mode)
      filter = createPadFilter(publicKey)
    } else {
      // View-only mode - search for matching padId
      filter = createPadIdSearchFilter()
    }

    const sub = pool.subscribe(activeRelays, filter, {
      onevent: handleEvent,
      oneose: () => {
        // Update connection status on EOSE
        setRelayStatus(new Map(pool.listConnectionStatus()))
      }
    })

    // Poll connection status periodically
    const statusInterval = setInterval(() => {
      const status = pool.listConnectionStatus()
      setRelayStatus(new Map(status))
    }, 2000)

    return () => {
      clearInterval(statusInterval)
      sub.close()
      pool.close(activeRelays)
    }
  }, [publicKey, handleEvent, activeRelays, isDiscovering])

  // Debounced content for publishing
  const debouncedContent = useDebounce(content, DEBOUNCE_MS)

  const connectedCount = Array.from(relayStatus.values()).filter(Boolean).length

  // Publish when debounced content changes
  useEffect(() => {
    if (!canEdit || !secretKey || connectedCount === 0 || isDiscovering) return
    if (pendingPublishRef.current) return

    // Don't publish if content matches latest text
    if (debouncedContent === latestTextRef.current) {
      isLocalChangeRef.current = false
      return
    }

    // Don't publish empty content on initial load
    if (!debouncedContent && latestTimestampRef.current === 0) return

    const doPublish = async () => {
      pendingPublishRef.current = true
      setIsSaving(true)

      try {
        const event = createPadEvent(debouncedContent, secretKey)
        const pool = poolRef.current
        if (pool) {
          // Use discovered relays
          await publishEvent(pool, event, activeRelays)
          latestEventRef.current = event
          // Update timestamp and text refs from the published event
          const payload = decodePayload(event.content)
          latestTimestampRef.current = payload.timestamp
          latestTextRef.current = payload.text
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
  }, [debouncedContent, canEdit, secretKey, connectedCount, activeRelays, isDiscovering])

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
