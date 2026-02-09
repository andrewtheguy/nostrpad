import { useState, useRef, useEffect } from 'react'

interface WaitingForPartnerProps {
  pairCode: string
}

export function WaitingForPartner({ pairCode }: WaitingForPartnerProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const codeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const resetStatus = (delay: number) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      if (mountedRef.current) setCopyStatus('idle')
    }, delay)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pairCode)
      setCopyStatus('copied')
      resetStatus(2000)
    } catch {
      // Fallback: select the hidden input so the user can Ctrl+C / Cmd+C
      if (codeInputRef.current) {
        codeInputRef.current.select()
      }
      setCopyStatus('failed')
      resetStatus(3000)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-900/50">
      <div className="text-center px-4">
        {/* Animated pulse indicator */}
        <div className="flex justify-center mb-4">
          <span className="relative flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-purple-500"></span>
          </span>
        </div>

        <p className="text-gray-300 text-lg mb-4">Waiting for partner...</p>

        {/* Pair code display */}
        <div className="inline-flex items-center gap-3 bg-gray-800 rounded-lg px-6 py-3 mb-3">
          <code className="text-2xl font-mono text-purple-300 tracking-widest">{pairCode}</code>
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
          >
            {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'failed' ? 'Select & copy' : 'Copy'}
          </button>
        </div>

        {/* Hidden selectable input as clipboard fallback */}
        {copyStatus === 'failed' && (
          <div className="mb-2">
            <input
              ref={codeInputRef}
              type="text"
              readOnly
              value={pairCode}
              className="px-3 py-1 bg-gray-700 text-purple-300 font-mono text-center rounded text-sm w-40 select-all focus:outline-none focus:ring-2 focus:ring-purple-500"
              onFocus={(e) => e.target.select()}
            />
            <p className="text-yellow-400 text-xs mt-1">Copy failed — select the code above and copy manually</p>
          </div>
        )}

        <p className="text-gray-500 text-sm">Share this code with your partner</p>
      </div>
    </div>
  )
}
