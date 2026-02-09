import { describe, it, expect } from 'vitest'
import { computePairChecksum, isValidPairCode, generatePairCode } from './keys'
import { PAIR_CODE_ALPHABET, PAIR_CODE_LENGTH } from './constants'

describe('computePairChecksum', () => {
  it('returns a character from the pair alphabet', () => {
    const checksum = computePairChecksum('abcde')
    expect(PAIR_CODE_ALPHABET).toContain(checksum)
  })

  it('is deterministic', () => {
    const a = computePairChecksum('x9f3k')
    const b = computePairChecksum('x9f3k')
    expect(a).toBe(b)
  })

  it('differs for different data', () => {
    const a = computePairChecksum('abcde')
    const b = computePairChecksum('abcdf')
    expect(a).not.toBe(b)
  })
})

describe('generatePairCode', () => {
  it('returns a code of PAIR_CODE_LENGTH', () => {
    const code = generatePairCode()
    expect(code.length).toBe(PAIR_CODE_LENGTH)
  })

  it('only uses valid alphabet characters', () => {
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
    expect(isValidPairCode('ABCDEF')).toBe(false)
    expect(isValidPairCode('abc-de')).toBe(false)
    expect(isValidPairCode('abc_de')).toBe(false)
    expect(isValidPairCode('00000a')).toBe(false)
  })

  it('detects single-character substitution errors', () => {
    let detected = 0
    const trials = 100

    for (let t = 0; t < trials; t++) {
      const code = generatePairCode()
      // Pick a random position and change it to a different valid char
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

    // A position-weighted checksum mod 30 catches all single-char substitutions
    expect(detected).toBe(trials)
  })

  it('detects transposition errors of different characters', () => {
    let detected = 0
    let tested = 0
    const trials = 200

    for (let t = 0; t < trials; t++) {
      const code = generatePairCode()
      // Pick two random adjacent positions
      const pos = Math.floor(Math.random() * (code.length - 1))
      if (code[pos] === code[pos + 1]) continue // skip if same chars (transposition is a no-op)

      tested++
      const transposed = code.slice(0, pos) + code[pos + 1] + code[pos] + code.slice(pos + 2)
      if (!isValidPairCode(transposed)) {
        detected++
      }
    }

    // Weighted checksum catches all transpositions of different characters
    expect(detected).toBe(tested)
  })
})
