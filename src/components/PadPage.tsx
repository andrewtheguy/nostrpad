import { useState, useEffect, useRef, useCallback } from 'react'
import { deriveKeys } from '../lib/keys'
import { useNostrPad } from '../hooks/useNostrPad'
import { getVerifiedStoredSession, clearSession } from '../lib/sessionStorage'
import { Header } from './Header'
import { Editor } from './Editor'
import { Footer } from './Footer'

interface PadPageProps {
  padId: string
  isEdit: boolean
}

export function PadPage({ padId, isEdit }: PadPageProps) {
  const [keys, setKeys] = useState<{ secretKey: Uint8Array | null, publicKey: string, sessionCreatedAt?: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [editModeFailed, setEditModeFailed] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [hasMatchingSession, setHasMatchingSession] = useState(false)
  const [isMultiTabBlocked, setIsMultiTabBlocked] = useState(false)
  const isMountedRef = useRef(true)

  const handleLogout = useCallback(async () => {
    // Check if the stored session is actually the one we are using
    // If the stored session is newer, it means we are on the same device and another tab updated it
    // In that case, we should NOT clear it.
    try {
      const stored = await getVerifiedStoredSession()
      const storedCreatedAt = stored?.session.createdAt || 0
      const currentCreatedAt = keys?.sessionCreatedAt || 0

      if (storedCreatedAt > currentCreatedAt) {
        console.log('Skipping logout/clear: Stored session is newer (Same device update)')
        return
      }
    } catch (e) {
      console.warn('Failed to verify session during logout check', e)
    }

    alert('Session invalidated: This pad was opened in editor mode on another device.')
    await clearSession()
    window.location.hash = padId
    window.location.reload()
  }, [padId, keys])

  const {
    content,
    setContent,
    relayStatus,
    activeRelays,
    isSaving,
    canEdit,
    lastSaved,
    isDiscovering,
    isLoadingContent
  } = useNostrPad({
    padId,
    publicKey: keys?.publicKey || '',
    secretKey: keys?.secretKey || null,
    sessionCreatedAt: keys?.sessionCreatedAt,
    onLogoutSignal: handleLogout,
    isBlocked: isMultiTabBlocked
  })

  // Enforce single-tab editor
  useEffect(() => {
    if (!canEdit || !padId) return

    const channelName = `nostrpad-editor-${padId}`
    const channel = new BroadcastChannel(channelName)

    // Notify other tabs that we are taking over
    channel.postMessage('NEW_EDITOR')

    channel.onmessage = (event) => {
      if (event.data === 'NEW_EDITOR') {
        // Another tab has opened this pad in edit mode
        // Block this tab instead of redirecting to avoid interfering with the other tab's DB operations
        setIsMultiTabBlocked(true)
      }
    }

    return () => {
      channel.close()
    }
  }, [canEdit, padId])

  const loadKeys = useCallback(async () => {
    try {
      const derivedKeys = await deriveKeys(padId, isEdit)
      if (!isMountedRef.current) return
      setKeys(derivedKeys)

      // If edit was requested but no key found or decryption failed, show dialog
      if (isEdit && !derivedKeys?.secretKey) {
        setEditModeFailed(true)
      }
    } catch (error) {
      console.error('Failed to derive keys:', error)
      if (isMountedRef.current) {
        setKeys(null)
        if (isEdit) {
          setEditModeFailed(true)
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
        setIsRetrying(false)
      }
    }
  }, [padId, isEdit])

  useEffect(() => {
    isMountedRef.current = true
    setEditModeFailed(false)
    setIsMultiTabBlocked(false)
    loadKeys()

    return () => {
      isMountedRef.current = false
    }
  }, [loadKeys])

  // Check for matching session when in view-only mode
  useEffect(() => {
    if (isEdit || loading) return

    const checkForMatchingSession = async () => {
      try {
        const result = await getVerifiedStoredSession()
        if (result && result.session.padId === padId) {
          setHasMatchingSession(true)
        } else {
          setHasMatchingSession(false)
        }
      } catch {
        setHasMatchingSession(false)
      }
    }

    checkForMatchingSession()
  }, [padId, isEdit, loading])

  const handleSwitchToEditMode = () => {
    window.location.hash = `${padId}:rw`
  }

  const handleRetry = () => {
    setIsRetrying(true)
    setEditModeFailed(false)
    setLoading(true)
    loadKeys()
  }

  const handleViewOnly = () => {
    setEditModeFailed(false)
    window.location.hash = padId
  }

  const handleGoHome = () => {
    window.location.href = '/'
  }

  if (loading) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white mb-2">Loading pad...</div>
          <div className="text-gray-400 text-sm">{isRetrying ? 'Retrying...' : 'Checking session...'}</div>
        </div>
      </div>
    )
  }

  if (isMultiTabBlocked) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4 shadow-xl border border-gray-700">
          <h2 className="text-xl font-bold text-yellow-500 mb-4">Session Active in Another Tab</h2>
          <p className="text-gray-300 mb-6">
            You have opened this pad in edit mode in another tab or window. To prevent conflicts, this tab has been paused.
          </p>
          <div className="space-y-3">
            <button
              onClick={handleViewOnly}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              Switch to View Only
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium py-2 px-4 rounded transition-colors"
            >
              Reload Page
            </button>
            <button
              onClick={handleGoHome}
              className="w-full bg-gray-800 hover:bg-gray-700 text-gray-400 font-medium py-2 px-4 rounded transition-colors border border-gray-700"
            >
              Go to Home Page
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (editModeFailed) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4">
          <h2 className="text-xl font-bold text-yellow-400 mb-4">Edit Mode Unavailable</h2>
          <p className="text-gray-300 mb-6">
            Unable to establish read/write access for this pad. This may happen if:
          </p>
          <ul className="text-gray-400 text-sm mb-6 list-disc list-inside space-y-1">
            <li>You don't have an active session for this pad</li>
            <li>Your session has expired or was cleared</li>
            <li>The session data could not be decrypted</li>
          </ul>
          <div className="space-y-3">
            <button
              onClick={handleRetry}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              Retry
            </button>
            <button
              onClick={handleViewOnly}
              className="w-full bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              Continue as View Only
            </button>
            <button
              onClick={handleGoHome}
              className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium py-2 px-4 rounded transition-colors"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!keys) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-500 mb-2">Invalid Pad</h1>
          <p className="text-gray-400">The URL appears to be malformed.</p>
          <a
            href="/"
            className="mt-4 inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Create New Pad
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {hasMatchingSession && !canEdit && (
        <div className="bg-blue-900 px-4 py-1.5 flex items-center justify-center gap-2">
          <span className="text-blue-200 text-sm">You have an active session for this pad.</span>
          <button
            onClick={handleSwitchToEditMode}
            className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded transition-colors"
          >
            Switch to R/W
          </button>
        </div>
      )}
      <Header
        isSaving={isSaving}
        canEdit={canEdit}
        lastSaved={lastSaved}
        padId={padId}
        content={content}
        isLoadingContent={isLoadingContent}
      />
      <Editor
        content={content}
        onChange={setContent}
        readOnly={!canEdit || isLoadingContent}
      />
      <Footer
        content={content}
        relayStatus={relayStatus}
        activeRelays={activeRelays}
        isDiscovering={isDiscovering}
      />
    </div>
  )
}
