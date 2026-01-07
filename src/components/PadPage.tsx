import { useState, useEffect } from 'react'
import { deriveKeys } from '../lib/keys'
import { useNostrPad } from '../hooks/useNostrPad'
import { Header } from './Header'
import { Editor } from './Editor'
import { Footer } from './Footer'

interface PadPageProps {
  padId: string
}

export function PadPage({ padId }: PadPageProps) {
  const [keys, setKeys] = useState<{ secretKey: Uint8Array | null, publicKey: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadKeys = async () => {
      const derivedKeys = await deriveKeys(padId)
      setKeys(derivedKeys)
      setLoading(false)
    }
    loadKeys()
  }, [padId])

  if (loading || !keys) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white mb-2">Loading pad...</div>
          <div className="text-gray-400 text-sm">Checking session...</div>
        </div>
      </div>
    )
  }

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
    publicKey: keys.publicKey,
    secretKey: keys.secretKey
  })

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
