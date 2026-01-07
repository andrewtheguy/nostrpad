import { useState } from 'react'
import { MAX_CONTENT_LENGTH, BOOTSTRAP_RELAYS } from '../lib/constants'
import { formatCrc32 } from '../utils/crc32'

interface FooterProps {
  content: string
  relayStatus: Map<string, boolean>
  activeRelays: string[]
  isDiscovering: boolean
}

export function Footer({
  content,
  relayStatus,
  activeRelays,
  isDiscovering
}: FooterProps) {
  const characterCount = content.length
  const [expanded, setExpanded] = useState(false)

  const isOverLimit = characterCount > MAX_CONTENT_LENGTH
  const isNearLimit = characterCount > MAX_CONTENT_LENGTH * 0.9

  // Count connected relays
  const getRelayConnected = (relay: string): boolean => {
    for (const [url, status] of relayStatus.entries()) {
      if (url.includes(relay.replace('wss://', '')) || relay.includes(url.replace('wss://', ''))) {
        return status
      }
    }
    return relayStatus.get(relay) ?? false
  }

  const connectedCount = activeRelays.filter(r => getRelayConnected(r)).length
  const totalCount = BOOTSTRAP_RELAYS.length

  const getCountColor = () => {
    if (isOverLimit) return 'text-red-400'
    if (isNearLimit) return 'text-yellow-400'
    return 'text-gray-300'
  }

  const getRelayStatusColor = () => {
    if (isDiscovering) return 'text-blue-400'
    if (connectedCount === 0) return 'text-red-400'
    if (connectedCount < totalCount) return 'text-yellow-400'
    return 'text-green-400'
  }


  return (
    <footer className="bg-gray-800 border-t border-gray-700">
      <div className="flex items-center justify-between px-4 py-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className={`flex items-center gap-2 text-xs hover:text-white transition-colors ${getRelayStatusColor()}`}
        >
          <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
          {isDiscovering ? (
            <span>Discovering relays...</span>
          ) : (
            <span>{connectedCount}/{totalCount} relays</span>
          )}
        </button>
        <div className="flex items-center gap-4">
          <span className="text-xs font-mono text-gray-300">{formatCrc32(content)}</span>
          <span className={`text-xs font-mono ${getCountColor()}`}>
            {characterCount.toLocaleString()}/{MAX_CONTENT_LENGTH.toLocaleString()}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-3 space-y-3">
          <div className="space-y-1">
            <div className="text-xs text-gray-500 mb-2">
              Using bootstrap relays
            </div>
            {BOOTSTRAP_RELAYS.map((relay) => {
              const isAvailable = activeRelays.includes(relay)
              const isConnected = isAvailable && getRelayConnected(relay)

              // Red = failed probe, Yellow = available but not connected, Green = connected
              const dotColor = !isAvailable
                ? 'bg-red-500'
                : isConnected
                  ? 'bg-green-500'
                  : 'bg-yellow-500'

              return (
                <div key={relay} className="flex items-center gap-2 text-xs">
                  <div className={`w-2 h-2 rounded-full ${dotColor}`} />
                  <span className="font-mono text-gray-300">{relay}</span>
                </div>
              )
            })}
          </div>

        </div>
      )}
    </footer>
  )
}
