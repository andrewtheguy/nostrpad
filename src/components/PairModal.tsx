import { useState, useRef, useEffect } from 'react'
import { PAD_ID_LENGTH } from '../lib/constants'

interface PairModalProps {
  padId: string
  onClose: () => void
}

export function PairModal({ padId, onClose }: PairModalProps) {
  const [copiedOwn, setCopiedOwn] = useState(false)
  const [partnerInput, setPartnerInput] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const copyOwnPadId = async () => {
    try {
      await navigator.clipboard.writeText(padId)
      setCopiedOwn(true)
      setTimeout(() => setCopiedOwn(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const extractPadId = (input: string): string => {
    const trimmed = input.trim()
    // If input contains a hash, extract padId from URL
    const hashIndex = trimmed.indexOf('#')
    if (hashIndex !== -1) {
      const afterHash = trimmed.slice(hashIndex + 1)
      // Take the first segment before any colon
      const colonIndex = afterHash.indexOf(':')
      return colonIndex === -1 ? afterHash : afterHash.slice(0, colonIndex)
    }
    return trimmed
  }

  const handleSubmit = () => {
    const remotePadId = extractPadId(partnerInput)

    if (!remotePadId) {
      setError('Please enter a pad ID')
      return
    }

    if (remotePadId.length !== PAD_ID_LENGTH) {
      setError(`Pad ID must be ${PAD_ID_LENGTH} characters (got ${remotePadId.length})`)
      return
    }

    if (remotePadId === padId) {
      setError('Cannot pair with your own pad')
      return
    }

    window.location.hash = `${padId}:split:${remotePadId}`
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-white mb-4">Pair Pads</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Your Pad ID (share this with your partner)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={padId}
                className="flex-1 px-3 py-2 bg-gray-700 text-gray-100 rounded text-sm font-mono"
              />
              <button
                onClick={copyOwnPadId}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm transition-colors"
              >
                {copiedOwn ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Partner's Pad ID or URL
            </label>
            <input
              ref={inputRef}
              type="text"
              value={partnerInput}
              onChange={(e) => { setPartnerInput(e.target.value); setError('') }}
              onKeyDown={handleKeyDown}
              placeholder="Paste pad ID or full URL"
              className="w-full px-3 py-2 bg-gray-700 text-gray-100 rounded text-sm font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
          >
            Start Pair
          </button>
        </div>
      </div>
    </div>
  )
}
