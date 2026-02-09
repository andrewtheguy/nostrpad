import { useState } from 'react'
import { ShareModal } from './ShareModal'
import { InfoModal } from './InfoModal'
import { PairModal } from './PairModal'
import { navigateTo } from '../lib/navigation'
import { clearSession } from '../lib/sessionStorage'
import { clearPairSession } from '../lib/pairSessionStorage'

interface HeaderProps {
  isSaving: boolean
  canEdit: boolean
  lastSaved: Date | null
  padId: string
  content: string
  isLoadingContent?: boolean
  isSplitMode?: boolean
  pairCode?: string
}

export function Header({ isSaving, canEdit, lastSaved, padId, content, isLoadingContent, isSplitMode, pairCode }: HeaderProps) {
  const [showShareModal, setShowShareModal] = useState(false)
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [showPairModal, setShowPairModal] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedPairCode, setCopiedPairCode] = useState(false)

  const formatLastSaved = (date: Date | null) => {
    if (!date) return null
    return date.toLocaleTimeString()
  }

  const handleHome = () => {
    navigateTo('/')
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

  const handleClearSession = async () => {
    if (isSplitMode && pairCode) {
      if (confirm('Are you sure you want to clear this pair session?')) {
        try {
          await clearPairSession(pairCode)
          window.location.href = '/'
        } catch (error) {
          console.error('Failed to clear pair session:', error)
          alert('Failed to clear pair session. Please try again.')
        }
      }
    } else {
      if (confirm('Are you sure you want to clear the session? You will lose access to edit this pad.')) {
        try {
          await clearSession()
          window.location.href = '/'
        } catch (error) {
          console.error('Failed to clear session:', error)
          alert('Failed to clear session. Please try again.')
        }
      }
    }
  }

  return (
    <>
      <header className="flex items-center justify-between px-2 sm:px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <h1 className="text-base sm:text-lg font-semibold text-white">NostrPad</h1>
          <button
            type="button"
            className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-700 text-gray-200 text-xs hover:bg-gray-600"
            title="NostrPad is designed for temporary sharing. Sessions and data are ephemeral."
            onClick={() => setShowInfoModal(true)}
            aria-label="Info"
          >
            i
          </button>
          {isSplitMode && (
            <button
              onClick={async () => {
                if (!pairCode) return
                try {
                  await navigator.clipboard.writeText(pairCode)
                  setCopiedPairCode(true)
                  setTimeout(() => setCopiedPairCode(false), 1500)
                } catch (err) {
                  console.error('Failed to copy pair code:', err)
                }
              }}
              className="px-2 py-0.5 text-xs font-medium bg-purple-600 hover:bg-purple-700 text-purple-100 rounded transition-colors cursor-pointer"
              title={copiedPairCode ? 'Copied!' : 'Click to copy pair code'}
            >
              {copiedPairCode ? 'Copied!' : `Pair${pairCode ? ` [${pairCode}]` : ''}`}
            </button>
          )}
          {!canEdit && !isSplitMode && (
            <span className="px-2 py-0.5 text-xs font-medium bg-yellow-600 text-yellow-100 rounded">View Only</span>
          )}
          <button
            onClick={handleHome}
            className="px-1.5 sm:px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
            title="Home"
          >
            <span className="sm:hidden">🏠</span>
            <span className="hidden sm:inline">Home</span>
          </button>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {isLoadingContent && (
            <span className="text-xs text-yellow-400">Loading...</span>
          )}
          {!isLoadingContent && isSaving && (
            <span className="text-xs text-blue-400">Saving...</span>
          )}
          {!isLoadingContent && !isSaving && lastSaved && (
            <span className="text-xs text-gray-500 hidden sm:inline">
              Saved {formatLastSaved(lastSaved)}
            </span>
          )}
          {!isSplitMode && (
            <>
              <button
                onClick={handleCopy}
                className="px-2 py-1 text-xs sm:text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                title={copied ? 'Copied!' : 'Copy content'}
              >
                <span className="sm:hidden">{copied ? '✓' : '📋'}</span>
                <span className="hidden sm:inline">{copied ? '✓Copied' : 'Copy'}</span>
              </button>
              <button
                onClick={handleDownload}
                className="px-2 py-1 text-xs sm:text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                title="Download content"
              >
                <span className="sm:hidden">⬇️</span>
                <span className="hidden sm:inline">Download</span>
              </button>
            </>
          )}
          <button
            onClick={handleClearSession}
            className="px-2 py-1 text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            title="Clear session"
          >
            <span className="sm:hidden">🗑️</span>
            <span className="hidden sm:inline">Clear Session</span>
          </button>
          {!isSplitMode && (
            <>
              {canEdit && (
                <button
                  onClick={() => setShowPairModal(true)}
                  className="px-2 py-1 text-xs sm:text-sm bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
                >
                  Pair
                </button>
              )}
              <button
                onClick={() => setShowShareModal(true)}
                className="px-2 py-1 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Share
              </button>
            </>
          )}
        </div>
      </header>

      {showShareModal && (
        <ShareModal
          padId={padId}
          onClose={() => setShowShareModal(false)}
        />
      )}
      {showInfoModal && (
        <InfoModal onClose={() => setShowInfoModal(false)} isSplitMode={isSplitMode} />
      )}
      {showPairModal && (
        <PairModal
          onClose={() => setShowPairModal(false)}
        />
      )}
    </>
  )
}
