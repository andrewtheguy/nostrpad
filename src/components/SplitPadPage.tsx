import { useState, useEffect } from 'react'
import { getDecryptedPairSession } from '../lib/pairSessionStorage'
import { navigateTo } from '../lib/navigation'
import { useNostrPad } from '../hooks/useNostrPad'
import { Header } from './Header'
import { Editor } from './Editor'
import { Footer } from './Footer'

interface SplitPadPageProps {
  padId: string
}

export function SplitPadPage({ padId }: SplitPadPageProps) {
  const [isMultiTabBlocked, setIsMultiTabBlocked] = useState(false)
  const [pairKeys, setPairKeys] = useState<{
    localSecretKey: Uint8Array
    localPublicKey: string
    remotePadId: string
    pairCode: string
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadSession() {
      try {
        const session = await getDecryptedPairSession(padId)
        if (cancelled) return
        if (!session) {
          setLoadError('Pair session not found')
          setIsLoading(false)
          return
        }
        setPairKeys(session)
        setIsLoading(false)
      } catch (err) {
        if (cancelled) return
        console.error('Failed to load pair session:', err)
        setLoadError('Failed to load pair session')
        setIsLoading(false)
      }
    }
    loadSession()
    return () => { cancelled = true }
  }, [padId])

  // Local pad (editable)
  const local = useNostrPad({
    padId: padId,
    publicKey: pairKeys?.localPublicKey ?? '',
    secretKey: pairKeys?.localSecretKey ?? null,
    isBlocked: isMultiTabBlocked || isLoading || !!loadError
  })

  // Remote pad (view-only) — blocked until pair session is resolved
  const remote = useNostrPad({
    padId: pairKeys?.remotePadId ?? '',
    publicKey: '',
    secretKey: null,
    isBlocked: !pairKeys || !!loadError
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

  const handleExitSplit = () => {
    navigateTo('/')
  }

  const handleClearContent = () => {
    local.setContent('')
  }

  if (isLoading) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading pair session...</div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4 shadow-xl border border-gray-700">
          <h2 className="text-xl font-bold text-red-500 mb-4">Pair Session Error</h2>
          <p className="text-gray-300 mb-6">{loadError}</p>
          <button
            onClick={handleExitSplit}
            className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium py-2 px-4 rounded transition-colors"
          >
            Go to Home Page
          </button>
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
            This pair session is already active in another tab or window. To prevent conflicts, this tab has been paused.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium py-2 px-4 rounded transition-colors"
            >
              Reload Page
            </button>
            <button
              onClick={handleExitSplit}
              className="w-full bg-gray-800 hover:bg-gray-700 text-gray-400 font-medium py-2 px-4 rounded transition-colors border border-gray-700"
            >
              Go to Home Page
            </button>
          </div>
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
        pairCode={pairKeys?.pairCode}
        onExitSplit={handleExitSplit}
        onClearContent={handleClearContent}
        remoteContent={remote.content}
      />
      <div className="flex-1 flex flex-col sm:flex-row min-h-0">
        {/* Send pane (local, editable) */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 py-1 bg-green-900/50 border-b border-gray-700 flex items-center gap-2">
            <span className="text-xs font-medium text-green-400">Send</span>
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
