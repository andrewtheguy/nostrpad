import { useState, useEffect } from 'react'
import { parseUrl, createNewPad } from './lib/keys'
import { PadPage } from './components/PadPage'

function App() {
  const [route, setRoute] = useState<{ padId: string; secret: string | null } | null>(null)

  useEffect(() => {
    const handleHashChange = () => {
      const { padId, secret } = parseUrl(window.location.hash)

      if (!padId) {
        // No padId - create a new pad
        const newPad = createNewPad()
        window.location.hash = `${newPad.padId}:${newPad.secret}`
        return
      }

      setRoute({ padId, secret })
    }

    // Initial check
    handleHashChange()

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (!route) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Creating new pad...</div>
      </div>
    )
  }

  return <PadPage padId={route.padId} secret={route.secret} />
}

export default App
