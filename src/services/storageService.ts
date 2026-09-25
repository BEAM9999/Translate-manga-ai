import { MangaPage } from '../types';

const DB_NAME = 'C2SubAutoAI_WorkspaceDB_v1';
const DB_VERSION = 1;
const STORE_NAME = 'manga_pages_store';
const RECORD_KEY = 'active_manga_chapter';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this browser.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      database.onversionchange = () => database.close();
      resolve(database);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

/**
 * Saves all manga pages to local IndexedDB.
 * If pages is empty, it immediately clears the database.
 */
export async function savePagesToLocalStorage(pages: MangaPage[]): Promise<void> {
  try {
    if (!pages || pages.length === 0) {
      await clearSavedPagesStorage();
      return;
    }

    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const serializablePages = pages.map(p => ({
        id: p.id,
        originalImageUrl: p.originalImageUrl,
        width: p.width,
        height: p.height,
        isTranslating: false,
        isTranslated: p.isTranslated,
        ocrResults: p.ocrResults || [],
        orderIndex: p.orderIndex,
        cachedAt: p.cachedAt,
        originalTextCleanupAt: p.originalTextCleanupAt,
        translationsEmbedded: p.translationsEmbedded,
      }));

      const request = store.put(serializablePages, RECORD_KEY);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to save to local IndexedDB:', err);
  }
}

/**
 * Automatically restores all saved manga pages and translations on page reload / startup
 */
export async function loadPagesFromLocalStorage(): Promise<MangaPage[] | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(RECORD_KEY);

      request.onsuccess = () => {
        const result = request.result as MangaPage[];
        if (result && Array.isArray(result) && result.length > 0) {
          resolve(result);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to restore from local IndexedDB:', err);
    return null;
  }
}

/**
 * Clears local IndexedDB when user deletes all pages or clicks clear/reset
 */
export async function clearSavedPagesStorage(): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(RECORD_KEY);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to clear local IndexedDB:', err);
  }
}
