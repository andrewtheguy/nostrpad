import { useState, useEffect, useRef, useCallback } from 'react'
import { deriveKeys } from '../lib/keys'
import { useNostrPad } from '../hooks/useNostrPad'
import { Header } from './Header'
import { Editor } from './Editor'
import { Footer } from './Footer'

interface PadPageProps {
  padId: string
  isEdit: boolean
}

export function PadPage({ padId, isEdit }: PadPageProps) {
  const [keys, setKeys] = useState<{ secretKey: Uint8Array | null, publicKey: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [editModeFailed, setEditModeFailed] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const isMountedRef = useRef(true)

  const {
    content,
    setContent,
    relayStatus,
    activeRelays,
    isSaving,
    canEdit,
    lastSaved,
    isDiscovering
  } = useNostrPad({
    padId,
    publicKey: keys?.publicKey || '',
    secretKey: keys?.secretKey || null
  })

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
    loadKeys()

    return () => {
      isMountedRef.current = false
    }
  }, [loadKeys])

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
        isSaving={isSaving}
        canEdit={canEdit}
        lastSaved={lastSaved}
        padId={padId}
        content={content}
      />
      <Editor
        content={content}
        onChange={setContent}
        readOnly={!canEdit}
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
