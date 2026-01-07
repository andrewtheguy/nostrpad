import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { generateShareUrl } from '../lib/keys'

interface ShareModalProps {
  padId: string
  onClose: () => void
}

export function ShareModal({ padId, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const shareUrl = generateShareUrl(padId)

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, shareUrl, {
        width: 160,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      })
    }
  }, [shareUrl])

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
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
              Share URL
            </label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 px-3 py-2 bg-gray-700 text-gray-100 rounded text-sm font-mono"
              />
              <button
                onClick={copyToClipboard}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Share this link with anyone who should view the pad. Edit access requires starting a session.
            </p>
            <div className="flex justify-center">
              <canvas ref={canvasRef} className="rounded" />
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
