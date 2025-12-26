import { RELAY_PROBE_TIMEOUT } from './constants'

/**
 * Simple probe - just check if relay is reachable via WebSocket
 */
async function probeRelaySimple(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), RELAY_PROBE_TIMEOUT)

    try {
      const ws = new WebSocket(url)
      ws.onopen = () => {
        clearTimeout(timeout)
        ws.close()
        resolve(url)
      }
      ws.onerror = () => {
        clearTimeout(timeout)
        resolve(null)
      }
    } catch {
      clearTimeout(timeout)
      resolve(null)
    }
  })
}

/**
 * Probe multiple relays and return available ones
 */
export async function probeRelaysSimple(urls: string[]): Promise<string[]> {
  const results = await Promise.all(urls.map(url => probeRelaySimple(url)))
  return results.filter((r): r is string => r !== null)
}
