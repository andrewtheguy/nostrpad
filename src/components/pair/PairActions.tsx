import { useState, useEffect } from 'react'
import { startNewPair, joinExistingPair } from '../../lib/pairActions'
import { listPairSessions, clearPairSession, clearPairSecretKey } from '../../lib/pairSessionStorage'
import { navigateTo } from '../../lib/navigation'
import { PAIR_CODE_LENGTH } from '../../lib/constants'
import type { PairSessionMetadata } from '../../lib/pairSessionStorage'

interface PairActionsProps {
  fingerprint: string
  onSessionStarted: () => void
  onClearKey: () => void
  onBack: () => void
}

export function PairActions({ fingerprint, onSessionStarted, onClearKey, onBack }: PairActionsProps) {
  const [pairSessions, setPairSessions] = useState<PairSessionMetadata[]>([])
  const [joinInput, setJoinInput] = useState('')
  const [error, setError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    listPairSessions().then(setPairSessions).catch(console.error)
  }, [])

  const handleStartNewPair = async () => {
    if (isProcessing) return
    setIsProcessing(true)
    setError('')
    try {
      await startNewPair()
      onSessionStarted()
    } catch (err) {
      console.error('Failed to start pair session:', err)
      setError(err instanceof Error ? err.message : 'Failed to start pair session')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleJoin = async () => {
    if (isProcessing) return
    const code = joinInput.trim()
    if (!code) {
      setError('Please enter a pair code')
      return
    }
    if (code.length !== PAIR_CODE_LENGTH) {
      setError(`Pair code must be ${PAIR_CODE_LENGTH} characters`)
      return
    }
    setIsProcessing(true)
    setError('')
    try {
      await joinExistingPair(code)
      onSessionStarted()
    } catch (err) {
      console.error('Failed to join pair session:', err)
      setError(err instanceof Error ? err.message : 'Failed to join pair session')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleJoinKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJoin()
  }

  const handleClearSecretKey = async () => {
    if (!confirm('Are you sure you want to clear your pair secret key? You will lose access to all pair sessions on this device.')) return
    try {
      await clearPairSecretKey()
      onClearKey()
    } catch (err) {
      console.error('Failed to clear secret key:', err)
      setError('Failed to clear secret key')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-4">Pair Mode</h2>

        {/* Start New Pair */}
        <button
          onClick={handleStartNewPair}
          disabled={isProcessing}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:text-purple-400 text-white font-medium py-3 px-4 rounded transition-colors mb-4"
        >
          {isProcessing ? 'Starting...' : 'Start New Pair'}
        </button>

        {/* Join a Pair */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            Join a Pair
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={joinInput}
              onChange={(e) => { setJoinInput(e.target.value); setError('') }}
              onKeyDown={handleJoinKeyDown}
              placeholder={`${PAIR_CODE_LENGTH}-character code`}
              className="flex-1 px-3 py-2 bg-gray-700 text-gray-100 rounded text-sm font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              maxLength={PAIR_CODE_LENGTH}
            />
            <button
              onClick={handleJoin}
              disabled={isProcessing}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:text-purple-400 text-white font-medium rounded transition-colors"
            >
              Join
            </button>
          </div>
        </div>

        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </div>

      {/* Saved pair sessions — preserved as-is */}
      {pairSessions.length > 0 && (
        <div className="pt-4 border-t border-gray-700">
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
                      try {
                        await clearPairSession(ps.pairCode)
                        setPairSessions(prev => prev.filter(s => s.pairCode !== ps.pairCode))
                      } catch (err) {
                        console.error('Failed to clear pair session:', err)
                        setError('Failed to clear pair session')
                      }
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

      {/* Fingerprint + Clear Secret Key — preserved as-is */}
      <div className="pt-4 border-t border-gray-700">
        <p className="text-xs font-mono text-gray-400 mb-2">
          Secret key fingerprint: {fingerprint.length >= 5 ? `${fingerprint.slice(0, 5)}-${fingerprint.slice(5)}` : fingerprint || '—'}
        </p>
        <button
          onClick={handleClearSecretKey}
          className="w-full px-3 py-2 text-xs bg-red-900 hover:bg-red-800 text-red-300 rounded transition-colors"
        >
          Clear Secret Key
        </button>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onBack}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  )
}
