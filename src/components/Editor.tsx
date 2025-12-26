import { MAX_CONTENT_LENGTH } from '../lib/constants'

interface EditorProps {
  content: string
  onChange: (content: string) => void
  readOnly: boolean
}

export function Editor({ content, onChange, readOnly }: EditorProps) {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    // Allow typing but warn if over limit
    if (newContent.length <= MAX_CONTENT_LENGTH) {
      onChange(newContent)
    }
  }

  return (
    <div className="relative flex-1 flex flex-col p-4 min-h-0">
      <div className="relative flex-1 rounded-lg overflow-hidden border border-gray-700">
        <textarea
          className="w-full h-full p-4 bg-gray-900 text-gray-100 font-mono text-base resize-none focus:outline-none border-0"
          value={content}
          onChange={handleChange}
          readOnly={readOnly}
          placeholder={readOnly ? "Waiting for content..." : "Start typing..."}
          spellCheck={false}
        />
      </div>
    </div>
  )
}
