import { derivePairKeys } from './keys'
import { encodeFixed } from './encoding'
import type { PairRole } from './constants'

const DB_NAME = 'nostrpad-pair-sessions'
const DB_VERSION = 5
const SECRET_KEY_STORE = 'pairSecretKey'
const SESSIONS_STORE = 'pairSessions'

const FINGERPRINT_LABEL = 'nostrpad-pair-fingerprint'
const FINGERPRINT_LENGTH = 11
const FINGERPRINT_BYTES = 8

let cachedDb: IDBDatabase | Promise<IDBDatabase> | null = null

interface PairSecretKeyData {
  hmacKey: CryptoKey        // non-extractable HMAC-SHA256
  hkdfKey: CryptoKey        // non-extractable HKDF base key for content encryption
  fingerprint: string       // 11-char base59 string
  createdAt: number
  integrityTag: Uint8Array  // SHA-256(fingerprint + createdAt)
}

interface PairSessionData {
  localPadId: string
  remotePadId: string
  pairCode: string
  role: PairRole
  createdAt: number
}

export interface PairSessionMetadata {
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

async function computePairKeyFingerprint(hmacKey: CryptoKey): Promise<string> {
  const encoder = new TextEncoder()
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(FINGERPRINT_LABEL)))
  return encodeFixed(signature.slice(0, FINGERPRINT_BYTES), FINGERPRINT_LENGTH)
}

async function computePairIntegrityTag(fingerprint: string, createdAt: number): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const fingerprintBytes = encoder.encode(fingerprint)
  const timestampBytes = new Uint8Array(8)
  new DataView(timestampBytes.buffer).setBigInt64(0, BigInt(createdAt), false)

  const combined = new Uint8Array(fingerprintBytes.length + timestampBytes.length)
  combined.set(fingerprintBytes, 0)
  combined.set(timestampBytes, fingerprintBytes.length)

  return new Uint8Array(await crypto.subtle.digest('SHA-256', combined))
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i]
  }
  return diff === 0
}

function constantTimeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

async function verifyPairIntegrity(data: PairSecretKeyData): Promise<{ valid: boolean, fingerprint: string }> {
  const recomputedFingerprint = await computePairKeyFingerprint(data.hmacKey)
  if (!constantTimeStringEqual(recomputedFingerprint, data.fingerprint)) {
    return { valid: false, fingerprint: '' }
  }

  const recomputedTag = await computePairIntegrityTag(data.fingerprint, data.createdAt)
  if (!constantTimeEqual(recomputedTag, data.integrityTag)) {
    return { valid: false, fingerprint: '' }
  }

  return { valid: true, fingerprint: recomputedFingerprint }
}

export async function storePairSecretKey(secretKey: Uint8Array): Promise<void> {
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    secretKey as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false, // non-extractable
    ['sign']
  )
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    secretKey as BufferSource,
    'HKDF',
    false, // non-extractable
    ['deriveKey']
  )
  const createdAt = Date.now()

  // Compute fingerprint + integrity tag BEFORE starting the transaction
  // Safari strictly follows IndexedDB spec where transactions auto-commit when event loop yields
  const fingerprint = await computePairKeyFingerprint(hmacKey)
  const integrityTag = await computePairIntegrityTag(fingerprint, createdAt)

  const db = await initPairDB()
  const transaction = db.transaction([SECRET_KEY_STORE], 'readwrite')
  const store = transaction.objectStore(SECRET_KEY_STORE)

  const data: PairSecretKeyData = {
    hmacKey,
    hkdfKey,
    fingerprint,
    createdAt,
    integrityTag
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

export async function getPairSecretKey(): Promise<{ hmacKey: CryptoKey, hkdfKey: CryptoKey, fingerprint: string } | null> {
  const db = await initPairDB()
  const transaction = db.transaction([SECRET_KEY_STORE], 'readonly')
  const store = transaction.objectStore(SECRET_KEY_STORE)

  const data: PairSecretKeyData | undefined = await new Promise((resolve, reject) => {
    const request = store.get('current')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  if (!data) return null

  const { valid, fingerprint } = await verifyPairIntegrity(data)
  if (!valid) return null

  return { hmacKey: data.hmacKey, hkdfKey: data.hkdfKey, fingerprint }
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

export async function createPairSession(localPadId: string, remotePadId: string, pairCode: string, role: PairRole): Promise<void> {
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
    const request = store.put(data, pairCode)

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

export async function getDecryptedPairSession(pairCode: string): Promise<{
  localSecretKey: Uint8Array
  localPublicKey: string
  localPadId: string
  remotePadId: string
  pairCode: string
  localContentKey: CryptoKey
  remoteContentKey: CryptoKey
} | null> {
  const db = await initPairDB()
  const transaction = db.transaction([SESSIONS_STORE], 'readonly')
  const store = transaction.objectStore(SESSIONS_STORE)

  const session: PairSessionData | undefined = await new Promise((resolve, reject) => {
    const request = store.get(pairCode)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  if (!session) return null

  const result = await getPairSecretKey()
  if (!result) return null

  try {
    const derived = await derivePairKeys(result.hmacKey, session.pairCode, session.role)

    if (derived.localPadId !== session.localPadId || derived.remotePadId !== session.remotePadId) {
      console.error('Pair session pad ID mismatch — clearing corrupt entry')
      await clearPairSession(pairCode)
      return null
    }

    const encoder = new TextEncoder()
    const localSide = session.role
    const remoteSide = session.role === 1 ? 2 : 1

    const localContentKey = await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0),
        info: encoder.encode(`nostrpad-pair-content:${pairCode}:${localSide}`) },
      result.hkdfKey,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    )

    const remoteContentKey = await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0),
        info: encoder.encode(`nostrpad-pair-content:${pairCode}:${remoteSide}`) },
      result.hkdfKey,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    )

    return {
      localSecretKey: derived.localSecretKey,
      localPublicKey: derived.localPublicKey,
      localPadId: derived.localPadId,
      remotePadId: session.remotePadId,
      pairCode: session.pairCode,
      localContentKey,
      remoteContentKey
    }
  } catch (error) {
    console.error('Failed to derive pair session keys:', error)
    return null
  }
}

export async function clearPairSession(pairCode: string): Promise<void> {
  const db = await initPairDB()
  const transaction = db.transaction([SESSIONS_STORE], 'readwrite')
  const store = transaction.objectStore(SESSIONS_STORE)

  return new Promise((resolve, reject) => {
    const request = store.delete(pairCode)

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
