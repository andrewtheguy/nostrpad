import { useState } from 'react'
import { ShareModal } from './ShareModal'
import { createNewPad } from '../lib/keys'

interface HeaderProps {
  isSaving: boolean
  canEdit: boolean
  lastSaved: Date | null
  padId: string
  secret: string | null
}

export function Header({ isSaving, canEdit, lastSaved, padId, secret }: HeaderProps) {
  const [showShareModal, setShowShareModal] = useState(false)

  const formatLastSaved = (date: Date | null) => {
    if (!date) return null
    return date.toLocaleTimeString()
  }

  const handleNewPad = () => {
    const { padId: newPadId, secret: newSecret } = createNewPad()
    window.location.hash = `${newPadId}:${newSecret}`
    window.location.reload()
  }

  return (
    <>
      <header className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-white">NostrPad</h1>
          <button
            onClick={handleNewPad}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
          >
            + New
          </button>
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
