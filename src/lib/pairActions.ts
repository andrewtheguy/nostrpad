import { generatePairCode, isValidPairCode, derivePairKeys } from './keys'
import { getPairSecretKey, createPairSession } from './pairSessionStorage'
import { navigateTo } from './navigation'
import { PAIR_CODE_LENGTH, PAIR_ROLE_INITIATOR, PAIR_ROLE_JOINER } from './constants'

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
  const { localPadId, remotePadId } = await derivePairKeys(result.hmacKey, code, PAIR_ROLE_INITIATOR)
  await createPairSession(localPadId, remotePadId, code, PAIR_ROLE_INITIATOR)
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
  const { localPadId, remotePadId } = await derivePairKeys(result.hmacKey, code, PAIR_ROLE_JOINER)
  await createPairSession(localPadId, remotePadId, code, PAIR_ROLE_JOINER)
  navigateTo('/p/' + code)
}
