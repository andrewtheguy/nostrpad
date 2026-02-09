import { describe, it, expect } from 'vitest'
import { computePairSecretChecksum, isValidPairSecret, generatePairSecret, computePairFingerprint } from './keys'
import { ALPHABET, PAIR_SECRET_LENGTH, PAIR_SECRET_DATA_LENGTH, PAIR_FINGERPRINT_LENGTH } from './constants'

describe('computePairSecretChecksum', () => {
  it('returns 2 characters from ALPHABET', () => {
    const data = 'ABCDEFGHJKLMNPQRSTUVWXa'
    const checksum = computePairSecretChecksum(data.slice(0, PAIR_SECRET_DATA_LENGTH))
    expect(checksum.length).toBe(2)
    for (const ch of checksum) {
      expect(ALPHABET).toContain(ch)
    }
  })

  it('is deterministic', () => {
    const data = 'x9f3kABCDEFGHJKLMNPQRST'.slice(0, PAIR_SECRET_DATA_LENGTH)
    const a = computePairSecretChecksum(data)
    const b = computePairSecretChecksum(data)
    expect(a).toBe(b)
  })

  it('differs for different data', () => {
    const a = computePairSecretChecksum('ABCDEFGHJKLMNPQRSTUVWa')
    const b = computePairSecretChecksum('ABCDEFGHJKLMNPQRSTUVWb')
    expect(a).not.toBe(b)
  })
})

describe('generatePairSecret', () => {
  it('returns a secret of PAIR_SECRET_LENGTH (24)', () => {
    const secret = generatePairSecret()
    expect(secret.length).toBe(PAIR_SECRET_LENGTH)
  })

  it('only uses valid ALPHABET characters', () => {
    for (let i = 0; i < 50; i++) {
      const secret = generatePairSecret()
      for (const ch of secret) {
        expect(ALPHABET).toContain(ch)
      }
    }
  })

  it('passes its own checksum validation', () => {
    for (let i = 0; i < 50; i++) {
      expect(isValidPairSecret(generatePairSecret())).toBe(true)
    }
  })
})

describe('isValidPairSecret', () => {
  it('accepts valid generated secrets', () => {
    const secret = generatePairSecret()
    expect(isValidPairSecret(secret)).toBe(true)
  })

  it('rejects wrong length', () => {
    expect(isValidPairSecret('abc')).toBe(false)
    expect(isValidPairSecret('ABCDEFGHJKLMNPQRSTUVWXYZabcde')).toBe(false)
    expect(isValidPairSecret('')).toBe(false)
  })

  it('rejects invalid characters', () => {
    // Characters not in ALPHABET: 0, 1, I, O, l
    const invalid = '0' + 'A'.repeat(PAIR_SECRET_LENGTH - 1)
    expect(isValidPairSecret(invalid)).toBe(false)
  })

  it('detects all single-character substitution errors', () => {
    let detected = 0
    const trials = 100

    for (let t = 0; t < trials; t++) {
      const secret = generatePairSecret()
      const pos = Math.floor(Math.random() * secret.length)
      const original = secret[pos]
      let replacement: string
      do {
        replacement = ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
      } while (replacement === original)

      const corrupted = secret.slice(0, pos) + replacement + secret.slice(pos + 1)
      if (!isValidPairSecret(corrupted)) {
        detected++
      }
    }

    expect(detected).toBe(trials)
  })

  it('detects all transposition errors of different characters', () => {
    let detected = 0
    let tested = 0
    const trials = 200

    for (let t = 0; t < trials; t++) {
      const secret = generatePairSecret()
      const pos = Math.floor(Math.random() * (secret.length - 1))
      if (secret[pos] === secret[pos + 1]) continue

      tested++
      const transposed = secret.slice(0, pos) + secret[pos + 1] + secret[pos] + secret.slice(pos + 2)
      if (!isValidPairSecret(transposed)) {
        detected++
      }
    }

    expect(detected).toBe(tested)
  })
})

describe('computePairFingerprint', () => {
  it('is deterministic: same secret produces same fingerprint', () => {
    const secret = generatePairSecret()
    const a = computePairFingerprint(secret)
    const b = computePairFingerprint(secret)
    expect(a).toBe(b)
  })

  it('returns exactly PAIR_FINGERPRINT_LENGTH (6) valid ALPHABET characters', () => {
    for (let i = 0; i < 20; i++) {
      const fp = computePairFingerprint(generatePairSecret())
      expect(fp.length).toBe(PAIR_FINGERPRINT_LENGTH)
      for (const ch of fp) {
        expect(ALPHABET).toContain(ch)
      }
    }
  })

  it('is role-agnostic: fingerprint depends only on secret, not role', () => {
    const secret = generatePairSecret()
    const fp = computePairFingerprint(secret)
    // Calling again with same secret gives same result (no role param)
    expect(computePairFingerprint(secret)).toBe(fp)
  })

  it('produces different fingerprints for different secrets', () => {
    const fps = new Set<string>()
    for (let i = 0; i < 50; i++) {
      fps.add(computePairFingerprint(generatePairSecret()))
    }
    // With 6 Base59 chars (59^6 ≈ 4.2e10 space), 50 random should all be unique
    expect(fps.size).toBe(50)
  })
})
