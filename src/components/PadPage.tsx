import { useMemo } from 'react'
import { deriveKeys } from '../lib/keys'
import { useNostrPad } from '../hooks/useNostrPad'
import { Header } from './Header'
import { Editor } from './Editor'
import { Footer } from './Footer'

interface PadPageProps {
  padId: string
  secret: string | null
}

export function PadPage({ padId, secret }: PadPageProps) {
  const keys = useMemo(() => {
    return deriveKeys(padId, secret)
  }, [padId, secret])

  const {
    content,
    setContent,
    relayStatus,
    relaySource,
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
        secret={secret}
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
        relaySource={relaySource}
        padId={padId}
        secret={secret}
        isDiscovering={isDiscovering}
      />
    </div>
  )
}
