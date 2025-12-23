import { useState } from 'react'
import { ShareModal } from './ShareModal'

interface HeaderProps {
  isConnected: boolean
  isSaving: boolean
  canEdit: boolean
  lastSaved: Date | null
  padId: string
  secret: string | null
}

export function Header({ isConnected, isSaving, canEdit, lastSaved, padId, secret }: HeaderProps) {
  const [showShareModal, setShowShareModal] = useState(false)

  const formatLastSaved = (date: Date | null) => {
    if (!date) return null
    return date.toLocaleTimeString()
  }

  return (
    <>
      <header className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-white">NostrPad</h1>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'
              }`}
              title={isConnected ? 'Connected' : 'Connecting...'}
            />
            <span className="text-xs text-gray-400">
              {isConnected ? 'Connected' : 'Connecting...'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {isSaving && (
            <span className="text-xs text-blue-400">Saving...</span>
          )}
          {!isSaving && lastSaved && (
            <span className="text-xs text-gray-500">
              Saved at {formatLastSaved(lastSaved)}
            </span>
          )}
          {!canEdit && (
            <span className="text-xs text-yellow-500">View Only</span>
          )}
          <button
            onClick={() => setShowShareModal(true)}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Share
          </button>
        </div>
      </header>

      {showShareModal && (
        <ShareModal
          padId={padId}
          secret={secret}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </>
  )
}
