const DB_NAME = 'nostrpad-sessions'
const DB_VERSION = 3
const STORE_NAME = 'sessions'
const GLOBAL_KEY = 'current-session'

let cachedDb: IDBDatabase | Promise<IDBDatabase> | null = null

interface SessionData {
  padId: string
  encryptedPrivateKey: Uint8Array
  aesKey: CryptoKey
  iv: Uint8Array
  integrityTag?: Uint8Array // SHA-256 hash binding padId to encrypted data
}

/**
 * Compute integrity tag: SHA-256(padId + iv + encryptedPrivateKey)
 * This binds the padId to the encrypted data, preventing tampering
 */
async function computeIntegrityTag(padId: string, iv: Uint8Array, encryptedPrivateKey: Uint8Array): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const padIdBytes = encoder.encode(padId)

  // Concatenate: padId bytes + iv + encrypted data
  const combined = new Uint8Array(padIdBytes.length + iv.length + encryptedPrivateKey.length)
  combined.set(padIdBytes, 0)
  combined.set(iv, padIdBytes.length)
  combined.set(encryptedPrivateKey, padIdBytes.length + iv.length)

  const hash = await crypto.subtle.digest('SHA-256', combined)
  return new Uint8Array(hash)
}

/**
 * Verify integrity tag matches the stored data
 */
async function verifyIntegrityTag(session: SessionData): Promise<boolean> {
  if (!session.integrityTag) {
    // Legacy session without integrity tag - cannot verify
    return false
  }

  const computed = await computeIntegrityTag(session.padId, session.iv, session.encryptedPrivateKey)

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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })

  cachedDb = promise
  return promise
}

export async function storeSession(padId: string, encryptedPrivateKey: Uint8Array, aesKey: CryptoKey, iv: Uint8Array): Promise<void> {
  const db = await initDB()
  const transaction = db.transaction([STORE_NAME], 'readwrite')
  const store = transaction.objectStore(STORE_NAME)

  // Compute integrity tag to bind padId to encrypted data
  const integrityTag = await computeIntegrityTag(padId, iv, encryptedPrivateKey)

  const data: SessionData = {
    padId,
    encryptedPrivateKey,
    aesKey,
    iv,
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

export async function getSession(padId: string): Promise<{ encryptedPrivateKey: Uint8Array, aesKey: CryptoKey, iv: Uint8Array } | null> {
  const result = await getVerifiedStoredSession()

  if (!result || result.session.padId !== padId) {
    return null
  }

  const { session } = result
  return {
    encryptedPrivateKey: session.encryptedPrivateKey,
    aesKey: session.aesKey,
    iv: session.iv
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

export async function createAndStoreSession(padId: string, privateKey: Uint8Array): Promise<void> {
  const { encrypted, key, iv } = await encryptPrivateKey(privateKey)
  await storeSession(padId, encrypted, key, iv)
}

export async function getDecryptedPrivateKey(padId: string): Promise<Uint8Array | null> {
  const session = await getSession(padId)
  if (!session) return null

  try {
    return await decryptPrivateKey(session.encryptedPrivateKey, session.aesKey, session.iv)
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