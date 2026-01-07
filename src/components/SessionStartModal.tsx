import { useState, useEffect, useRef } from 'react'
import { createNewPad } from '../lib/keys'
import { createAndStoreSession, getVerifiedStoredSession, clearSession } from '../lib/sessionStorage'
import { getPublicKey } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import { createLogoutEvent, publishEvent } from '../lib/nostr'
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
  onSessionStarted: () => void
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

  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getVerifiedStoredSession().then(result => {
      // Only show padId if integrity verification passes
      setLastSessionPadId(result?.session.padId || null)
    }).catch(error => {
      console.error('Failed to get stored session:', error)
    })
  }, [])

  // Cleanup copy timeout on unmount
  useEffect(() => {
    const ref = copyTimeoutRef
    return () => {
      if (ref.current) {
        clearTimeout(ref.current)
      }
    }
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
      onSessionStarted()
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

      // 1. Create logout event
      const logoutEvent = createLogoutEvent(padId, secretKey)

      // 2. Publish to relays to notify other devices
      // We use a temporary pool here just for this action
      const pool = new SimplePool()
      try {
        await publishEvent(pool, logoutEvent)
      } catch (err) {
        console.warn('Failed to publish logout event, continuing anyway:', err)
      } finally {
        // We don't need to keep connections open
        // But SimplePool doesn't have a 'close all' easily accessible or we just let it be GC'd or use close() if avail.
        // publishEvent handles its own promises but pool connections might hang around. 
        // SimplePool in nostr-tools v2 (pure) might differ. 
        // Checking imports... 'nostr-tools/pool'. 
        // We should probably close connections if possible, but publishEvent in this codebase 
        // uses pool.publish([relay], event) and returns promises. 
        // We can just rely on publishEvent helper.
      }

      // 3. Store new session
      // Ensure session timestamp is strictly greater than event timestamp to avoid self-logout
      // event.created_at is in seconds floor. 
      // We use Date.now() which is ms. 
      // Ideally wait 1s or just add 1000ms to ensure safety margin if clocks are weird?
      // Actually standard Date.now() > event.created_at * 1000 is usually true if done after.
      // Let's add 1000ms to be safe against clock skew/rounding.
      const sessionTimestamp = (logoutEvent.created_at * 1000) + 1000

      await createAndStoreSession(padId, secretKey, sessionTimestamp)
      window.location.hash = `${padId}:rw`
      onSessionStarted()
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
      // Re-validate session with integrity check
      const result = await getVerifiedStoredSession()
      if (!result || result.session.padId !== lastSessionPadId) {
        // Session no longer exists, padId mismatch, or integrity check failed
        setLastSessionPadId(null)
        setResumeError('Session no longer exists or has been tampered with. Please start a new session or import your secret key.')
        return
      }

      const { session } = result

      // Validate session data is not corrupted
      if (!session.encryptedPrivateKey || !session.aesKey || !session.iv) {
        setLastSessionPadId(null)
        setResumeError('Session data is corrupted. Please start a new session or import your secret key.')
        return
      }

      window.location.hash = `${lastSessionPadId}:rw`
      onSessionStarted()
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

    // Clear any existing timeout
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = null
    }

    // Reset states before attempting
    setCopied(false)
    setCopyError(false)

    try {
      await navigator.clipboard.writeText(newPadData.secret)
      setCopied(true)
      // Auto-reset success message after 3 seconds
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false)
        copyTimeoutRef.current = null
      }, 3000)
    } catch (error) {
      console.error('Failed to copy:', error)
      setCopyError(true)
      // Auto-reset error message after 5 seconds
      copyTimeoutRef.current = setTimeout(() => {
        setCopyError(false)
        copyTimeoutRef.current = null
      }, 5000)
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