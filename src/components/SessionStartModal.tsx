import { useState, useEffect } from 'react'
import { createNewPad } from '../lib/keys'
import { createAndStoreSession, getStoredSession, clearSession } from '../lib/sessionStorage'
import { getPublicKey } from 'nostr-tools/pure'
import { decode, encodeFixed } from '../lib/encoding'
import { PAD_ID_BYTES, PAD_ID_LENGTH } from '../lib/constants'

// Helper function
function hexToBytes(hex: string): Uint8Array {
  // Strip optional 0x prefix
  const cleanHex = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex

  // Validate even length
  if (cleanHex.length % 2 !== 0) {
    throw new Error('Invalid hex string: odd length')
  }

  // Validate hex characters
  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new Error('Invalid hex string: contains non-hex characters')
  }

  const bytes = new Uint8Array(cleanHex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

interface SessionStartModalProps {
  onSessionStarted: (padRoute: { padId: string; isEdit: boolean }) => void
}

type ModalMode = 'choice' | 'show-secret' | 'import'

export function SessionStartModal({ onSessionStarted }: SessionStartModalProps) {
  const [mode, setMode] = useState<ModalMode>('choice')
  const [isCreating, setIsCreating] = useState(false)
  const [importSecret, setImportSecret] = useState('')
  const [importError, setImportError] = useState('')
  const [newPadData, setNewPadData] = useState<{ padId: string; secret: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [lastSessionPadId, setLastSessionPadId] = useState<string | null>(null)
  const [createError, setCreateError] = useState('')
  const [showSecretError, setShowSecretError] = useState('')
  const [isConfirming, setIsConfirming] = useState(false)

  useEffect(() => {
    getStoredSession().then(session => {
      setLastSessionPadId(session?.padId || null)
    }).catch(error => {
      console.error('Failed to get stored session:', error)
    })
  }, [])

  const handleStartNewSession = async () => {
    if (lastSessionPadId && !confirm('Starting a new session will clear your saved session. Are you sure?')) {
      return
    }
    setIsCreating(true)
    setCreateError('')
    try {
      const newPad = createNewPad()
      setNewPadData({ padId: newPad.padId, secret: newPad.secret })
      setMode('show-secret')
    } catch (error) {
      console.error('Failed to create session:', error)
      setCreateError('Failed to create session. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  const handleConfirmNewSession = async () => {
    if (!confirm('Are you sure you have copied the secret key? This is your only chance to save it for backup.')) return
    if (!newPadData) return
    setIsConfirming(true)
    setShowSecretError('')
    try {
      await createAndStoreSession(newPadData.padId, decode(newPadData.secret))
      window.location.hash = `${newPadData.padId}:rw`
      onSessionStarted({ padId: newPadData.padId, isEdit: true })
    } catch (error) {
      console.error('Failed to store session:', error)
      setShowSecretError('Failed to save session. Please try again.')
    } finally {
      setIsConfirming(false)
    }
  }

  const handleDismissShowSecret = () => {
    setNewPadData(null)
    setShowSecretError('')
    setCopied(false)
    setCopyError(false)
    setMode('choice')
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
      window.location.hash = `${padId}:rw`
      onSessionStarted({ padId, isEdit: true })
    } catch (error) {
      console.error('Failed to import session:', error)
      setImportError('Invalid secret key')
    }
  }

  const [resumeError, setResumeError] = useState('')

  const handleResumeLastSession = async () => {
    if (!lastSessionPadId) return
    setResumeError('')

    try {
      // Re-validate that the session still exists in storage
      const session = await getStoredSession()
      if (!session || session.padId !== lastSessionPadId) {
        // Session no longer exists or padId mismatch
        setLastSessionPadId(null)
        setResumeError('Session no longer exists. Please start a new session or import your secret key.')
        return
      }

      // Validate session data is not corrupted
      if (!session.encryptedPrivateKey || !session.aesKey || !session.iv) {
        setLastSessionPadId(null)
        setResumeError('Session data is corrupted. Please start a new session or import your secret key.')
        return
      }

      window.location.hash = `${lastSessionPadId}:rw`
      onSessionStarted({ padId: lastSessionPadId, isEdit: true })
    } catch (error) {
      console.error('Failed to validate session:', error)
      setLastSessionPadId(null)
      setResumeError('Failed to validate session. Please try again.')
    }
  }

  const handleClearSession = async () => {
    if (confirm('Are you sure you want to clear the saved session?')) {
      try {
        await clearSession()
        setLastSessionPadId(null)
      } catch (error) {
        console.error('Failed to clear session:', error)
      }
    }
  }

  const copySecret = async () => {
    if (!newPadData) return
    // Reset states before attempting
    setCopied(false)
    setCopyError(false)
    try {
      await navigator.clipboard.writeText(newPadData.secret)
      setCopied(true)
      // Auto-reset success message after 3 seconds
      setTimeout(() => setCopied(false), 3000)
    } catch (error) {
      console.error('Failed to copy:', error)
      setCopyError(true)
      // Auto-reset error message after 5 seconds
      setTimeout(() => setCopyError(false), 5000)
    }
  }

  if (mode === 'show-secret' && newPadData) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-8 max-w-lg w-full mx-4">
          <h2 className="text-2xl font-bold text-white mb-4">Session Created</h2>
          <p className="text-gray-300 mb-4">
            Your new session has been created. Copy the secret key below - this is your only chance to save it for backup. Make sure to copy it before continuing.
          </p>
          <div className="bg-gray-900 p-4 rounded flex items-center gap-2">
            <code className="text-green-400 font-mono text-sm break-all flex-1">{newPadData.secret}</code>
            <button
              onClick={copySecret}
              className="text-gray-400 hover:text-white transition-colors p-1 flex items-center gap-1"
              title="Copy to clipboard"
            >
              <span className={`text-xs transition-opacity ${copied ? 'opacity-100 text-green-400' : 'opacity-0'}`}>
                ✓
              </span>
              📋
            </button>
          </div>
          <div className="h-6 mb-2">
            {copyError && <p className="text-red-400 text-sm">Failed to copy. Please select and copy the key manually.</p>}
            {showSecretError && <p className="text-red-400 text-sm">{showSecretError}</p>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleDismissShowSecret}
              disabled={isConfirming}
              className="flex-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-500 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmNewSession}
              disabled={isConfirming}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              {isConfirming ? 'Saving...' : showSecretError ? 'Retry' : 'Continue'}
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
        {createError && (
          <p className="text-red-400 text-sm mb-4">{createError}</p>
        )}
        {resumeError && (
          <p className="text-red-400 text-sm mb-4">{resumeError}</p>
        )}
        <div className="space-y-3">
          {lastSessionPadId && (
            <button
              onClick={handleResumeLastSession}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              Resume Last Session: {lastSessionPadId}
            </button>
          )}
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
          {lastSessionPadId && (
            <button
              onClick={handleClearSession}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
            >
              Clear Saved Session
            </button>
          )}
        </div>
      </div>
    </div>
  )
}