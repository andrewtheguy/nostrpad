import { useState, useEffect } from 'react'
import { getPairSecretKey } from '../lib/pairSessionStorage'
import { PairActions } from './pair/PairActions'

interface PairModalProps {
  onClose: () => void
}

export function PairModal({ onClose }: PairModalProps) {
  const [fingerprint, setFingerprint] = useState<string | null>(null)

  useEffect(() => {
    getPairSecretKey().then(result => {
      setFingerprint(result?.fingerprint ?? null)
    }).catch(console.error)
  }, [])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <PairActions
          fingerprint={fingerprint ?? ''}
          onSessionStarted={onClose}
          onClearKey={onClose}
          onBack={onClose}
        />
      </div>
    </div>
  )
}
