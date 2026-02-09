import { generatePairCode, isValidPairCode, derivePairKeys } from './keys'
import { getPairSecretKey, createPairSession } from './pairSessionStorage'
import { navigateTo } from './navigation'
import { PAIR_CODE_LENGTH } from './constants'

export function validatePairCode(code: string): string | null {
  if (!code) return 'Please enter a pair code'
  if (code.length !== PAIR_CODE_LENGTH) return `Code must be ${PAIR_CODE_LENGTH} characters (got ${code.length})`
  if (!isValidPairCode(code)) return 'Invalid pair code (checksum mismatch — check for typos)'
  return null
}

export async function startNewPair(): Promise<string> {
  const result = await getPairSecretKey()
  if (!result) {
    throw new Error('Secret key not found. Please set up your secret key first.')
  }
  const code = generatePairCode()
  const { localPadId, remotePadId } = await derivePairKeys(result.hmacKey, code, 1)
  await createPairSession(localPadId, remotePadId, code, 1)
  try {
    await navigator.clipboard.writeText(code)
  } catch {
    // Clipboard write may fail in some browsers; non-critical
  }
  navigateTo('/p/' + code)
  return code
}

export async function joinExistingPair(code: string): Promise<void> {
  const validationError = validatePairCode(code)
  if (validationError) {
    throw new Error(validationError)
  }
  const result = await getPairSecretKey()
  if (!result) {
    throw new Error('Secret key not found. Please set up your secret key first.')
  }
  const { localPadId, remotePadId } = await derivePairKeys(result.hmacKey, code, 2)
  await createPairSession(localPadId, remotePadId, code, 2)
  navigateTo('/p/' + code)
}
