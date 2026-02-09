import { useState, useRef, useEffect } from 'react'
import { generateSecretKey } from 'nostr-tools/pure'
import { encodeSecretKey, decodeSecretKey, isValidSecretKeyEncoding } from '../../lib/keys'
import { storePairSecretKey, getPairSecretKey } from '../../lib/pairSessionStorage'
import { SECRET_KEY_ENCODED_LENGTH } from '../../lib/constants'

interface PairKeySetupProps {
  onComplete: (fingerprint: string) => void
  onBack: () => void
}

export function PairKeySetup({ onComplete, onBack }: PairKeySetupProps) {
  const [view, setView] = useState<'choose' | 'generated' | 'import'>('choose')
  const [generatedEncodedKey, setGeneratedEncodedKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)
  const [importInput, setImportInput] = useState('')
  const [error, setError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  const handleCreateNewKey = () => {
    setError('')
    try {
      const sk = generateSecretKey()
      const encoded = encodeSecretKey(sk)
      setGeneratedEncodedKey(encoded)
      setView('generated')
    } catch (err) {
      console.error('Failed to generate secret key:', err)
      setError('Failed to generate secret key')
    }
  }

  const handleCopyKey = async () => {
    if (!generatedEncodedKey) return
    try {
      await navigator.clipboard.writeText(generatedEncodedKey)
      setCopiedKey(true)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => {
        setCopiedKey(false)
        copyTimeoutRef.current = null
      }, 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleConfirmGenerate = async () => {
    if (!generatedEncodedKey) return
    setIsProcessing(true)
    setError('')
    try {
      const sk = decodeSecretKey(generatedEncodedKey)
      await storePairSecretKey(sk)
      const result = await getPairSecretKey()
      if (!result) throw new Error('Failed to retrieve stored key')
      onComplete(result.fingerprint)
    } catch (err) {
      console.error('Failed to store pair secret key:', err)
      setError('Failed to store secret key')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleImport = async () => {
    const input = importInput.trim()
    setError('')
    if (!input) {
      setError('Please enter a secret key')
      return
    }
    if (!isValidSecretKeyEncoding(input)) {
      setError('Invalid secret key (check length, characters, and checksum)')
      return
    }
    setIsProcessing(true)
    try {
      const sk = decodeSecretKey(input)
      await storePairSecretKey(sk)
      const result = await getPairSecretKey()
      if (!result) throw new Error('Failed to retrieve stored key')
      onComplete(result.fingerprint)
    } catch (err) {
      console.error('Failed to import pair secret key:', err)
      setError('Failed to import secret key')
    } finally {
      setIsProcessing(false)
    }
  }

  if (view === 'generated' && generatedEncodedKey) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-8 max-w-lg w-full mx-4">
          <h2 className="text-2xl font-bold text-white mb-4">Pair Mode Setup</h2>
          <p className="text-gray-300 mb-4">
            Your new key has been generated. Save it somewhere safe — you'll need it to pair on other devices.
          </p>
          <div className="bg-gray-900 p-4 rounded flex items-center justify-between gap-2 mb-4">
            <code className="text-sm font-mono text-purple-300 break-all select-all">{generatedEncodedKey}</code>
            <button
              onClick={handleCopyKey}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors shrink-0"
            >
              {copiedKey ? 'Copied!' : 'Copy'}
            </button>
          </div>
          {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => { setView('choose'); setGeneratedEncodedKey(null); setError('') }}
              disabled={isProcessing}
              className="flex-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-500 text-white font-medium py-3 px-4 rounded transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleConfirmGenerate}
              disabled={isProcessing}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:text-green-400 text-white font-medium py-3 px-4 rounded transition-colors"
            >
              {isProcessing ? 'Saving...' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'import') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-8 max-w-lg w-full mx-4">
          <h2 className="text-2xl font-bold text-white mb-4">Pair Mode Setup</h2>
          <p className="text-gray-300 mb-4">
            Enter your {SECRET_KEY_ENCODED_LENGTH}-character secret key to import it.
          </p>
          <div className="relative mb-4">
            <input
              type={showSecret ? 'text' : 'password'}
              value={importInput}
              onChange={(e) => { setImportInput(e.target.value); setError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleImport() }}
              placeholder={`${SECRET_KEY_ENCODED_LENGTH}-character secret key`}
              className="w-full px-3 py-2 pr-16 bg-gray-700 text-gray-100 rounded text-sm font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              maxLength={SECRET_KEY_ENCODED_LENGTH}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowSecret(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs text-gray-400 hover:text-white transition-colors"
            >
              {showSecret ? 'Hide' : 'Show'}
            </button>
          </div>
          {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => { setView('choose'); setImportInput(''); setError('') }}
              disabled={isProcessing}
              className="flex-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-500 text-white font-medium py-3 px-4 rounded transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={isProcessing}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:text-purple-400 text-white font-medium py-3 px-4 rounded transition-colors"
            >
              {isProcessing ? 'Importing...' : 'Import & Continue'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // view === 'choose' — two action cards
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-8 max-w-lg w-full mx-4">
        <h2 className="text-2xl font-bold text-white mb-4">Pair Mode Setup</h2>
        <p className="text-gray-300 mb-6">
          You need a secret key for pair mode. Choose an option below.
        </p>
        {error && <p className="text-red-400 text-xs mb-4">{error}</p>}
        <div className="space-y-3">
          <button
            onClick={handleCreateNewKey}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-4 px-4 rounded-lg transition-colors text-left"
          >
            <span className="block text-base font-semibold">Create New Key</span>
            <span className="block text-sm text-purple-200 mt-1">Generate a fresh secret key for pair mode</span>
          </button>
          <button
            onClick={() => { setView('import'); setError('') }}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-4 px-4 rounded-lg transition-colors text-left"
          >
            <span className="block text-base font-semibold">I Already Have a Key</span>
            <span className="block text-sm text-gray-300 mt-1">Import an existing secret key from another device</span>
          </button>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={onBack}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  )
}
