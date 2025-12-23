interface EditorProps {
  content: string
  onChange: (content: string) => void
  readOnly: boolean
}

export function Editor({ content, onChange, readOnly }: EditorProps) {
  return (
    <div className="relative flex-1 flex flex-col">
      <textarea
        className="flex-1 w-full p-4 bg-gray-900 text-gray-100 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 border-0"
        value={content}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder={readOnly ? "Waiting for content..." : "Start typing..."}
        spellCheck={false}
      />
      {readOnly && (
        <div className="absolute top-2 right-2 px-2 py-1 bg-yellow-600 text-yellow-100 text-xs font-medium rounded">
          Read Only
        </div>
      )}
    </div>
  )
}
