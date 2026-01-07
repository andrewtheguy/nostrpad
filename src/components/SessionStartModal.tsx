import { useState } from 'react'
import { createNewPad } from '../lib/keys'
import { createAndStoreSession } from '../lib/sessionStorage'
import { getPublicKey } from 'nostr-tools/pure'
import { decode, encodeFixed } from '../lib/encoding'
import { PAD_ID_BYTES, PAD_ID_LENGTH } from '../lib/constants'

// Helper function
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

interface SessionStartModalProps {
  onSessionStarted: () => void
}

type ModalMode = 'choice' | 'show-secret' | 'import'

export function SessionStartModal({ onSessionStarted }: SessionStartModalProps) {
  const [mode, setMode] = useState<ModalMode>('choice')
  const [isCreating, setIsCreating] = useState(false)
  const [importSecret, setImportSecret] = useState('')
  const [importError, setImportError] = useState('')
  const [newPadData, setNewPadData] = useState<{ padId: string; secret: string } | null>(null)

  const handleStartNewSession = async () => {
    setIsCreating(true)
    try {
      const newPad = createNewPad()
      setNewPadData({ padId: newPad.padId, secret: newPad.secret })
      setMode('show-secret')
    } catch (error) {
      console.error('Failed to create session:', error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleConfirmNewSession = async () => {
    if (!newPadData) return
    try {
      await createAndStoreSession(newPadData.padId, decode(newPadData.secret))
      window.location.hash = newPadData.padId
      onSessionStarted()
    } catch (error) {
      console.error('Failed to store session:', error)
    }
  }

  const handleImportSession = async () => {
    setImportError('')
    if (!importSecret.trim()) {
      setImportError('Please enter a secret key')
      return
    }

    try {
      const secretKey = decode(importSecret.trim())
      if (secretKey.length !== 32) {
        setImportError('Invalid secret key format')
        return
      }

      const publicKey = getPublicKey(secretKey)
      const pubkeyBytes = hexToBytes(publicKey)
      const padId = encodeFixed(pubkeyBytes.slice(0, PAD_ID_BYTES), PAD_ID_LENGTH)

      await createAndStoreSession(padId, secretKey)
      window.location.hash = padId
      onSessionStarted()
    } catch (error) {
      console.error('Failed to import session:', error)
      setImportError('Invalid secret key')
    }
  }

  const copySecret = async () => {
    if (!newPadData) return
    try {
      await navigator.clipboard.writeText(newPadData.secret)
      // Could show a copied message, but since it's one-time, just proceed
      handleConfirmNewSession()
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  if (mode === 'show-secret' && newPadData) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-8 max-w-lg w-full mx-4">
          <h2 className="text-2xl font-bold text-white mb-4">Session Created</h2>
          <p className="text-gray-300 mb-4">
            Your new session has been created. Copy the secret key below - this is your only chance to save it for backup:
          </p>
          <div className="bg-gray-900 p-4 rounded mb-6">
            <code className="text-green-400 font-mono text-sm break-all">{newPadData.secret}</code>
          </div>
          <div className="flex gap-3">
            <button
              onClick={copySecret}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              Copy Secret & Continue
            </button>
            <button
              onClick={handleConfirmNewSession}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              Continue Without Copying
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'import') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4">
          <h2 className="text-2xl font-bold text-white mb-4">Import Secret Key</h2>
          <p className="text-gray-300 mb-4">
            Paste your secret key to import an existing session:
          </p>
          <textarea
            value={importSecret}
            onChange={(e) => setImportSecret(e.target.value)}
            placeholder="Enter your secret key..."
            className="w-full bg-gray-700 text-white rounded p-3 mb-4 font-mono text-sm"
            rows={3}
          />
          {importError && (
            <p className="text-red-400 text-sm mb-4">{importError}</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => setMode('choice')}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleImportSession}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              Import & Continue
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold text-white mb-4">Welcome to NostrPad</h2>
        <p className="text-gray-300 mb-6">
          Choose how to start your session:
        </p>
        <div className="space-y-3">
          <button
            onClick={handleStartNewSession}
            disabled={isCreating}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            {isCreating ? 'Creating...' : 'Start New Session'}
          </button>
          <button
            onClick={() => setMode('import')}
            className="w-full bg-gray-600 hover:bg-gray-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            Import Existing Secret Key
          </button>
        </div>
      </div>
    </div>
  )
}