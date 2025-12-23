// CRC32 lookup table
const table = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  table[i] = c
}

/**
 * Calculate CRC32 checksum of a string
 */
export function crc32(str: string): number {
  const bytes = new TextEncoder().encode(str)
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Format CRC32 as hex string with dash in middle (e.g., "ABCD-EF12")
 */
export function formatCrc32(str: string): string {
  const hash = crc32(str).toString(16).toUpperCase().padStart(8, '0')
  return `${hash.slice(0, 4)}-${hash.slice(4)}`
}
