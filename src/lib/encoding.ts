import { ALPHABET } from './constants'

const BASE = BigInt(ALPHABET.length) // 59

/**
 * Encode bytes to unambiguous Base59 string
 */
export function encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return ''

  // Convert bytes to a big integer
  let num = BigInt(0)
  for (const byte of bytes) {
    num = num * BigInt(256) + BigInt(byte)
  }

  // Convert to base59
  let result = ''
  while (num > 0) {
    const remainder = Number(num % BASE)
    result = ALPHABET[remainder] + result
    num = num / BASE
  }

  // Handle leading zeros
  for (const byte of bytes) {
    if (byte === 0) {
      result = ALPHABET[0] + result
    } else {
      break
    }
  }

  return result || ALPHABET[0]
}

/**
 * Decode Base59 string back to bytes
 */
export function decode(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0)

  // Convert from base59 to big integer
  let num = BigInt(0)
  for (const char of str) {
    const index = ALPHABET.indexOf(char)
    if (index === -1) {
      throw new Error(`Invalid character in Base59 string: ${char}`)
    }
    num = num * BASE + BigInt(index)
  }

  // Convert to bytes
  const bytes: number[] = []
  while (num > 0) {
    bytes.unshift(Number(num % BigInt(256)))
    num = num / BigInt(256)
  }

  // Handle leading zeros (represented by leading '2's in our alphabet)
  for (const char of str) {
    if (char === ALPHABET[0]) {
      bytes.unshift(0)
    } else {
      break
    }
  }

  return new Uint8Array(bytes.length > 0 ? bytes : [0])
}

/**
 * Encode bytes to a fixed-length Base59 string
 * Pads with leading characters if needed
 */
export function encodeFixed(bytes: Uint8Array, length: number): string {
  const encoded = encode(bytes)
  if (encoded.length >= length) {
    return encoded.slice(0, length)
  }
  return ALPHABET[0].repeat(length - encoded.length) + encoded
}
