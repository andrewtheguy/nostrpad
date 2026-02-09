import { useState, useEffect } from 'react'
import { parseUrl } from './lib/keys'
import { PadPage } from './components/PadPage'
import { SplitPadPage } from './components/SplitPadPage'
import { SessionStartModal } from './components/SessionStartModal'

function App() {
  const [route, setRoute] = useState<{ padId: string; isEdit: boolean } | null>(null)
  const [pairRoute, setPairRoute] = useState<{ padId: string } | null>(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    const handleRouteChange = () => {
      // 1. Check for pair mode: /p/PADID
      const pairMatch = window.location.pathname.match(/^\/p\/([^/]+)$/)
      if (pairMatch) {
        setPairRoute({ padId: pairMatch[1] })
        setRoute(null)
        setShowModal(false)
        return
      }
      setPairRoute(null)

      // 2. Check for pad mode: /s/PADID or /s/PADID/rw
      const { padId, isEdit } = parseUrl(window.location.pathname)
      if (padId) {
        setRoute({ padId, isEdit })
        setShowModal(false)
        return
      }

      // 3. Home
      setShowModal(true)
      setRoute(null)
    }

    // Initial check
    handleRouteChange()

    // Listen for navigation changes
    window.addEventListener('popstate', handleRouteChange)
    return () => {
      window.removeEventListener('popstate', handleRouteChange)
    }
  }, [])

  const handleSessionStarted = () => {
    setShowModal(false)
  }

  if (pairRoute) {
    return <SplitPadPage padId={pairRoute.padId} />
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
