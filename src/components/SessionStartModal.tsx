import { useState } from 'react'
import { createNewPad } from '../lib/keys'
import { createAndStoreSession } from '../lib/sessionStorage'

interface SessionStartModalProps {
  onSessionStarted: () => void
}

export function SessionStartModal({ onSessionStarted }: SessionStartModalProps) {
  const [isCreating, setIsCreating] = useState(false)

  const handleStartSession = async () => {
    setIsCreating(true)
    try {
      const newPad = createNewPad()
      await createAndStoreSession(newPad.padId, newPad.secretKey)
      window.location.hash = newPad.padId
      onSessionStarted()
    } catch (error) {
      console.error('Failed to start session:', error)
      // TODO: show error message
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold text-white mb-4">Welcome to NostrPad</h2>
        <p className="text-gray-300 mb-6">
          Start a new session to create and edit collaborative notes on Nostr.
        </p>
        <button
          onClick={handleStartSession}
          disabled={isCreating}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-4 rounded-lg transition-colors"
        >
          {isCreating ? 'Creating Session...' : 'Start New Session'}
        </button>
      </div>
    </div>
  )
}