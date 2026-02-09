import { PAIR_CODE_ALPHABET, PAIR_CODE_DATA_LENGTH, PAIR_CODE_CHECKSUM_LENGTH } from './constants'

const BASE = PAIR_CODE_ALPHABET.length // 32

/**
 * Compute a 2-character Fletcher-style checksum over pair code data.
 * sum1 = running total of alphabet indices mod 32
 * sum2 = running total of sum1 values mod 32
 * This catches single-character errors, most transpositions, and many multi-char errors.
 */
export function computeChecksum(data: string): string {
  let sum1 = 0
  let sum2 = 0
  for (const ch of data) {
    const idx = PAIR_CODE_ALPHABET.indexOf(ch)
    if (idx === -1) throw new Error(`Invalid character in pair code data: "${ch}"`)
    sum1 = (sum1 + idx) % BASE
    sum2 = (sum2 + sum1) % BASE
  }
  return PAIR_CODE_ALPHABET[sum1] + PAIR_CODE_ALPHABET[sum2]
}

/**
 * Generate a random pair code: 8 data chars + 2 checksum chars = 10 total
 */
export function generatePairCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(PAIR_CODE_DATA_LENGTH))
  const data = Array.from(bytes).map(b => PAIR_CODE_ALPHABET[b % BASE]).join('')
  return data + computeChecksum(data)
}

/**
 * Validate a pair code: check length, characters, and checksum
 */
export function validatePairCode(code: string): { valid: boolean; error?: string } {
  const totalLength = PAIR_CODE_DATA_LENGTH + PAIR_CODE_CHECKSUM_LENGTH
  if (code.length !== totalLength) {
    return { valid: false, error: `Code must be ${totalLength} characters (got ${code.length})` }
  }
  for (const ch of code) {
    if (!PAIR_CODE_ALPHABET.includes(ch)) {
      return { valid: false, error: `Invalid character: "${ch}"` }
    }
  }
  const data = code.slice(0, PAIR_CODE_DATA_LENGTH)
  const checksum = code.slice(PAIR_CODE_DATA_LENGTH)
  if (computeChecksum(data) !== checksum) {
    return { valid: false, error: 'Invalid code (checksum mismatch — check for typos)' }
  }
  return { valid: true }
}
