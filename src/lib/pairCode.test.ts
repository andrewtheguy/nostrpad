import { describe, it, expect } from 'vitest'
import { computeChecksum, generatePairCode, validatePairCode } from './pairCode'
import { PAIR_CODE_ALPHABET, PAIR_CODE_DATA_LENGTH, PAIR_CODE_CHECKSUM_LENGTH } from './constants'

describe('computeChecksum', () => {
  it('returns a 2-character string', () => {
    const cs = computeChecksum('abcdefgh')
    expect(cs).toHaveLength(PAIR_CODE_CHECKSUM_LENGTH)
  })

  it('only uses characters from the pair code alphabet', () => {
    const cs = computeChecksum('22222222')
    for (const ch of cs) {
      expect(PAIR_CODE_ALPHABET).toContain(ch)
    }
  })

  it('is deterministic', () => {
    const a = computeChecksum('abcdefgh')
    const b = computeChecksum('abcdefgh')
    expect(a).toBe(b)
  })

  it('changes when a single character changes', () => {
    const original = computeChecksum('abcdefgh')
    const changed = computeChecksum('abcdefgx')
    expect(changed).not.toBe(original)
  })

  it('detects single-character errors at every position', () => {
    const data = 'a3f8kn-_'
    const original = computeChecksum(data)

    for (let pos = 0; pos < data.length; pos++) {
      const originalChar = data[pos]
      for (const replacement of PAIR_CODE_ALPHABET) {
        if (replacement === originalChar) continue
        const mutated = data.slice(0, pos) + replacement + data.slice(pos + 1)
        expect(computeChecksum(mutated)).not.toBe(original)
      }
    }
  })

  it('detects adjacent transpositions', () => {
    const data = 'abcdefgh'
    const original = computeChecksum(data)

    for (let i = 0; i < data.length - 1; i++) {
      if (data[i] === data[i + 1]) continue
      const transposed = data.slice(0, i) + data[i + 1] + data[i] + data.slice(i + 2)
      expect(computeChecksum(transposed)).not.toBe(original)
    }
  })

  it('produces different checksums for different inputs', () => {
    const checksums = new Set<string>()
    const inputs = ['22222222', '33333333', 'abcdefgh', '________', '--aabb33']
    for (const input of inputs) {
      checksums.add(computeChecksum(input))
    }
    expect(checksums.size).toBe(inputs.length)
  })

  it('throws on invalid characters', () => {
    expect(() => computeChecksum('ABCDEFGH')).toThrow('Invalid character')
  })
})

describe('generatePairCode', () => {
  it('returns a string of the correct total length', () => {
    const code = generatePairCode()
    expect(code).toHaveLength(PAIR_CODE_DATA_LENGTH + PAIR_CODE_CHECKSUM_LENGTH)
  })

  it('only uses characters from the pair code alphabet', () => {
    const code = generatePairCode()
    for (const ch of code) {
      expect(PAIR_CODE_ALPHABET).toContain(ch)
    }
  })

  it('generates codes that pass validation', () => {
    for (let i = 0; i < 20; i++) {
      const code = generatePairCode()
      const result = validatePairCode(code)
      expect(result.valid).toBe(true)
    }
  })

  it('generates unique codes', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 50; i++) {
      codes.add(generatePairCode())
    }
    expect(codes.size).toBe(50)
  })
})

describe('validatePairCode', () => {
  it('accepts a valid generated code', () => {
    const code = generatePairCode()
    expect(validatePairCode(code)).toEqual({ valid: true })
  })

  it('rejects code that is too short', () => {
    const result = validatePairCode('abc')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('characters')
  })

  it('rejects code that is too long', () => {
    const result = validatePairCode('a'.repeat(PAIR_CODE_DATA_LENGTH + PAIR_CODE_CHECKSUM_LENGTH + 1))
    expect(result.valid).toBe(false)
    expect(result.error).toContain('characters')
  })

  it('rejects code with invalid characters', () => {
    const result = validatePairCode('ABCDEFGHIJ')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid character')
  })

  it('rejects code with correct length but wrong checksum', () => {
    const code = generatePairCode()
    // Flip last character to break checksum
    const lastChar = code[code.length - 1]
    const replacement = lastChar === 'a' ? 'b' : 'a'
    const broken = code.slice(0, -1) + replacement
    const result = validatePairCode(broken)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('checksum')
  })

  it('rejects code with a single-character typo in the data portion', () => {
    const code = generatePairCode()
    const data = code.slice(0, PAIR_CODE_DATA_LENGTH)
    const checksum = code.slice(PAIR_CODE_DATA_LENGTH)

    // Change one data character, keep original checksum
    const originalChar = data[0]
    const replacement = originalChar === 'a' ? 'b' : 'a'
    const mutatedData = replacement + data.slice(1)
    const mutatedCode = mutatedData + checksum

    const result = validatePairCode(mutatedCode)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('checksum')
  })

  it('rejects code with adjacent characters swapped', () => {
    const code = generatePairCode()
    const data = code.slice(0, PAIR_CODE_DATA_LENGTH)
    const checksum = code.slice(PAIR_CODE_DATA_LENGTH)

    // Find two adjacent different characters to swap
    let swapped: string | null = null
    for (let i = 0; i < data.length - 1; i++) {
      if (data[i] !== data[i + 1]) {
        swapped = data.slice(0, i) + data[i + 1] + data[i] + data.slice(i + 2)
        break
      }
    }

    if (swapped) {
      const result = validatePairCode(swapped + checksum)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('checksum')
    }
  })
})
