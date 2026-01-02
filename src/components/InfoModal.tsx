interface InfoModalProps {
  onClose: () => void
}

export function InfoModal({ onClose }: InfoModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-white mb-3">Encryption Info</h2>
        <p className="text-sm text-gray-300 mb-3">
          Pad content is encrypted using NIP-44 with a key derived from the pad ID.
          Anyone with the view-only link can decrypt and read the content.
        </p>
        <p className="text-xs text-gray-500 mb-6">
          Treat pad IDs as shareable identifiers, not secrets.
        </p>
        <div className="flex justify-end">
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
