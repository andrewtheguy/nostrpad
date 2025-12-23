import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { generateShareUrls } from '../lib/keys'

interface ShareModalProps {
  padId: string
  secret: string | null
  onClose: () => void
}

export function ShareModal({ padId, secret, onClose }: ShareModalProps) {
  const [copiedViewer, setCopiedViewer] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const { viewerUrl } = generateShareUrls(padId, secret || '')

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, viewerUrl, {
        width: 160,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      })
    }
  }, [viewerUrl])

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(viewerUrl)
      setCopiedViewer(true)
      setTimeout(() => setCopiedViewer(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-white mb-4">Share Pad</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Viewer URL (Read Only)
            </label>
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <canvas ref={canvasRef} className="rounded" />
              </div>
              <div className="flex-1 flex flex-col justify-center gap-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={viewerUrl}
                    className="flex-1 px-3 py-2 bg-gray-700 text-gray-100 rounded text-sm font-mono"
                  />
                  <button
                    onClick={copyToClipboard}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
                  >
                    {copiedViewer ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  Share this link with anyone who should view the pad
                </p>
              </div>
            </div>
          </div>

        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
