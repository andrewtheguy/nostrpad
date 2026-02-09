const DB_NAME = 'nostrpad-sessions'
const DB_VERSION = 5
const STORE_NAME = 'sessions'
const PAIR_STORE_NAME = 'pairSessions'
const GLOBAL_KEY = 'current-session'

let cachedDb: IDBDatabase | Promise<IDBDatabase> | null = null

interface SessionData {
  padId: string
  encryptedPrivateKey: Uint8Array
  aesKey: CryptoKey
  iv: Uint8Array
  createdAt: number
  integrityTag?: Uint8Array // SHA-256 hash binding padId + createdAt to encrypted data
}

/**
 * Compute integrity tag: SHA-256(padId + createdAt + iv + encryptedPrivateKey)
 * This binds the padId and timestamp to the encrypted data, preventing tampering
 */
async function computeIntegrityTag(padId: string, createdAt: number, iv: Uint8Array, encryptedPrivateKey: Uint8Array): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const padIdBytes = encoder.encode(padId)

  // Convert timestamp to 8 bytes (BigInt64)
  const timestampBytes = new Uint8Array(8)
  const view = new DataView(timestampBytes.buffer)
  view.setBigInt64(0, BigInt(createdAt), false) // Big-endian

  // Concatenate: padId bytes + timestamp + iv + encrypted data
  const combined = new Uint8Array(padIdBytes.length + timestampBytes.length + iv.length + encryptedPrivateKey.length)
  combined.set(padIdBytes, 0)
  combined.set(timestampBytes, padIdBytes.length)
  combined.set(iv, padIdBytes.length + timestampBytes.length)
  combined.set(encryptedPrivateKey, padIdBytes.length + timestampBytes.length + iv.length)

  const hash = await crypto.subtle.digest('SHA-256', combined)
  return new Uint8Array(hash)
}

/**
 * Verify integrity tag matches the stored data
 */
async function verifyIntegrityTag(session: SessionData): Promise<boolean> {
  if (!session.integrityTag || !session.createdAt) {
    // Legacy session without integrity tag or timestamp - invalid
    return false
  }

  const computed = await computeIntegrityTag(session.padId, session.createdAt, session.iv, session.encryptedPrivateKey)

  if (computed.length !== session.integrityTag.length) {
    return false
  }

  // Constant-time comparison
  let diff = 0
  for (let i = 0; i < computed.length; i++) {
    diff |= computed[i] ^ session.integrityTag[i]
  }
  return diff === 0
}

export async function initDB(): Promise<IDBDatabase> {
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
      // Clear database on upgrade to ensure clean state
      // This is acceptable because NostrPad is designed for temporary sharing,
      // not permanent storage. Users should expect sessions to be ephemeral.
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME)
      }
      if (db.objectStoreNames.contains(PAIR_STORE_NAME)) {
        db.deleteObjectStore(PAIR_STORE_NAME)
      }
      db.createObjectStore(STORE_NAME)
      db.createObjectStore(PAIR_STORE_NAME)
    }
  })

  cachedDb = promise
  return promise
}

export async function storeSession(padId: string, encryptedPrivateKey: Uint8Array, aesKey: CryptoKey, iv: Uint8Array, createdAt: number = Date.now()): Promise<void> {
  // Compute integrity tag BEFORE starting the transaction
  // Safari strictly follows IndexedDB spec where transactions auto-commit when event loop yields
  const integrityTag = await computeIntegrityTag(padId, createdAt, iv, encryptedPrivateKey)

  const db = await initDB()
  const transaction = db.transaction([STORE_NAME], 'readwrite')
  const store = transaction.objectStore(STORE_NAME)

  const data: SessionData = {
    padId,
    encryptedPrivateKey,
    aesKey,
    iv,
    createdAt,
    integrityTag
  }

  return new Promise((resolve, reject) => {
    const request = store.put(data, GLOBAL_KEY)

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

export async function getSession(padId: string): Promise<{ encryptedPrivateKey: Uint8Array, aesKey: CryptoKey, iv: Uint8Array, createdAt: number } | null> {
  const result = await getVerifiedStoredSession()

  if (!result || result.session.padId !== padId) {
    return null
  }

  const { session } = result
  return {
    encryptedPrivateKey: session.encryptedPrivateKey,
    aesKey: session.aesKey,
    iv: session.iv,
    createdAt: session.createdAt
  }
}

export async function getStoredSession(): Promise<SessionData | null> {
  const db = await initDB()
  const transaction = db.transaction([STORE_NAME], 'readonly')
  const store = transaction.objectStore(STORE_NAME)

  return new Promise((resolve, reject) => {
    const request = store.get(GLOBAL_KEY)
    request.onsuccess = () => {
      const result: SessionData | undefined = request.result
      resolve(result || null)
    }
    request.onerror = () => reject(request.error)
  })
}

/**
 * Get stored session with integrity verification
 * Returns null if no session exists or integrity check fails
 */
export async function getVerifiedStoredSession(): Promise<{ session: SessionData; verified: boolean } | null> {
  const session = await getStoredSession()
  if (!session) return null

  const verified = await verifyIntegrityTag(session)
  if (!verified) {
    // Integrity check failed - session may be tampered
    return null
  }

  return { session, verified }
}

export async function encryptPrivateKey(privateKey: Uint8Array): Promise<{ encrypted: Uint8Array, key: CryptoKey, iv: Uint8Array }> {
  const key = await crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256
    },
    false, // extractable: false
    ['encrypt', 'decrypt']
  )

  const iv = crypto.getRandomValues(new Uint8Array(12)) // 96-bit IV for GCM

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    privateKey as BufferSource
  )

  return {
    encrypted: new Uint8Array(encrypted),
    key,
    iv
  }
}

export async function decryptPrivateKey(encrypted: Uint8Array, key: CryptoKey, iv: Uint8Array): Promise<Uint8Array> {
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource
    },
    key,
    encrypted as BufferSource
  )

  return new Uint8Array(decrypted)
}

export async function createAndStoreSession(padId: string, privateKey: Uint8Array, createdAt: number = Date.now()): Promise<void> {
  const { encrypted, key, iv } = await encryptPrivateKey(privateKey)
  await storeSession(padId, encrypted, key, iv, createdAt)
}

export async function getDecryptedPrivateKey(padId: string): Promise<{ privateKey: Uint8Array, createdAt: number } | null> {
  const session = await getSession(padId)
  if (!session) return null

  try {
    const privateKey = await decryptPrivateKey(session.encryptedPrivateKey, session.aesKey, session.iv)
    return { privateKey, createdAt: session.createdAt }
  } catch (error) {
    console.error('Failed to decrypt private key:', error)
    return null
  }
}

export async function clearSession(): Promise<void> {
  const db = await initDB()
  const transaction = db.transaction([STORE_NAME], 'readwrite')
  const store = transaction.objectStore(STORE_NAME)

  return new Promise((resolve, reject) => {
    const request = store.delete(GLOBAL_KEY)

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

// --- Pair Session Storage ---

interface PairSessionData {
  localPadId: string
  remotePadId: string
  encryptedLocalSecretKey: Uint8Array
  aesKey: CryptoKey
  iv: Uint8Array
  createdAt: number
  integrityTag: Uint8Array
}

export async function createPairSession(localPadId: string, localSecretKey: Uint8Array, remotePadId: string): Promise<void> {
  const { encrypted, key, iv } = await encryptPrivateKey(localSecretKey)
  const createdAt = Date.now()
  const integrityTag = await computeIntegrityTag(localPadId, createdAt, iv, encrypted)

  const db = await initDB()
  const transaction = db.transaction([PAIR_STORE_NAME], 'readwrite')
  const store = transaction.objectStore(PAIR_STORE_NAME)

  const data: PairSessionData = {
    localPadId,
    remotePadId,
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

export async function getDecryptedPairSession(localPadId: string): Promise<{ localSecretKey: Uint8Array, localPublicKey: string, remotePadId: string } | null> {
  const db = await initDB()
  const transaction = db.transaction([PAIR_STORE_NAME], 'readonly')
  const store = transaction.objectStore(PAIR_STORE_NAME)

  const session: PairSessionData | undefined = await new Promise((resolve, reject) => {
    const request = store.get(localPadId)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  if (!session) return null

  // Verify integrity
  if (!session.integrityTag || !session.createdAt) return null
  const computed = await computeIntegrityTag(session.localPadId, session.createdAt, session.iv, session.encryptedLocalSecretKey)
  if (computed.length !== session.integrityTag.length) return null
  let diff = 0
  for (let i = 0; i < computed.length; i++) {
    diff |= computed[i] ^ session.integrityTag[i]
  }
  if (diff !== 0) return null

  try {
    const localSecretKey = await decryptPrivateKey(session.encryptedLocalSecretKey, session.aesKey, session.iv)
    const { getPublicKey } = await import('nostr-tools/pure')
    const localPublicKey = getPublicKey(localSecretKey)
    return { localSecretKey, localPublicKey, remotePadId: session.remotePadId }
  } catch (error) {
    console.error('Failed to decrypt pair session:', error)
    return null
  }
}

export async function clearPairSession(localPadId: string): Promise<void> {
  const db = await initDB()
  const transaction = db.transaction([PAIR_STORE_NAME], 'readwrite')
  const store = transaction.objectStore(PAIR_STORE_NAME)

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