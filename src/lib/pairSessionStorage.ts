import { derivePairKeys } from './keys'

const DB_NAME = 'nostrpad-pair-sessions'
const DB_VERSION = 3
const SECRET_KEY_STORE = 'pairSecretKey'
const SESSIONS_STORE = 'pairSessions'

let cachedDb: IDBDatabase | Promise<IDBDatabase> | null = null

interface PairSecretKeyData {
  hmacKey: CryptoKey  // non-extractable HMAC-SHA256
  createdAt: number
}

interface PairSessionData {
  localPadId: string
  remotePadId: string
  pairCode: string
  role: 1 | 2
  createdAt: number
}

export interface PairSessionMetadata {
  localPadId: string
  pairCode: string
  createdAt: number
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
      // No backward compat - wipe old stores
      for (const name of Array.from(db.objectStoreNames)) {
        db.deleteObjectStore(name)
      }
      db.createObjectStore(SECRET_KEY_STORE)
      db.createObjectStore(SESSIONS_STORE)
    }
  })

  cachedDb = promise
  return promise
}

export async function storePairSecretKey(secretKey: Uint8Array): Promise<void> {
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    secretKey as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false, // non-extractable
    ['sign']
  )
  const createdAt = Date.now()

  const db = await initPairDB()
  const transaction = db.transaction([SECRET_KEY_STORE], 'readwrite')
  const store = transaction.objectStore(SECRET_KEY_STORE)

  const data: PairSecretKeyData = {
    hmacKey,
    createdAt
  }

  return new Promise((resolve, reject) => {
    const request = store.put(data, 'current')

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

export async function getPairSecretKey(): Promise<CryptoKey | null> {
  const db = await initPairDB()
  const transaction = db.transaction([SECRET_KEY_STORE], 'readonly')
  const store = transaction.objectStore(SECRET_KEY_STORE)

  const data: PairSecretKeyData | undefined = await new Promise((resolve, reject) => {
    const request = store.get('current')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  if (!data) return null

  return data.hmacKey
}

export async function hasPairSecretKey(): Promise<boolean> {
  const db = await initPairDB()
  const transaction = db.transaction([SECRET_KEY_STORE], 'readonly')
  const store = transaction.objectStore(SECRET_KEY_STORE)

  return new Promise((resolve, reject) => {
    const request = store.count('current')
    request.onsuccess = () => resolve(request.result > 0)
    request.onerror = () => reject(request.error)
  })
}

export async function clearPairSecretKey(): Promise<void> {
  const db = await initPairDB()
  const transaction = db.transaction([SECRET_KEY_STORE], 'readwrite')
  const store = transaction.objectStore(SECRET_KEY_STORE)

  return new Promise((resolve, reject) => {
    const request = store.delete('current')

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

export async function createPairSession(localPadId: string, remotePadId: string, pairCode: string, role: 1 | 2): Promise<void> {
  const createdAt = Date.now()

  const db = await initPairDB()
  const transaction = db.transaction([SESSIONS_STORE], 'readwrite')
  const store = transaction.objectStore(SESSIONS_STORE)

  const data: PairSessionData = {
    localPadId,
    remotePadId,
    pairCode,
    role,
    createdAt
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

export async function getDecryptedPairSession(localPadId: string): Promise<{ localSecretKey: Uint8Array, localPublicKey: string, remotePadId: string, pairCode: string } | null> {
  const db = await initPairDB()
  const transaction = db.transaction([SESSIONS_STORE], 'readonly')
  const store = transaction.objectStore(SESSIONS_STORE)

  const session: PairSessionData | undefined = await new Promise((resolve, reject) => {
    const request = store.get(localPadId)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  if (!session) return null

  const hmacKey = await getPairSecretKey()
  if (!hmacKey) return null

  try {
    const { localSecretKey, localPublicKey } = await derivePairKeys(hmacKey, session.pairCode, session.role)
    return { localSecretKey, localPublicKey, remotePadId: session.remotePadId, pairCode: session.pairCode }
  } catch (error) {
    console.error('Failed to derive pair session keys:', error)
    return null
  }
}

export async function clearPairSession(localPadId: string): Promise<void> {
  const db = await initPairDB()
  const transaction = db.transaction([SESSIONS_STORE], 'readwrite')
  const store = transaction.objectStore(SESSIONS_STORE)

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
  const transaction = db.transaction([SESSIONS_STORE], 'readonly')
  const store = transaction.objectStore(SESSIONS_STORE)

  return new Promise((resolve, reject) => {
    const results: PairSessionMetadata[] = []
    const request = store.openCursor()

    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) {
        const data = cursor.value as PairSessionData
        results.push({
          localPadId: data.localPadId,
          pairCode: data.pairCode,
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
