const DB_NAME = 'nostrpad-sessions'
const DB_VERSION = 2
const STORE_NAME = 'sessions'
const GLOBAL_KEY = 'all-sessions'

let cachedDb: IDBDatabase | null = null

interface SessionData {
  padId: string
  encryptedPrivateKey: Uint8Array
  aesKey: CryptoKey
  iv: Uint8Array
}

export async function initDB(): Promise<IDBDatabase> {
  if (cachedDb) {
    return cachedDb
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      cachedDb = request.result
      cachedDb.onversionchange = () => {
        cachedDb?.close()
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
}

export async function storeSession(padId: string, encryptedPrivateKey: Uint8Array, aesKey: CryptoKey, iv: Uint8Array): Promise<void> {
  const db = await initDB()
  const transaction = db.transaction([STORE_NAME], 'readwrite')
  const store = transaction.objectStore(STORE_NAME)

  const data: SessionData = {
    padId,
    encryptedPrivateKey,
    aesKey,
    iv
  }

  return new Promise((resolve, reject) => {
    const request = store.put(data, GLOBAL_KEY)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function getSession(padId: string): Promise<{ encryptedPrivateKey: Uint8Array, aesKey: CryptoKey, iv: Uint8Array } | null> {
  const db = await initDB()
  const transaction = db.transaction([STORE_NAME], 'readonly')
  const store = transaction.objectStore(STORE_NAME)

  return new Promise((resolve, reject) => {
    const request = store.get(GLOBAL_KEY)
    request.onsuccess = () => {
      const result: SessionData | undefined = request.result
      if (result && result.padId === padId) {
        resolve({
          encryptedPrivateKey: result.encryptedPrivateKey,
          aesKey: result.aesKey,
          iv: result.iv
        })
      } else {
        resolve(null)
      }
    }
    request.onerror = () => reject(request.error)
  })
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