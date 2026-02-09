import { useState, useEffect, useCallback } from 'react'
import { getDecryptedPairSession } from '../lib/pairSessionStorage'
import { navigateTo } from '../lib/navigation'
import { useNostrPad } from '../hooks/useNostrPad'
import { PairHeader } from './PairHeader'
import { Editor } from './Editor'
import { Footer } from './Footer'
import { WaitingForPartner } from './pair/WaitingForPartner'
import { SendPaneHeader } from './pair/SendPaneHeader'
import { ReceivePaneHeader } from './pair/ReceivePaneHeader'

interface SplitPadPageProps {
  pairCode: string
}

export function SplitPadPage({ pairCode }: SplitPadPageProps) {
  const [isMultiTabBlocked, setIsMultiTabBlocked] = useState(false)
  const [pairKeys, setPairKeys] = useState<{
    localSecretKey: Uint8Array
    localPublicKey: string
    localPadId: string
    remotePadId: string
    pairCode: string
    localContentKey: CryptoKey
    remoteContentKey: CryptoKey
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadSession() {
      try {
        const session = await getDecryptedPairSession(pairCode)
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
  }, [pairCode])

  // Local pad (editable)
  const local = useNostrPad({
    padId: pairKeys?.localPadId ?? '',
    publicKey: pairKeys?.localPublicKey ?? '',
    secretKey: pairKeys?.localSecretKey ?? null,
    contentKey: pairKeys?.localContentKey ?? null,
    isBlocked: isMultiTabBlocked || isLoading || !!loadError
  })

  // Remote pad (view-only) — blocked until pair session is resolved
  const remote = useNostrPad({
    padId: pairKeys?.remotePadId ?? '',
    publicKey: '',
    secretKey: null,
    contentKey: pairKeys?.remoteContentKey ?? null,
    isBlocked: !pairKeys || !!loadError
  })

  // Single-tab editor enforcement for local pad
  useEffect(() => {
    if (!local.canEdit || !pairCode) return

    const channelName = `nostrpad-editor-${pairCode}`
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
  }, [local.canEdit, pairCode])

  const handleExitSplit = () => {
    navigateTo('/')
  }

  const [pasteStatus, setPasteStatus] = useState<'idle' | 'pasted' | 'empty'>('idle')
  const [sendReadOnly, setSendReadOnly] = useState(false)

  const handleClearContent = () => {
    local.setContent('')
    setSendReadOnly(false)
  }

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text) {
        setPasteStatus('empty')
        setTimeout(() => setPasteStatus('idle'), 1500)
        return
      }
      local.setContent(text)
      setSendReadOnly(true)
      setPasteStatus('pasted')
      setTimeout(() => setPasteStatus('idle'), 1000)
    } catch (error) {
      console.error('Failed to read clipboard:', error)
      setPasteStatus('empty')
      setTimeout(() => setPasteStatus('idle'), 1500)
    }
  }, [local])


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
      <PairHeader
        isSaving={local.isSaving}
        lastSaved={local.lastSaved}
        pairCode={pairKeys?.pairCode ?? pairCode}
        isLoadingContent={local.isLoadingContent}
      />
      <div className="flex-1 flex flex-col sm:flex-row min-h-0">
        {/* Send pane (local, editable) */}
        <div className="flex-1 flex flex-col min-h-0">
          <SendPaneHeader
            localPadId={pairKeys?.localPadId ?? ''}
            onPaste={handlePaste}
            onClear={handleClearContent}
            pasteStatus={pasteStatus}
            readOnly={sendReadOnly}
            onReadOnlyChange={setSendReadOnly}
          />
          <Editor
            content={local.content}
            onChange={local.setContent}
            readOnly={!local.canEdit || local.isLoadingContent || sendReadOnly}
          />
        </div>
        {/* Receive pane (remote, read-only) */}
        <div className="flex-1 flex flex-col min-h-0 border-t sm:border-t-0 sm:border-l border-gray-700">
          <ReceivePaneHeader
            remotePadId={pairKeys?.remotePadId ?? ''}
            remoteContent={remote.content}
          />
          {!remote.isSubscriptionReady && !remote.hasReceivedEvent ? (
            <WaitingForPartner pairCode={pairCode} />
          ) : (
            <Editor
              content={remote.content}
              onChange={() => {}}
              readOnly
            />
          )}
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
