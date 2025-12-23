import { useState } from 'react'
import { MAX_CONTENT_LENGTH, DEFAULT_RELAYS } from '../lib/constants'
import { formatCrc32 } from '../utils/crc32'
import { generateShareUrls } from '../lib/keys'

interface FooterProps {
  content: string
  relayStatus: Map<string, boolean>
  padId: string
  secret: string | null
}

export function Footer({ content, relayStatus, padId, secret }: FooterProps) {
  const characterCount = content.length
  const [expanded, setExpanded] = useState(false)
  const [copiedEditor, setCopiedEditor] = useState(false)

  const { editorUrl } = generateShareUrls(padId, secret || '')

  const copyEditorUrl = async () => {
    try {
      await navigator.clipboard.writeText(editorUrl)
      setCopiedEditor(true)
      setTimeout(() => setCopiedEditor(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const isOverLimit = characterCount > MAX_CONTENT_LENGTH
  const isNearLimit = characterCount > MAX_CONTENT_LENGTH * 0.9

  // Count connected relays - check both the values and our expected relays
  const getRelayConnected = (relay: string): boolean => {
    // Try various URL formats
    for (const [url, status] of relayStatus.entries()) {
      if (url.includes(relay.replace('wss://', '')) || relay.includes(url.replace('wss://', ''))) {
        return status
      }
    }
    return relayStatus.get(relay) ?? false
  }

  const connectedCount = DEFAULT_RELAYS.filter(r => getRelayConnected(r)).length
  const totalCount = DEFAULT_RELAYS.length

  const getCountColor = () => {
    if (isOverLimit) return 'text-red-400'
    if (isNearLimit) return 'text-yellow-400'
    return 'text-gray-300'
  }

  const getRelayStatusColor = () => {
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
          <span>{connectedCount}/{totalCount} relays</span>
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
            {DEFAULT_RELAYS.map((relay) => {
              const isConnected = getRelayConnected(relay)
              return (
                <div key={relay} className="flex items-center gap-2 text-xs">
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="font-mono text-gray-300">{relay}</span>
                </div>
              )
            })}
          </div>

          {secret && (
            <div className="pt-2 border-t border-gray-700">
              <label className="block text-xs text-gray-400 mb-1">Editor URL (keep private)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={editorUrl}
                  className="flex-1 px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs font-mono"
                />
                <button
                  onClick={copyEditorUrl}
                  className="px-2 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded text-xs transition-colors"
                >
                  {copiedEditor ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </footer>
  )
}
