import { useState, useRef, useEffect } from 'react'
import { generatePairCode, validatePairCode } from '../lib/pairCode'
import { navigateTo } from '../lib/navigation'
import { PAIR_CODE_LENGTH } from '../lib/constants'

interface PairModalProps {
  onClose: () => void
}

export function PairModal({ onClose }: PairModalProps) {
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const [joinInput, setJoinInput] = useState('')
  const [error, setError] = useState('')
  const joinInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (tab === 'join') {
      joinInputRef.current?.focus()
    }
  }, [tab])

  const handleGenerate = () => {
    setGeneratedCode(generatePairCode())
    setCopiedCode(false)
  }

  const handleCopyCode = async () => {
    if (!generatedCode) return
    try {
      await navigator.clipboard.writeText(generatedCode)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleStartCreator = () => {
    if (!generatedCode) return
    navigateTo('/p/' + generatedCode + '/1')
    onClose()
  }

  const handleJoin = () => {
    const code = joinInput.trim().toLowerCase()
    const result = validatePairCode(code)
    if (!result.valid) {
      setError(result.error || 'Invalid code')
      return
    }
    navigateTo('/p/' + code + '/2')
    onClose()
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
            {!generatedCode ? (
              <button
                onClick={handleGenerate}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded transition-colors"
              >
                Generate Code
              </button>
            ) : (
              <>
                <div className="bg-gray-900 p-4 rounded flex items-center justify-between gap-2">
                  <code className="text-2xl font-mono text-purple-300 tracking-widest">{generatedCode}</code>
                  <button
                    onClick={handleCopyCode}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
                  >
                    {copiedCode ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-gray-400 text-sm">Share this code with your partner, then click Start.</p>
                <button
                  onClick={handleStartCreator}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded transition-colors"
                >
                  Start
                </button>
              </>
            )}
          </div>
        )}

        {tab === 'join' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Enter pair code
              </label>
              <input
                ref={joinInputRef}
                type="text"
                value={joinInput}
                onChange={(e) => { setJoinInput(e.target.value.toLowerCase()); setError('') }}
                onKeyDown={handleKeyDown}
                placeholder={`${PAIR_CODE_LENGTH}-character code`}
                className="w-full px-3 py-2 bg-gray-700 text-gray-100 rounded text-lg font-mono tracking-widest placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                maxLength={PAIR_CODE_LENGTH}
              />
              {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
            </div>
            <button
              onClick={handleJoin}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded transition-colors"
            >
              Join
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
