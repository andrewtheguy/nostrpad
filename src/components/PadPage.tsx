import { useState, useEffect } from 'react'
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

  useEffect(() => {
    const loadKeys = async () => {
      const derivedKeys = await deriveKeys(padId, isEdit)
      setKeys(derivedKeys)
      setLoading(false)

      // If edit was requested but no key found, redirect to view-only URL
      if (isEdit && !derivedKeys?.secretKey) {
        window.location.hash = padId
      }
    }
    loadKeys()
  }, [padId, isEdit])

  if (loading) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white mb-2">Loading pad...</div>
          <div className="text-gray-400 text-sm">Checking session...</div>
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
        padId={padId}
        isDiscovering={isDiscovering}
      />
    </div>
  )
}
