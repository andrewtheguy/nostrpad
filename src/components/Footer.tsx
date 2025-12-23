import { useState } from 'react'
import { MAX_CONTENT_LENGTH, DEFAULT_RELAYS } from '../lib/constants'

interface FooterProps {
  characterCount: number
  relayStatus: Map<string, boolean>
}

export function Footer({ characterCount, relayStatus }: FooterProps) {
  const [expanded, setExpanded] = useState(false)

  const isOverLimit = characterCount > MAX_CONTENT_LENGTH
  const isNearLimit = characterCount > MAX_CONTENT_LENGTH * 0.9

  const connectedCount = Array.from(relayStatus.values()).filter(Boolean).length
  const totalCount = DEFAULT_RELAYS.length

  const getCountColor = () => {
    if (isOverLimit) return 'text-red-500'
    if (isNearLimit) return 'text-yellow-500'
    return 'text-gray-400'
  }

  const getRelayStatusColor = () => {
    if (connectedCount === 0) return 'text-red-500'
    if (connectedCount < totalCount) return 'text-yellow-500'
    return 'text-green-500'
  }

  return (
    <footer className="bg-gray-800 border-t border-gray-700">
      <div className="flex items-center justify-between px-4 py-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className={`flex items-center gap-2 text-xs hover:text-white transition-colors ${getRelayStatusColor()}`}
        >
          <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
          <span>{connectedCount}/{totalCount} relays</span>
        </button>
        <span className={`text-xs font-mono ${getCountColor()}`}>
          {characterCount.toLocaleString()}/{MAX_CONTENT_LENGTH.toLocaleString()}
        </span>
      </div>

      {expanded && (
        <div className="px-4 pb-3 space-y-1">
          {DEFAULT_RELAYS.map((relay) => {
            const isConnected = relayStatus.get(relay) ?? false
            return (
              <div key={relay} className="flex items-center gap-2 text-xs">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-gray-400 font-mono">{relay}</span>
              </div>
            )
          })}
        </div>
      )}
    </footer>
  )
}
