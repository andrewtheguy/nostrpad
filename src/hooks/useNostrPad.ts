import { useState, useCallback, useEffect, useRef } from 'react'
import { SimplePool } from 'nostr-tools/pool'
import type { Event } from 'nostr-tools/core'
import { useDebounce } from './useDebounce'
import { createPadEvent, createPadFilter, createPadIdSearchFilter, publishEvent, isValidPadEvent, getPadIdFromPubkey } from '../lib/nostr'
import { DEFAULT_RELAYS, DEBOUNCE_MS } from '../lib/constants'

interface UseNostrPadOptions {
  padId: string
  publicKey: string
  secretKey: Uint8Array | null
}

interface UseNostrPadReturn {
  content: string
  setContent: (content: string) => void
  connectedRelays: number
  totalRelays: number
  isSaving: boolean
  canEdit: boolean
  lastSaved: Date | null
  foundPublicKey: string | null
}

export function useNostrPad({ padId, publicKey, secretKey }: UseNostrPadOptions): UseNostrPadReturn {
  const [content, setContentState] = useState('')
  const [connectedRelays, setConnectedRelays] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [foundPublicKey, setFoundPublicKey] = useState<string | null>(publicKey || null)

  const poolRef = useRef<SimplePool | null>(null)
  const latestEventRef = useRef<Event | null>(null)
  const isLocalChangeRef = useRef(false)
  const pendingPublishRef = useRef(false)

  const canEdit = secretKey !== null
  const totalRelays = DEFAULT_RELAYS.length

  // Handle incoming events
  const handleEvent = useCallback((event: Event) => {
    if (!isValidPadEvent(event)) return

    // For view-only mode, check if this event's pubkey matches our padId
    if (!publicKey) {
      const eventPadId = getPadIdFromPubkey(event.pubkey)
      if (eventPadId !== padId) return
      setFoundPublicKey(event.pubkey)
    }

    // Only update if this is a newer event
    if (!latestEventRef.current || event.created_at > latestEventRef.current.created_at) {
      latestEventRef.current = event

      // Don't overwrite local changes that are being typed
      if (!isLocalChangeRef.current) {
        setContentState(event.content)
      }
    }
  }, [padId, publicKey])

  // Initialize pool and subscribe
  useEffect(() => {
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

    const sub = pool.subscribe(DEFAULT_RELAYS, filter, {
      onevent: handleEvent,
      oneose: () => {
        // Update connection count on EOSE
        const status = pool.listConnectionStatus()
        const connected = Array.from(status.values()).filter(Boolean).length
        setConnectedRelays(connected)
      }
    })

    // Poll connection status periodically
    const statusInterval = setInterval(() => {
      const status = pool.listConnectionStatus()
      const connected = Array.from(status.values()).filter(Boolean).length
      setConnectedRelays(connected)
    }, 2000)

    return () => {
      clearInterval(statusInterval)
      sub.close()
      pool.close(DEFAULT_RELAYS)
    }
  }, [publicKey, handleEvent])

  // Debounced content for publishing
  const debouncedContent = useDebounce(content, DEBOUNCE_MS)

  // Publish when debounced content changes
  useEffect(() => {
    if (!canEdit || !secretKey || connectedRelays === 0) return
    if (pendingPublishRef.current) return

    // Don't publish if content matches latest event
    if (latestEventRef.current && debouncedContent === latestEventRef.current.content) {
      isLocalChangeRef.current = false
      return
    }

    // Don't publish empty content on initial load
    if (!debouncedContent && !latestEventRef.current) return

    const doPublish = async () => {
      pendingPublishRef.current = true
      setIsSaving(true)

      try {
        const event = createPadEvent(debouncedContent, secretKey)
        const pool = poolRef.current
        if (pool) {
          await publishEvent(pool, event)
          latestEventRef.current = event
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
  }, [debouncedContent, canEdit, secretKey, connectedRelays])

  // Set content handler
  const setContent = useCallback((newContent: string) => {
    if (!canEdit) return
    isLocalChangeRef.current = true
    setContentState(newContent)
  }, [canEdit])

  return {
    content,
    setContent,
    connectedRelays,
    totalRelays,
    isSaving,
    canEdit,
    lastSaved,
    foundPublicKey
  }
}
