import { useState, useRef, useEffect } from 'react'
import { InfoModal } from './InfoModal'
import { clearPairSession } from '../lib/pairSessionStorage'

interface PairHeaderProps {
  isSaving: boolean
  lastSaved: Date | null
  pairCode: string
  isLoadingContent?: boolean
}

export function PairHeader({ isSaving, lastSaved, pairCode, isLoadingContent }: PairHeaderProps) {
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [copiedPairCode, setCopiedPairCode] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  const handleCopyPairCode = async () => {
    try {
      await navigator.clipboard.writeText(pairCode)
      setCopiedPairCode('copied')
    } catch (err) {
      console.error('Failed to copy pair code:', err)
      setCopiedPairCode('failed')
    }
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    copyTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) setCopiedPairCode('idle')
    }, 1500)
  }

  const formatLastSaved = (date: Date | null) => {
    if (!date) return null
    return date.toLocaleTimeString()
  }

  const handleHome = () => {
    window.location.href = '/'
  }

  const handleClearSession = async () => {
    if (confirm('Are you sure you want to clear this pair session?')) {
      try {
        await clearPairSession(pairCode)
        window.location.href = '/'
      } catch (error) {
        console.error('Failed to clear pair session:', error)
        alert('Failed to clear pair session. Please try again.')
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
          <button
            onClick={handleCopyPairCode}
            className="px-2 py-0.5 text-xs font-medium bg-purple-600 hover:bg-purple-700 text-purple-100 rounded transition-colors cursor-pointer"
            title={copiedPairCode === 'copied' ? 'Copied!' : copiedPairCode === 'failed' ? 'Copy failed' : 'Click to copy pair code'}
          >
            {copiedPairCode === 'copied' ? 'Copied!' : copiedPairCode === 'failed' ? 'Copy failed' : `Pair [${pairCode}]`}
          </button>
          <button
            onClick={handleHome}
            className="px-1.5 sm:px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
            title="Home"
            aria-label="Home"
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
          <button
            onClick={handleClearSession}
            className="px-2 py-1 text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            title="Clear session"
            aria-label="Clear session"
          >
            <span className="sm:hidden">🗑️</span>
            <span className="hidden sm:inline">Clear Session</span>
          </button>
        </div>
      </header>

      {showInfoModal && (
        <InfoModal onClose={() => setShowInfoModal(false)} isSplitMode />
      )}
    </>
  )
}
