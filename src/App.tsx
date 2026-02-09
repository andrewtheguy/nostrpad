import { useState, useEffect } from 'react'
import { parseUrl } from './lib/keys'
import { PadPage } from './components/PadPage'
import { SplitPadPage } from './components/SplitPadPage'
import { SessionStartModal } from './components/SessionStartModal'

function App() {
  const [route, setRoute] = useState<{ padId: string; isEdit: boolean } | null>(null)
  const [pairRoute, setPairRoute] = useState<{ pairCode: string } | null>(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    const handleRouteChange = () => {
      // 1. Check for pair mode: /p/PAIRCODE
      const pairMatch = window.location.pathname.match(/^\/p\/([^/]+)$/)
      if (pairMatch) {
        setPairRoute({ pairCode: pairMatch[1] })
        setRoute(null)
        setShowModal(false)
        return
      }
      setPairRoute(null)

      // 2. Check for sender/receiver mode: /s#PADID or /s#PADID:rw
      if (window.location.pathname === '/s') {
        const { padId, isEdit } = parseUrl(window.location.hash)
        if (padId) {
          setRoute({ padId, isEdit })
          setShowModal(false)
          return
        }
      }

      // 3. Home
      setShowModal(true)
      setRoute(null)
    }

    // Initial check
    handleRouteChange()

    // Listen for navigation changes (popstate for back/forward, hashchange for hash edits)
    window.addEventListener('popstate', handleRouteChange)
    window.addEventListener('hashchange', handleRouteChange)
    return () => {
      window.removeEventListener('popstate', handleRouteChange)
      window.removeEventListener('hashchange', handleRouteChange)
    }
  }, [])

  const handleSessionStarted = () => {
    setShowModal(false)
  }

  if (pairRoute) {
    return <SplitPadPage pairCode={pairRoute.pairCode} />
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
