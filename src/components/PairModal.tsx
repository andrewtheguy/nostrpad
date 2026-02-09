import { useState, useRef, useEffect } from 'react'
import { generatePairSecret, isValidPairSecret, derivePairKeys } from '../lib/keys'
import { createPairSession } from '../lib/sessionStorage'
import { navigateTo } from '../lib/navigation'
import { ALPHABET, PAIR_SECRET_LENGTH } from '../lib/constants'

interface PairModalProps {
  onClose: () => void
}

export function PairModal({ onClose }: PairModalProps) {
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null)
  const [copiedSecret, setCopiedSecret] = useState(false)
  const [joinInput, setJoinInput] = useState('')
  const [error, setError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const joinInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (tab === 'join') {
      joinInputRef.current?.focus()
    }
  }, [tab])

  const handleGenerate = () => {
    setGeneratedSecret(generatePairSecret())
    setCopiedSecret(false)
  }

  const handleCopySecret = async () => {
    if (!generatedSecret) return
    try {
      await navigator.clipboard.writeText(generatedSecret)
      setCopiedSecret(true)
      setTimeout(() => setCopiedSecret(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleStartCreator = async () => {
    if (!generatedSecret || isProcessing) return
    setIsProcessing(true)
    try {
      const { localSecretKey, localPadId, remotePadId } = derivePairKeys(generatedSecret, 1)
      await createPairSession(localPadId, localSecretKey, remotePadId)
      navigateTo('/p/' + localPadId)
      onClose()
    } catch (err) {
      console.error('Failed to start pair session:', err)
      setError('Failed to start pair session')
      setIsProcessing(false)
    }
  }

  const validateSecret = (secret: string): string | null => {
    if (!secret) return 'Please enter a pair key'
    if (secret.length !== PAIR_SECRET_LENGTH) return `Key must be ${PAIR_SECRET_LENGTH} characters (got ${secret.length})`
    for (const ch of secret) {
      if (!ALPHABET.includes(ch)) return `Invalid character: "${ch}"`
    }
    if (!isValidPairSecret(secret)) return 'Invalid key (checksum mismatch — check for typos)'
    return null
  }

  const handleJoin = async () => {
    if (isProcessing) return
    const secret = joinInput.trim()
    const validationError = validateSecret(secret)
    if (validationError) {
      setError(validationError)
      return
    }
    setIsProcessing(true)
    try {
      const { localSecretKey, localPadId, remotePadId } = derivePairKeys(secret, 2)
      await createPairSession(localPadId, localSecretKey, remotePadId)
      navigateTo('/p/' + localPadId)
      onClose()
    } catch (err) {
      console.error('Failed to join pair session:', err)
      setError('Failed to join pair session')
      setIsProcessing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJoin()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-white mb-4">Pair Mode</h2>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setTab('create'); setError('') }}
            className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${tab === 'create' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            Create Pair
          </button>
          <button
            onClick={() => { setTab('join'); setError('') }}
            className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${tab === 'join' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            Join Pair
          </button>
        </div>

        {tab === 'create' && (
          <div className="space-y-4">
            {!generatedSecret ? (
              <button
                onClick={handleGenerate}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded transition-colors"
              >
                Generate Key
              </button>
            ) : (
              <>
                <div className="bg-gray-900 p-4 rounded flex items-center justify-between gap-2">
                  <code className="text-sm font-mono text-purple-300 break-all select-all">{generatedSecret}</code>
                  <button
                    onClick={handleCopySecret}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors shrink-0"
                  >
                    {copiedSecret ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-gray-400 text-sm">Share this key with your partner, then click Start.</p>
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <button
                  onClick={handleStartCreator}
                  disabled={isProcessing}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:text-green-400 text-white font-medium py-3 px-4 rounded transition-colors"
                >
                  {isProcessing ? 'Starting...' : 'Start'}
                </button>
              </>
            )}
          </div>
        )}

        {tab === 'join' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Enter pair key
              </label>
              <input
                ref={joinInputRef}
                type="text"
                value={joinInput}
                onChange={(e) => { setJoinInput(e.target.value); setError('') }}
                onKeyDown={handleKeyDown}
                placeholder={`${PAIR_SECRET_LENGTH}-character key`}
                className="w-full px-3 py-2 bg-gray-700 text-gray-100 rounded text-sm font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                maxLength={PAIR_SECRET_LENGTH}
              />
              {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
            </div>
            <button
              onClick={handleJoin}
              disabled={isProcessing}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:text-purple-400 text-white font-medium py-3 px-4 rounded transition-colors"
            >
              {isProcessing ? 'Joining...' : 'Join'}
            </button>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
