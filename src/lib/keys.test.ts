import { describe, it, expect } from 'vitest'
import { generateSecretKey } from 'nostr-tools/pure'
import { computePairChecksum, isValidPairCode, generatePairCode, derivePairKeys, computeSecretKeyChecksum, encodeSecretKey, decodeSecretKey, isValidSecretKeyEncoding } from './keys'
import { PAIR_CODE_ALPHABET, PAIR_CODE_LENGTH, SECRET_KEY_ALPHABET, SECRET_KEY_ENCODED_LENGTH } from './constants'

describe('computePairChecksum', () => {
  it('returns 1 character from PAIR_CODE_ALPHABET', () => {
    const data = '23456'
    const checksum = computePairChecksum(data)
    expect(checksum.length).toBe(1)
    expect(PAIR_CODE_ALPHABET).toContain(checksum)
  })

  it('is deterministic', () => {
    const data = 'abcde'
    const a = computePairChecksum(data)
    const b = computePairChecksum(data)
    expect(a).toBe(b)
  })

  it('differs for different data', () => {
    const a = computePairChecksum('abcde')
    const b = computePairChecksum('abcdf')
    expect(a).not.toBe(b)
  })
})

describe('generatePairCode', () => {
  it('returns a code of PAIR_CODE_LENGTH (6)', () => {
    const code = generatePairCode()
    expect(code.length).toBe(PAIR_CODE_LENGTH)
  })

  it('only uses valid PAIR_CODE_ALPHABET characters', () => {
    for (let i = 0; i < 50; i++) {
      const code = generatePairCode()
      for (const ch of code) {
        expect(PAIR_CODE_ALPHABET).toContain(ch)
      }
    }
  })

  it('passes its own checksum validation', () => {
    for (let i = 0; i < 50; i++) {
      expect(isValidPairCode(generatePairCode())).toBe(true)
    }
  })
})

describe('isValidPairCode', () => {
  it('accepts valid generated codes', () => {
    const code = generatePairCode()
    expect(isValidPairCode(code)).toBe(true)
  })

  it('rejects wrong length', () => {
    expect(isValidPairCode('abc')).toBe(false)
    expect(isValidPairCode('abcdefgh')).toBe(false)
    expect(isValidPairCode('')).toBe(false)
  })

  it('rejects invalid characters', () => {
    // Characters not in PAIR_CODE_ALPHABET: 0, 1, A, Z, l, o, i, u, z
    const invalid = '0abcde'
    expect(isValidPairCode(invalid)).toBe(false)
  })

  it('detects all single-character substitution errors', () => {
    let detected = 0
    const trials = 100

    for (let t = 0; t < trials; t++) {
      const code = generatePairCode()
      const pos = Math.floor(Math.random() * code.length)
      const original = code[pos]
      let replacement: string
      do {
        replacement = PAIR_CODE_ALPHABET[Math.floor(Math.random() * PAIR_CODE_ALPHABET.length)]
      } while (replacement === original)

      const corrupted = code.slice(0, pos) + replacement + code.slice(pos + 1)
      if (!isValidPairCode(corrupted)) {
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
      const code = generatePairCode()
      const pos = Math.floor(Math.random() * (code.length - 1))
      if (code[pos] === code[pos + 1]) continue

      tested++
      const transposed = code.slice(0, pos) + code[pos + 1] + code[pos] + code.slice(pos + 2)
      if (!isValidPairCode(transposed)) {
        detected++
      }
    }

    expect(detected).toBe(tested)
  })
})

describe('derivePairKeys', () => {
  it('is deterministic', () => {
    const sk = generateSecretKey()
    const code = generatePairCode()
    const a = derivePairKeys(sk, code, 1)
    const b = derivePairKeys(sk, code, 1)
    expect(a.localPadId).toBe(b.localPadId)
    expect(a.remotePadId).toBe(b.remotePadId)
    expect(a.localPublicKey).toBe(b.localPublicKey)
  })

  it('role 1 local = role 2 remote', () => {
    const sk = generateSecretKey()
    const code = generatePairCode()
    const r1 = derivePairKeys(sk, code, 1)
    const r2 = derivePairKeys(sk, code, 2)
    expect(r1.localPadId).toBe(r2.remotePadId)
    expect(r1.remotePadId).toBe(r2.localPadId)
  })

  it('different codes produce different pad IDs', () => {
    const sk = generateSecretKey()
    const code1 = generatePairCode()
    let code2 = generatePairCode()
    while (code2 === code1) code2 = generatePairCode()
    const r1 = derivePairKeys(sk, code1, 1)
    const r2 = derivePairKeys(sk, code2, 1)
    expect(r1.localPadId).not.toBe(r2.localPadId)
  })

  it('different secret keys produce different pad IDs', () => {
    const sk1 = generateSecretKey()
    const sk2 = generateSecretKey()
    const code = generatePairCode()
    const r1 = derivePairKeys(sk1, code, 1)
    const r2 = derivePairKeys(sk2, code, 1)
    expect(r1.localPadId).not.toBe(r2.localPadId)
  })
})

describe('computeSecretKeyChecksum', () => {
  it('returns 2 characters from SECRET_KEY_ALPHABET', () => {
    const data = SECRET_KEY_ALPHABET.slice(0, 44)
    const checksum = computeSecretKeyChecksum(data)
    expect(checksum.length).toBe(2)
    for (const ch of checksum) {
      expect(SECRET_KEY_ALPHABET).toContain(ch)
    }
  })

  it('is deterministic', () => {
    const data = SECRET_KEY_ALPHABET.slice(0, 44)
    const a = computeSecretKeyChecksum(data)
    const b = computeSecretKeyChecksum(data)
    expect(a).toBe(b)
  })

  it('differs for different data', () => {
    const a = computeSecretKeyChecksum(SECRET_KEY_ALPHABET.slice(0, 44))
    const b = computeSecretKeyChecksum(SECRET_KEY_ALPHABET.slice(1, 45))
    expect(a).not.toBe(b)
  })
})

describe('encodeSecretKey / decodeSecretKey', () => {
  it('round-trips: decode(encode(bytes)) === bytes', () => {
    for (let i = 0; i < 10; i++) {
      const bytes = generateSecretKey() // 32 bytes
      const encoded = encodeSecretKey(bytes)
      const decoded = decodeSecretKey(encoded)
      expect(Array.from(decoded)).toEqual(Array.from(bytes))
    }
  })

  it('produces exactly SECRET_KEY_ENCODED_LENGTH characters', () => {
    const bytes = generateSecretKey()
    const encoded = encodeSecretKey(bytes)
    expect(encoded.length).toBe(SECRET_KEY_ENCODED_LENGTH)
  })

  it('only uses SECRET_KEY_ALPHABET characters', () => {
    for (let i = 0; i < 10; i++) {
      const encoded = encodeSecretKey(generateSecretKey())
      for (const ch of encoded) {
        expect(SECRET_KEY_ALPHABET).toContain(ch)
      }
    }
  })

  it('round-trips all-zeros', () => {
    const bytes = new Uint8Array(32)
    const encoded = encodeSecretKey(bytes)
    const decoded = decodeSecretKey(encoded)
    expect(Array.from(decoded)).toEqual(Array.from(bytes))
  })

  it('round-trips all-255', () => {
    const bytes = new Uint8Array(32).fill(255)
    const encoded = encodeSecretKey(bytes)
    const decoded = decodeSecretKey(encoded)
    expect(Array.from(decoded)).toEqual(Array.from(bytes))
  })
})

describe('isValidSecretKeyEncoding', () => {
  it('accepts valid encoded keys', () => {
    for (let i = 0; i < 10; i++) {
      const encoded = encodeSecretKey(generateSecretKey())
      expect(isValidSecretKeyEncoding(encoded)).toBe(true)
    }
  })

  it('rejects wrong length', () => {
    expect(isValidSecretKeyEncoding('abc')).toBe(false)
    expect(isValidSecretKeyEncoding('')).toBe(false)
    const encoded = encodeSecretKey(generateSecretKey())
    expect(isValidSecretKeyEncoding(encoded + '2')).toBe(false)
    expect(isValidSecretKeyEncoding(encoded.slice(0, -1))).toBe(false)
  })

  it('rejects invalid characters', () => {
    const encoded = encodeSecretKey(generateSecretKey())
    // Replace first char with a character not in alphabet (0, O, I, l, o)
    const corrupted = '0' + encoded.slice(1)
    expect(isValidSecretKeyEncoding(corrupted)).toBe(false)
  })

  it('detects all single-character substitution errors', () => {
    let detected = 0
    const trials = 100

    for (let t = 0; t < trials; t++) {
      const encoded = encodeSecretKey(generateSecretKey())
      const pos = Math.floor(Math.random() * encoded.length)
      const original = encoded[pos]
      let replacement: string
      do {
        replacement = SECRET_KEY_ALPHABET[Math.floor(Math.random() * SECRET_KEY_ALPHABET.length)]
      } while (replacement === original)

      const corrupted = encoded.slice(0, pos) + replacement + encoded.slice(pos + 1)
      if (!isValidSecretKeyEncoding(corrupted)) {
        detected++
      }
    }

    expect(detected).toBe(trials)
  })

  it('detects all adjacent transposition errors of different characters', () => {
    let detected = 0
    let tested = 0
    const trials = 200

    for (let t = 0; t < trials; t++) {
      const encoded = encodeSecretKey(generateSecretKey())
      const pos = Math.floor(Math.random() * (encoded.length - 1))
      if (encoded[pos] === encoded[pos + 1]) continue

      tested++
      const transposed = encoded.slice(0, pos) + encoded[pos + 1] + encoded[pos] + encoded.slice(pos + 2)
      if (!isValidSecretKeyEncoding(transposed)) {
        detected++
      }
    }

    expect(detected).toBe(tested)
  })
})
