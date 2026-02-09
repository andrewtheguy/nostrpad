function getDeviceLabel(): string {
  const ua = navigator.userAgent
  let os = 'Unknown'
  if (/iPad/.test(ua)) os = 'iPad'
  else if (/iPhone/.test(ua)) os = 'iPhone'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/Mac OS X/.test(ua)) os = 'macOS'
  else if (/Windows/.test(ua)) os = 'Windows'
  else if (/Linux/.test(ua)) os = 'Linux'
  else if (/CrOS/.test(ua)) os = 'ChromeOS'

  let browser = ''
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = 'Chrome'
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari'

  return browser ? `${os}/${browser}` : os
}

interface SendPaneHeaderProps {
  localPadId: string
  onPaste: () => void
  onClear: () => void
  pasteStatus: 'idle' | 'pasted' | 'empty'
}

export function SendPaneHeader({ localPadId, onPaste, onClear, pasteStatus }: SendPaneHeaderProps) {
  return (
    <div className="px-4 py-1 bg-green-900/50 border-b border-gray-700 flex items-center gap-2">
      <span className="text-xs font-medium text-green-400">Send</span>
      {localPadId && (
        <span className="text-xs font-mono text-green-300/70">{localPadId} · {getDeviceLabel()}</span>
      )}
      <span className="flex-1" />
      <button
        onClick={onPaste}
        className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
        title="Replace content with clipboard"
      >
        {pasteStatus === 'pasted' ? 'Pasted!' : pasteStatus === 'empty' ? 'Clipboard empty' : 'Paste'}
      </button>
      <button
        onClick={onClear}
        className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
        title="Clear send pane"
      >
        Clear
      </button>
    </div>
  )
}
