import { useState, useEffect, useRef, useCallback } from 'react'
import { deriveKeys } from '../lib/keys'
import { useNostrPad } from '../hooks/useNostrPad'
import { getVerifiedStoredSession, clearSession } from '../lib/sessionStorage'
import { Header } from './Header'
import { Editor } from './Editor'
import { Footer } from './Footer'

interface SplitPadPageProps {
  padId: string
  remotePadId: string
}

export function SplitPadPage({ padId, remotePadId }: SplitPadPageProps) {
  const [keys, setKeys] = useState<{ secretKey: Uint8Array | null, publicKey: string, sessionCreatedAt?: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [editModeFailed, setEditModeFailed] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [isMultiTabBlocked, setIsMultiTabBlocked] = useState(false)
  const isMountedRef = useRef(true)

  const handleLogout = useCallback(async () => {
    try {
      const stored = await getVerifiedStoredSession()
      const storedCreatedAt = stored?.session.createdAt
      const currentCreatedAt = keys?.sessionCreatedAt

      if (storedCreatedAt && currentCreatedAt && storedCreatedAt > currentCreatedAt) {
        return
      }
    } catch (e) {
      console.warn('Failed to verify session during logout check', e)
    }

    alert('Session invalidated: This pad was opened in editor mode on another device.')
    await clearSession()
    window.location.hash = padId
    window.location.reload()
  }, [padId, keys?.sessionCreatedAt])

  // Local pad (editable)
  const local = useNostrPad({
    padId,
    publicKey: keys?.publicKey || '',
    secretKey: keys?.secretKey || null,
    sessionCreatedAt: keys?.sessionCreatedAt,
    onLogoutSignal: handleLogout,
    isBlocked: isMultiTabBlocked
  })

  // Remote pad (view-only)
  const remote = useNostrPad({
    padId: remotePadId,
    publicKey: '',
    secretKey: null
  })

  // Single-tab editor enforcement for local pad
  useEffect(() => {
    if (!local.canEdit || !padId) return

    const channelName = `nostrpad-editor-${padId}`
    const channel = new BroadcastChannel(channelName)

    channel.postMessage('NEW_EDITOR')

    channel.onmessage = (event) => {
      if (event.data === 'NEW_EDITOR') {
        setIsMultiTabBlocked(true)
      }
    }

    return () => {
      channel.close()
    }
  }, [local.canEdit, padId])

  const loadKeys = useCallback(async () => {
    try {
      const derivedKeys = await deriveKeys(padId, true)
      if (!isMountedRef.current) return
      setKeys(derivedKeys)

      if (!derivedKeys?.secretKey) {
        setEditModeFailed(true)
      }
    } catch (error) {
      console.error('Failed to derive keys:', error)
      if (isMountedRef.current) {
        setKeys(null)
        setEditModeFailed(true)
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
        setIsRetrying(false)
      }
    }
  }, [padId])

  useEffect(() => {
    isMountedRef.current = true
    setEditModeFailed(false)
    setIsMultiTabBlocked(false)
    loadKeys()

    return () => {
      isMountedRef.current = false
    }
  }, [loadKeys])

  const handleExitSplit = () => {
    window.location.hash = `${padId}:rw`
  }

  const handleClearContent = () => {
    local.setContent('')
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
          <div className="text-white mb-2">Loading split pad...</div>
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
      <Header
        isSaving={local.isSaving}
        canEdit={local.canEdit}
        lastSaved={local.lastSaved}
        padId={padId}
        content={local.content}
        isLoadingContent={local.isLoadingContent}
        isSplitMode
        onExitSplit={handleExitSplit}
        onClearContent={handleClearContent}
        remoteContent={remote.content}
      />
      <div className="flex-1 flex flex-col sm:flex-row min-h-0">
        {/* Send pane (local, editable) */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 py-1 bg-green-900/50 border-b border-gray-700 flex items-center gap-2">
            <span className="text-xs font-medium text-green-400">Send</span>
            <span className="text-xs font-mono text-gray-500">{padId}</span>
          </div>
          <Editor
            content={local.content}
            onChange={local.setContent}
            readOnly={!local.canEdit || local.isLoadingContent}
          />
        </div>
        {/* Receive pane (remote, read-only) */}
        <div className="flex-1 flex flex-col min-h-0 border-t sm:border-t-0 sm:border-l border-gray-700">
          <div className="px-4 py-1 bg-blue-900/50 border-b border-gray-700 flex items-center gap-2">
            <span className="text-xs font-medium text-blue-400">Receive</span>
            <span className="text-xs font-mono text-gray-500">{remotePadId}</span>
          </div>
          <Editor
            content={remote.content}
            onChange={() => {}}
            readOnly
          />
        </div>
      </div>
      <Footer
        content={local.content}
        relayStatus={local.relayStatus}
        activeRelays={local.activeRelays}
        isDiscovering={local.isDiscovering}
        isSplitMode
        remoteContent={remote.content}
      />
    </div>
  )
}
