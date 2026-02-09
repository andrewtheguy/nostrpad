import { getPublicKey } from 'nostr-tools/pure'
import { encryptPrivateKey, decryptPrivateKey } from './sessionStorage'

const DB_NAME = 'nostrpad-pair-sessions'
const DB_VERSION = 1
const STORE_NAME = 'pairSessions'

let cachedDb: IDBDatabase | Promise<IDBDatabase> | null = null

interface PairSessionData {
  localPadId: string
  remotePadId: string
  fingerprint: string
  encryptedLocalSecretKey: Uint8Array
  aesKey: CryptoKey
  iv: Uint8Array
  createdAt: number
  integrityTag: Uint8Array
}

export interface PairSessionMetadata {
  localPadId: string
  fingerprint: string
  createdAt: number
}

async function computePairIntegrityTag(
  localPadId: string, remotePadId: string, fingerprint: string,
  createdAt: number, iv: Uint8Array, encryptedData: Uint8Array
): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const localPadIdBytes = encoder.encode(localPadId)
  const remotePadIdBytes = encoder.encode(remotePadId)
  const fingerprintBytes = encoder.encode(fingerprint)

  const timestampBytes = new Uint8Array(8)
  const view = new DataView(timestampBytes.buffer)
  view.setBigInt64(0, BigInt(createdAt), false)

  const combined = new Uint8Array(
    localPadIdBytes.length + remotePadIdBytes.length + fingerprintBytes.length +
    timestampBytes.length + iv.length + encryptedData.length
  )
  let offset = 0
  combined.set(localPadIdBytes, offset); offset += localPadIdBytes.length
  combined.set(remotePadIdBytes, offset); offset += remotePadIdBytes.length
  combined.set(fingerprintBytes, offset); offset += fingerprintBytes.length
  combined.set(timestampBytes, offset); offset += timestampBytes.length
  combined.set(iv, offset); offset += iv.length
  combined.set(encryptedData, offset)

  const hash = await crypto.subtle.digest('SHA-256', combined)
  return new Uint8Array(hash)
}

async function initPairDB(): Promise<IDBDatabase> {
  if (cachedDb) {
    return cachedDb
  }

  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      cachedDb = null
      reject(request.error)
    }
    request.onsuccess = () => {
      cachedDb = request.result
      cachedDb.onversionchange = () => {
        if (cachedDb && !(cachedDb instanceof Promise)) {
          cachedDb.close()
        }
        cachedDb = null
      }
      resolve(request.result)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME)
      }
      db.createObjectStore(STORE_NAME)
    }
  })

  cachedDb = promise
  return promise
}

export async function createPairSession(localPadId: string, localSecretKey: Uint8Array, remotePadId: string, fingerprint: string): Promise<void> {
  const { encrypted, key, iv } = await encryptPrivateKey(localSecretKey)
  const createdAt = Date.now()
  const integrityTag = await computePairIntegrityTag(localPadId, remotePadId, fingerprint, createdAt, iv, encrypted)

  const db = await initPairDB()
  const transaction = db.transaction([STORE_NAME], 'readwrite')
  const store = transaction.objectStore(STORE_NAME)

  const data: PairSessionData = {
    localPadId,
    remotePadId,
    fingerprint,
    encryptedLocalSecretKey: encrypted,
    aesKey: key,
    iv,
    createdAt,
    integrityTag
  }

  return new Promise((resolve, reject) => {
    const request = store.put(data, localPadId)

    const cleanup = () => {
      transaction.oncomplete = null
      transaction.onerror = null
      transaction.onabort = null
      request.onerror = null
    }

    transaction.oncomplete = () => {
      cleanup()
      resolve()
    }

    transaction.onerror = () => {
      cleanup()
      reject(transaction.error)
    }

    transaction.onabort = () => {
      cleanup()
      reject(new Error('Transaction aborted'))
    }

    request.onerror = () => {
      cleanup()
      reject(request.error)
    }
  })
}

export async function getDecryptedPairSession(localPadId: string): Promise<{ localSecretKey: Uint8Array, localPublicKey: string, remotePadId: string, fingerprint: string } | null> {
  const db = await initPairDB()
  const transaction = db.transaction([STORE_NAME], 'readonly')
  const store = transaction.objectStore(STORE_NAME)

  const session: PairSessionData | undefined = await new Promise((resolve, reject) => {
    const request = store.get(localPadId)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  if (!session) return null

  // Verify integrity (covers remotePadId + fingerprint)
  if (!session.integrityTag || !session.createdAt) return null
  const computed = await computePairIntegrityTag(
    session.localPadId, session.remotePadId, session.fingerprint,
    session.createdAt, session.iv, session.encryptedLocalSecretKey
  )
  if (computed.length !== session.integrityTag.length) return null
  let diff = 0
  for (let i = 0; i < computed.length; i++) {
    diff |= computed[i] ^ session.integrityTag[i]
  }
  if (diff !== 0) return null

  try {
    const localSecretKey = await decryptPrivateKey(session.encryptedLocalSecretKey, session.aesKey, session.iv)
    const localPublicKey = getPublicKey(localSecretKey)
    return { localSecretKey, localPublicKey, remotePadId: session.remotePadId, fingerprint: session.fingerprint }
  } catch (error) {
    console.error('Failed to decrypt pair session:', error)
    return null
  }
}

export async function clearPairSession(localPadId: string): Promise<void> {
  const db = await initPairDB()
  const transaction = db.transaction([STORE_NAME], 'readwrite')
  const store = transaction.objectStore(STORE_NAME)

  return new Promise((resolve, reject) => {
    const request = store.delete(localPadId)

    const cleanup = () => {
      transaction.oncomplete = null
      transaction.onerror = null
      transaction.onabort = null
      request.onerror = null
    }

    transaction.oncomplete = () => {
      cleanup()
      resolve()
    }

    transaction.onerror = () => {
      cleanup()
      reject(transaction.error)
    }

    transaction.onabort = () => {
      cleanup()
      reject(new Error('Transaction aborted'))
    }

    request.onerror = () => {
      cleanup()
      reject(request.error)
    }
  })
}

export async function listPairSessions(): Promise<PairSessionMetadata[]> {
  const db = await initPairDB()
  const transaction = db.transaction([STORE_NAME], 'readonly')
  const store = transaction.objectStore(STORE_NAME)

  return new Promise((resolve, reject) => {
    const results: PairSessionMetadata[] = []
    const request = store.openCursor()

    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) {
        const data = cursor.value as PairSessionData
        results.push({
          localPadId: data.localPadId,
          fingerprint: data.fingerprint,
          createdAt: data.createdAt
        })
        cursor.continue()
      } else {
        resolve(results)
      }
    }

    request.onerror = () => reject(request.error)
  })
}
