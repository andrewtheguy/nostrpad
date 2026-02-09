import { useState, useCallback, useRef, useEffect } from 'react'

interface ReceivePaneHeaderProps {
  remotePadId: string
  remoteContent: string
}

export function ReceivePaneHeader({ remotePadId, remoteContent }: ReceivePaneHeaderProps) {
  const [copiedRemote, setCopiedRemote] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const handleCopyRemote = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(remoteContent)
      setCopiedRemote(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        if (mountedRef.current) setCopiedRemote(false)
      }, 1000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }, [remoteContent])

  return (
    <div className="px-4 py-1 bg-blue-900/50 border-b border-gray-700 flex items-center gap-2">
      <span className="text-xs font-medium text-blue-400">Receive</span>
      {remotePadId && (
        <span className="text-xs font-mono text-blue-300/70">{remotePadId}</span>
      )}
      <span className="flex-1" />
      <button
        onClick={handleCopyRemote}
        className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
        title="Copy received content"
      >
        {copiedRemote ? 'Copied!' : 'Copy'}
      </button>
    </div>
  )
}
