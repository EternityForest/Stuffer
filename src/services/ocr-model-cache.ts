// Offline-first cache for OCR model files.
//
// The PaddleOCR models are a few megabytes each, so they are downloaded once
// and stored as raw ArrayBuffers in IndexedDB. Every later run (including a
// fully offline PWA launch) reads them straight from the cache and never
// touches the network.

const DB_NAME = "stuffer-ocr-models";
const DB_VERSION = 1;
const STORE_NAME = "models";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function readCached(key: string): Promise<ArrayBuffer | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () =>
      resolve(request.result instanceof ArrayBuffer ? request.result : null);
    request.onerror = () => reject(request.error);
  });
}

async function writeCached(key: string, buffer: ArrayBuffer): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(buffer, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Return a cached model buffer, downloading and caching it on a miss.
 *
 * Caching failures are non-fatal: the freshly downloaded buffer is still
 * returned so OCR can run online.
 */
export async function loadOcrModel(
  key: string,
  url: string
): Promise<ArrayBuffer> {
  try {
    const cached = await readCached(key);
    if (cached) return cached;
  } catch (error) {
    console.warn("OCR model cache read failed:", error);
  }

  const response = await fetch(url, { referrerPolicy: "no-referrer" });
  if (!response.ok) {
    throw new Error(
      `Failed to download OCR model "${key}": ${response.status} ${response.statusText}`
    );
  }

  const buffer = await response.arrayBuffer();

  try {
    await writeCached(key, buffer);
  } catch (error) {
    console.warn("OCR model cache write failed:", error);
  }

  return buffer;
}
