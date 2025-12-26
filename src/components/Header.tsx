import { useState } from 'react'
import { ShareModal } from './ShareModal'
import { createNewPad } from '../lib/keys'

interface HeaderProps {
  isSaving: boolean
  canEdit: boolean
  lastSaved: Date | null
  padId: string
  secret: string | null
  content: string
}

export function Header({ isSaving, canEdit, lastSaved, padId, secret, content }: HeaderProps) {
  const [showShareModal, setShowShareModal] = useState(false)
  const [copied, setCopied] = useState(false)

  const formatLastSaved = (date: Date | null) => {
    if (!date) return null
    return date.toLocaleTimeString()
  }

  const handleNewPad = () => {
    const { padId: newPadId, secret: newSecret } = createNewPad()
    window.location.hash = `${newPadId}:${newSecret}`
    window.location.reload()
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nostrpad-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <header className="flex items-center justify-between px-2 sm:px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <h1 className="text-base sm:text-lg font-semibold text-white">NostrPad</h1>
          {!canEdit && (
            <span className="px-2 py-0.5 text-xs font-medium bg-yellow-600 text-yellow-100 rounded">View Only</span>
          )}
          <button
            onClick={handleNewPad}
            className="px-1.5 sm:px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
          >
            <span className="sm:hidden">+</span>
            <span className="hidden sm:inline">+ New</span>
          </button>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {isSaving && (
            <span className="text-xs text-blue-400">Saving...</span>
          )}
          {!isSaving && lastSaved && (
            <span className="text-xs text-gray-500 hidden sm:inline">
              Saved {formatLastSaved(lastSaved)}
            </span>
          )}
          <button
            onClick={handleCopy}
            className="px-2 py-1 text-xs sm:text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            {copied ? '✓Copied' : 'Copy'}
          </button>
          <button
            onClick={handleDownload}
            className="px-2 py-1 text-xs sm:text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            Download
          </button>
          <button
            onClick={() => setShowShareModal(true)}
            className="px-2 py-1 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
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
