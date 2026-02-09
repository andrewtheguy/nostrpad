import { useState } from 'react'

interface WaitingForPartnerProps {
  pairCode: string
}

export function WaitingForPartner({ pairCode }: WaitingForPartnerProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pairCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-900/50">
      <div className="text-center px-4">
        {/* Animated pulse indicator */}
        <div className="flex justify-center mb-4">
          <span className="relative flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-purple-500"></span>
          </span>
        </div>

        <p className="text-gray-300 text-lg mb-4">Waiting for partner...</p>

        {/* Pair code display */}
        <div className="inline-flex items-center gap-3 bg-gray-800 rounded-lg px-6 py-3 mb-3">
          <code className="text-2xl font-mono text-purple-300 tracking-widest">{pairCode}</code>
          <button
            onClick={handleCopy}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <p className="text-gray-500 text-sm">Share this code with your partner</p>
      </div>
    </div>
  )
}
