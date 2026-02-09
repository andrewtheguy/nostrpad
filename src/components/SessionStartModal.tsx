import { useState, useEffect, useRef } from 'react'
import { createNewPad, generatePairCode, isValidPairCode, derivePairKeys, encodeSecretKey, decodeSecretKey, isValidSecretKeyEncoding } from '../lib/keys'
import { generateSecretKey } from 'nostr-tools/pure'
import { navigateTo } from '../lib/navigation'
import { createAndStoreSession, getVerifiedStoredSession, clearSession } from '../lib/sessionStorage'
import { getPublicKey } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import { BOOTSTRAP_RELAYS, PAIR_CODE_LENGTH, SECRET_KEY_ENCODED_LENGTH } from '../lib/constants'
import { createLogoutEvent, publishEvent } from '../lib/nostr'
import { decode, encodeFixed } from '../lib/encoding'
import { PAD_ID_BYTES, PAD_ID_LENGTH } from '../lib/constants'
import { storePairSecretKey, getPairSecretKey, hasPairSecretKey, clearPairSecretKey, createPairSession, listPairSessions, clearPairSession } from '../lib/pairSessionStorage'
import type { PairSessionMetadata } from '../lib/pairSessionStorage'

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

type ModalMode = 'mode-select' | 'sender-receiver' | 'show-secret' | 'import' | 'pair-setup' | 'pair'

export function SessionStartModal({ onSessionStarted }: SessionStartModalProps) {
  const [mode, setMode] = useState<ModalMode>('mode-select')
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
  const [lastSessionCreatedAt, setLastSessionCreatedAt] = useState<number>(0)
  const [sessionEndedByRemote, setSessionEndedByRemote] = useState(false)
  const [pairSessions, setPairSessions] = useState<PairSessionMetadata[]>([])
  const [pairTab, setPairTab] = useState<'create' | 'join'>('create')
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const [pairJoinInput, setPairJoinInput] = useState('')
  const [pairError, setPairError] = useState('')
  const [isPairProcessing, setIsPairProcessing] = useState(false)
  const [pairFingerprint, setPairFingerprint] = useState<string | null>(null)

  // Pair setup state
  const [pairSetupTab, setPairSetupTab] = useState<'generate' | 'import'>('generate')
  const [generatedEncodedKey, setGeneratedEncodedKey] = useState<string | null>(null)
  const [copiedEncodedKey, setCopiedEncodedKey] = useState(false)
  const [pairSetupImportInput, setPairSetupImportInput] = useState('')
  const [pairSetupError, setPairSetupError] = useState('')
  const [isPairSetupProcessing, setIsPairSetupProcessing] = useState(false)

  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pairJoinInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getVerifiedStoredSession().then(result => {
      if (result) {
        setLastSessionPadId(result.session.padId)
        setLastSessionCreatedAt(result.session.createdAt)
      } else {
        setLastSessionPadId(null)
      }
    }).catch(error => {
      console.error('Failed to get stored session:', error)
    })
  }, [])

  useEffect(() => {
    listPairSessions().then(setPairSessions).catch(console.error)
  }, [])

  // Listen for logout events while on this screen
  useEffect(() => {
    if (!lastSessionPadId || !lastSessionCreatedAt) return

    const pool = new SimplePool()
    const relays = BOOTSTRAP_RELAYS
    const since = Math.floor(lastSessionCreatedAt / 1000) - 120

    const sub = pool.subscribe(relays, {
      kinds: [21000],
      '#d': [lastSessionPadId],
      since
    }, {
      onevent: (event) => {
        const eventTimeMs = event.created_at * 1000
        if (eventTimeMs > lastSessionCreatedAt) {
          console.log('Session invalidated by remote device')
          setLastSessionPadId(null)
          clearSession().catch(console.error)
          setSessionEndedByRemote(true)
        }
      }
    })

    return () => {
      sub.close()
      pool.close(relays)
    }
  }, [lastSessionPadId, lastSessionCreatedAt])

  useEffect(() => {
    if (mode === 'pair' && pairTab === 'join') {
      pairJoinInputRef.current?.focus()
    }
  }, [mode, pairTab])

  // Cleanup copy timeout on unmount
  useEffect(() => {
    const ref = copyTimeoutRef
    return () => {
      if (ref.current) {
        clearTimeout(ref.current)
      }
    }
  }, [])

  const handlePairModeClick = async () => {
    try {
      const hasKey = await hasPairSecretKey()
      if (hasKey) {
        const result = await getPairSecretKey()
        setPairFingerprint(result?.fingerprint ?? null)
        setMode('pair')
      } else {
        setMode('pair-setup')
      }
    } catch (err) {
      console.error('Failed to check pair secret key:', err)
      setMode('pair-setup')
    }
  }

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
      navigateTo('/s/' + newPadData.padId + '/rw')
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
    setMode('sender-receiver')
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

      const logoutEvent = createLogoutEvent(padId, secretKey)

      const pool = new SimplePool()
      try {
        await publishEvent(pool, logoutEvent)
      } catch (err) {
        console.warn('Failed to publish logout event, continuing anyway:', err)
      } finally {
        pool.close(BOOTSTRAP_RELAYS)
      }

      const sessionTimestamp = (logoutEvent.created_at * 1000) + 1000

      await createAndStoreSession(padId, secretKey, sessionTimestamp)
      navigateTo('/s/' + padId + '/rw')
      onSessionStarted()
    } catch (error) {
      console.error('Failed to import session:', error)
      if (error instanceof Error) {
        setImportError(error.message)
      } else {
        setImportError('Failed to import session. Please check console for details.')
      }
    }
  }

  const [resumeError, setResumeError] = useState('')

  const handleResumeLastSession = async () => {
    if (!lastSessionPadId) return
    setResumeError('')

    try {
      const result = await getVerifiedStoredSession()
      if (!result || result.session.padId !== lastSessionPadId) {
        setLastSessionPadId(null)
        setResumeError('Session no longer exists or has been tampered with. Please start a new session or import your secret key.')
        return
      }

      const { session } = result

      if (!session.encryptedPrivateKey || !session.aesKey || !session.iv) {
        setLastSessionPadId(null)
        setResumeError('Session data is corrupted. Please start a new session or import your secret key.')
        return
      }

      navigateTo('/s/' + lastSessionPadId + '/rw')
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

  // Pair setup: Generate
  const handlePairSetupGenerate = async () => {
    setIsPairSetupProcessing(true)
    setPairSetupError('')
    try {
      const sk = generateSecretKey()
      const encoded = encodeSecretKey(sk)
      setGeneratedEncodedKey(encoded)
      setCopiedEncodedKey(false)
    } catch (err) {
      console.error('Failed to generate secret key:', err)
      setPairSetupError('Failed to generate secret key')
    } finally {
      setIsPairSetupProcessing(false)
    }
  }

  const handlePairSetupConfirmGenerate = async () => {
    if (!generatedEncodedKey) return
    setIsPairSetupProcessing(true)
    setPairSetupError('')
    try {
      const sk = decodeSecretKey(generatedEncodedKey)
      await storePairSecretKey(sk)
      setGeneratedEncodedKey(null)
      setPairSessions(await listPairSessions())
      const result = await getPairSecretKey()
      setPairFingerprint(result?.fingerprint ?? null)
      setMode('pair')
    } catch (err) {
      console.error('Failed to store pair secret key:', err)
      setPairSetupError('Failed to store secret key')
    } finally {
      setIsPairSetupProcessing(false)
    }
  }

  // Pair setup: Import
  const handlePairSetupImport = async () => {
    const input = pairSetupImportInput.trim()
    setPairSetupError('')
    if (!input) {
      setPairSetupError('Please enter a secret key')
      return
    }
    if (!isValidSecretKeyEncoding(input)) {
      setPairSetupError('Invalid secret key (check length, characters, and checksum)')
      return
    }
    setIsPairSetupProcessing(true)
    try {
      const sk = decodeSecretKey(input)
      await storePairSecretKey(sk)
      setPairSetupImportInput('')
      setPairSessions(await listPairSessions())
      const result = await getPairSecretKey()
      setPairFingerprint(result?.fingerprint ?? null)
      setMode('pair')
    } catch (err) {
      console.error('Failed to import pair secret key:', err)
      setPairSetupError('Failed to import secret key')
    } finally {
      setIsPairSetupProcessing(false)
    }
  }

  // Pair: Create
  const handlePairGenerate = () => {
    setGeneratedCode(generatePairCode())
    setCopiedCode(false)
  }

  const handlePairCopyCode = async () => {
    if (!generatedCode) return
    try {
      await navigator.clipboard.writeText(generatedCode)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handlePairStartCreator = async () => {
    if (!generatedCode || isPairProcessing) return
    setIsPairProcessing(true)
    try {
      const result = await getPairSecretKey()
      if (!result) {
        setPairError('Secret key not found. Please set up your secret key first.')
        setIsPairProcessing(false)
        return
      }
      const { localPadId, remotePadId } = await derivePairKeys(result.hmacKey, generatedCode, 1)
      await createPairSession(localPadId, remotePadId, generatedCode, 1)
      navigateTo('/p/' + generatedCode)
      onSessionStarted()
    } catch (err) {
      console.error('Failed to start pair session:', err)
      setPairError('Failed to start pair session')
      setIsPairProcessing(false)
    }
  }

  const validateCode = (code: string): string | null => {
    if (!code) return 'Please enter a pair code'
    if (code.length !== PAIR_CODE_LENGTH) return `Code must be ${PAIR_CODE_LENGTH} characters (got ${code.length})`
    if (!isValidPairCode(code)) return 'Invalid pair code (checksum mismatch — check for typos)'
    return null
  }

  const handlePairJoin = async () => {
    if (isPairProcessing) return
    const code = pairJoinInput.trim()
    const validationError = validateCode(code)
    if (validationError) {
      setPairError(validationError)
      return
    }
    setIsPairProcessing(true)
    try {
      const result = await getPairSecretKey()
      if (!result) {
        setPairError('Secret key not found. Please set up your secret key first.')
        setIsPairProcessing(false)
        return
      }
      const { localPadId, remotePadId } = await derivePairKeys(result.hmacKey, code, 2)
      await createPairSession(localPadId, remotePadId, code, 2)
      navigateTo('/p/' + code)
      onSessionStarted()
    } catch (err) {
      console.error('Failed to join pair session:', err)
      setPairError('Failed to join pair session')
      setIsPairProcessing(false)
    }
  }

  const handlePairKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handlePairJoin()
  }

  const handleClearSecretKey = async () => {
    if (!confirm('Are you sure you want to clear your pair secret key? You will lose access to all pair sessions on this device.')) return
    try {
      await clearPairSecretKey()
      setMode('mode-select')
    } catch (err) {
      console.error('Failed to clear secret key:', err)
      setPairError('Failed to clear secret key')
    }
  }

  const copySecret = async () => {
    if (!newPadData) return

    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = null
    }

    setCopied(false)
    setCopyError(false)

    try {
      await navigator.clipboard.writeText(newPadData.secret)
      setCopied(true)
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false)
        copyTimeoutRef.current = null
      }, 3000)
    } catch (error) {
      console.error('Failed to copy:', error)
      setCopyError(true)
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
              onClick={() => setMode('sender-receiver')}
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

  if (mode === 'pair-setup') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-8 max-w-lg w-full mx-4">
          <h2 className="text-2xl font-bold text-white mb-4">Pair Mode Setup</h2>
          <p className="text-gray-300 mb-4">
            You need a secret key for pair mode. Generate a new one or import an existing one.
          </p>

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => { setPairSetupTab('generate'); setPairSetupError('') }}
              className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${pairSetupTab === 'generate' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              Generate
            </button>
            <button
              onClick={() => { setPairSetupTab('import'); setPairSetupError('') }}
              className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${pairSetupTab === 'import' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              Import
            </button>
          </div>

          {pairSetupTab === 'generate' && (
            <div className="space-y-4">
              {!generatedEncodedKey ? (
                <button
                  onClick={handlePairSetupGenerate}
                  disabled={isPairSetupProcessing}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white font-medium py-3 px-4 rounded transition-colors"
                >
                  {isPairSetupProcessing ? 'Generating...' : 'Generate Secret Key'}
                </button>
              ) : (
                <>
                  <div className="bg-gray-900 p-4 rounded flex items-center justify-between gap-2">
                    <code className="text-sm font-mono text-purple-300 break-all select-all">{generatedEncodedKey}</code>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(generatedEncodedKey)
                          setCopiedEncodedKey(true)
                          setTimeout(() => setCopiedEncodedKey(false), 2000)
                        } catch (err) {
                          console.error('Failed to copy:', err)
                        }
                      }}
                      className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors shrink-0"
                    >
                      {copiedEncodedKey ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-gray-400 text-sm">Save this key somewhere safe. You'll need it to pair on other devices.</p>
                  {pairSetupError && <p className="text-red-400 text-xs">{pairSetupError}</p>}
                  <button
                    onClick={handlePairSetupConfirmGenerate}
                    disabled={isPairSetupProcessing}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:text-green-400 text-white font-medium py-3 px-4 rounded transition-colors"
                  >
                    {isPairSetupProcessing ? 'Saving...' : 'Confirm & Continue'}
                  </button>
                </>
              )}
            </div>
          )}

          {pairSetupTab === 'import' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Enter your {SECRET_KEY_ENCODED_LENGTH}-character secret key
                </label>
                <input
                  type="text"
                  value={pairSetupImportInput}
                  onChange={(e) => { setPairSetupImportInput(e.target.value); setPairSetupError('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handlePairSetupImport() }}
                  placeholder={`${SECRET_KEY_ENCODED_LENGTH}-character secret key`}
                  className="w-full px-3 py-2 bg-gray-700 text-gray-100 rounded text-sm font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  maxLength={SECRET_KEY_ENCODED_LENGTH}
                />
                {pairSetupError && <p className="text-red-400 text-xs mt-1">{pairSetupError}</p>}
              </div>
              <button
                onClick={handlePairSetupImport}
                disabled={isPairSetupProcessing}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:text-purple-400 text-white font-medium py-3 px-4 rounded transition-colors"
              >
                {isPairSetupProcessing ? 'Importing...' : 'Import & Continue'}
              </button>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setMode('mode-select')}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'pair') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-8 max-w-lg w-full mx-4">
          <h2 className="text-2xl font-bold text-white mb-4">Pair Mode</h2>

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => { setPairTab('create'); setPairError('') }}
              className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${pairTab === 'create' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              Create Pair
            </button>
            <button
              onClick={() => { setPairTab('join'); setPairError('') }}
              className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${pairTab === 'join' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              Join Pair
            </button>
          </div>

          {pairTab === 'create' && (
            <div className="space-y-4">
              {!generatedCode ? (
                <button
                  onClick={handlePairGenerate}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded transition-colors"
                >
                  Generate Code
                </button>
              ) : (
                <>
                  <div className="bg-gray-900 p-4 rounded flex items-center justify-between gap-2">
                    <code className="text-sm font-mono text-purple-300 break-all select-all">{generatedCode}</code>
                    <button
                      onClick={handlePairCopyCode}
                      className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors shrink-0"
                    >
                      {copiedCode ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-gray-400 text-sm">Share this code with your partner, then click Start.</p>
                  {pairError && <p className="text-red-400 text-xs">{pairError}</p>}
                  <button
                    onClick={handlePairStartCreator}
                    disabled={isPairProcessing}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:text-green-400 text-white font-medium py-3 px-4 rounded transition-colors"
                  >
                    {isPairProcessing ? 'Starting...' : 'Start'}
                  </button>
                </>
              )}
            </div>
          )}

          {pairTab === 'join' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Enter pair code
                </label>
                <input
                  ref={pairJoinInputRef}
                  type="text"
                  value={pairJoinInput}
                  onChange={(e) => { setPairJoinInput(e.target.value); setPairError('') }}
                  onKeyDown={handlePairKeyDown}
                  placeholder={`${PAIR_CODE_LENGTH}-character code`}
                  className="w-full px-3 py-2 bg-gray-700 text-gray-100 rounded text-sm font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  maxLength={PAIR_CODE_LENGTH}
                />
                {pairError && <p className="text-red-400 text-xs mt-1">{pairError}</p>}
              </div>
              <button
                onClick={handlePairJoin}
                disabled={isPairProcessing}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:text-purple-400 text-white font-medium py-3 px-4 rounded transition-colors"
              >
                {isPairProcessing ? 'Joining...' : 'Join'}
              </button>
            </div>
          )}

          {pairSessions.length > 0 && (
            <div className="pt-4 mt-4 border-t border-gray-700">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Saved Pair Sessions</h3>
              <div className="space-y-2">
                {pairSessions.map((ps) => (
                  <div key={ps.pairCode} className="flex items-center justify-between bg-gray-700 rounded px-3 py-2">
                    <div>
                      <span className="text-sm font-mono text-purple-300">[{ps.pairCode}]</span>
                      <span className="text-xs text-gray-400 ml-2">
                        {new Date(ps.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          navigateTo('/p/' + ps.pairCode)
                          onSessionStarted()
                        }}
                        className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
                      >
                        Resume
                      </button>
                      <button
                        onClick={async () => {
                          await clearPairSession(ps.pairCode)
                          setPairSessions(prev => prev.filter(s => s.pairCode !== ps.pairCode))
                        }}
                        className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-gray-300 rounded transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clear secret key */}
          <div className="pt-4 mt-4 border-t border-gray-700">
            {pairFingerprint && (
              <p className="text-xs font-mono text-gray-400 mb-2">
                Secret key fingerprint: {pairFingerprint.slice(0, 5)}-{pairFingerprint.slice(5)}
              </p>
            )}
            {pairError && !generatedCode && pairTab === 'create' && <p className="text-red-400 text-xs mb-2">{pairError}</p>}
            <button
              onClick={handleClearSecretKey}
              className="w-full px-3 py-2 text-xs bg-red-900 hover:bg-red-800 text-red-300 rounded transition-colors"
            >
              Clear Secret Key
            </button>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setMode('mode-select')}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'sender-receiver') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4">
          <h2 className="text-2xl font-bold text-white mb-4">Sender / Receiver</h2>
          <p className="text-gray-300 mb-6">
            Choose how to start your session:
          </p>
          {sessionEndedByRemote && (
            <div className="bg-yellow-900/50 border border-yellow-600 rounded-lg p-3 mb-4">
              <p className="text-yellow-200 text-sm">Your saved session was ended by another device.</p>
            </div>
          )}
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
            <button
              onClick={() => setMode('mode-select')}
              className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  // mode === 'mode-select' (default home screen)
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold text-white mb-4">Welcome to NostrPad</h2>
        <p className="text-gray-300 mb-6">
          Choose a mode to get started:
        </p>
        <div className="space-y-3">
          <button
            onClick={() => setMode('sender-receiver')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-4 px-4 rounded-lg transition-colors text-lg"
          >
            Sender / Receiver
          </button>
          <button
            onClick={handlePairModeClick}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-4 px-4 rounded-lg transition-colors text-lg"
          >
            Pair Mode
          </button>
          <div className="pt-4 border-t border-gray-700">
            <p className="text-gray-400 text-xs italic text-center">
              Note: NostrPad is designed for temporary sharing rather than long-term storage. Sessions and data are ephemeral and may be purged periodically. Always have a backup of your data that you want to keep elsewhere.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
