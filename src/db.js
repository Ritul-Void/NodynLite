const DB_NAME = 'KnowledgeFoxDB';
const DB_VERSION = 1;
const VECTORS_STORE = 'vectors';
const SETTINGS_STORE = 'settings';
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(VECTORS_STORE)) {
        const store = db.createObjectStore(VECTORS_STORE, {
          keyPath: ['origin', 'chunkIndex']
        });
        store.createIndex('by_origin', 'origin', {
          unique: false
        });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, {
          keyPath: 'key'
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function storeVectors(origin, records) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VECTORS_STORE, 'readwrite');
    const store = tx.objectStore(VECTORS_STORE);
    for (const record of records) {
      store.put({
        origin,
        chunkIndex: record.chunkIndex,
        text: record.text,
        embedding: record.embedding
      });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function getVectorsByOrigin(origin) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VECTORS_STORE, 'readonly');
    const index = tx.objectStore(VECTORS_STORE).index('by_origin');
    const request = index.getAll(origin);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function clearVectorsByOrigin(origin) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VECTORS_STORE, 'readwrite');
    const store = tx.objectStore(VECTORS_STORE);
    const index = store.index('by_origin');
    const request = index.openCursor(origin);
    request.onsuccess = event => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function setSetting(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    tx.objectStore(SETTINGS_STORE).put({
      key,
      value
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function getSetting(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly');
    const request = tx.objectStore(SETTINGS_STORE).get(key);
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
}
