import { useState, useEffect } from 'react'
import { parseUrl } from './lib/keys'
import { PadPage } from './components/PadPage'
import { SessionStartModal } from './components/SessionStartModal'

function App() {
  const [route, setRoute] = useState<{ padId: string; isEdit: boolean } | null>(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    const handleHashChange = () => {
      const { padId, isEdit } = parseUrl(window.location.hash)

      if (!padId) {
        setShowModal(true)
        setRoute(null)
        return
      }

      setRoute({ padId, isEdit })
      setShowModal(false)
    }

    // Initial check
    handleHashChange()

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const handleSessionStarted = () => {
    setShowModal(false)
    // The hash change will trigger re-parse
  }

  if (showModal) {
    return <SessionStartModal onSessionStarted={handleSessionStarted} />
  }

  if (!route) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  return <PadPage padId={route.padId} isEdit={route.isEdit} />
}

export default App
