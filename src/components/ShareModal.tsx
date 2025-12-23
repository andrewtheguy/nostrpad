import { useState } from 'react'
import { generateShareUrls } from '../lib/keys'

interface ShareModalProps {
  padId: string
  secret: string | null
  onClose: () => void
}

export function ShareModal({ padId, secret, onClose }: ShareModalProps) {
  const [copiedViewer, setCopiedViewer] = useState(false)
  const [copiedEditor, setCopiedEditor] = useState(false)

  const { viewerUrl, editorUrl } = generateShareUrls(padId, secret || '')

  const copyToClipboard = async (text: string, type: 'viewer' | 'editor') => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'viewer') {
        setCopiedViewer(true)
        setTimeout(() => setCopiedViewer(false), 2000)
      } else {
        setCopiedEditor(true)
        setTimeout(() => setCopiedEditor(false), 2000)
      }
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
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Viewer URL (Read Only)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={viewerUrl}
                className="flex-1 px-3 py-2 bg-gray-700 text-gray-100 rounded text-sm font-mono"
              />
              <button
                onClick={() => copyToClipboard(viewerUrl, 'viewer')}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
              >
                {copiedViewer ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Share this link with anyone who should view the pad
            </p>
          </div>

          {secret && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Editor URL (Full Access)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={editorUrl}
                  className="flex-1 px-3 py-2 bg-gray-700 text-gray-100 rounded text-sm font-mono"
                />
                <button
                  onClick={() => copyToClipboard(editorUrl, 'editor')}
                  className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm transition-colors"
                >
                  {copiedEditor ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-yellow-500 mt-1">
                Warning: Anyone with this link can edit the pad. Keep it private!
              </p>
            </div>
          )}
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
