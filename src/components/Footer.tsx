import { MAX_CONTENT_LENGTH } from '../lib/constants'

interface FooterProps {
  characterCount: number
}

export function Footer({ characterCount }: FooterProps) {
  const isOverLimit = characterCount > MAX_CONTENT_LENGTH
  const isNearLimit = characterCount > MAX_CONTENT_LENGTH * 0.9

  const getCountColor = () => {
    if (isOverLimit) return 'text-red-500'
    if (isNearLimit) return 'text-yellow-500'
    return 'text-gray-400'
  }

  return (
    <footer className="flex items-center justify-end px-4 py-2 bg-gray-800 border-t border-gray-700">
      <span className={`text-xs font-mono ${getCountColor()}`}>
        {characterCount.toLocaleString()}/{MAX_CONTENT_LENGTH.toLocaleString()}
      </span>
    </footer>
  )
}
