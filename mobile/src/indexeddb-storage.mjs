const DATABASE_NAME = 'norwescan-pwa-data';
const STORE_NAME = 'app-state';

function openDatabase(indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open browser storage.'));
    request.onblocked = () => reject(new Error('Browser storage is busy. Close other NORWEScan tabs and retry.'));
  });
}

function readValue(database, key) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(key);
    let value = null;
    request.onsuccess = () => { value = request.result ?? null; };
    request.onerror = () => reject(request.error || new Error('Could not read browser storage.'));
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () => reject(transaction.error || new Error('Could not read browser storage.'));
    transaction.onabort = () => reject(transaction.error || new Error('Browser storage read was interrupted.'));
  });
}

function writeValue(database, key, value) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(value, key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Could not save browser storage.'));
    transaction.onabort = () => reject(transaction.error || new Error('Browser storage write was interrupted.'));
  });
}

export function createIndexedDbStorage(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) throw new Error('This browser does not support local app storage.');

  let databasePromise;
  function getDatabase() {
    if (!databasePromise) {
      databasePromise = openDatabase(indexedDB).catch(error => {
        databasePromise = null;
        throw error;
      });
    }
    return databasePromise;
  }

  return {
    async getItem(key) {
      return readValue(await getDatabase(), key);
    },
    async setItem(key, value) {
      await writeValue(await getDatabase(), key, value);
    },
  };
}
