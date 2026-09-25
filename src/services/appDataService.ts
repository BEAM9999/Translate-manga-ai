import type { MangaPage, MangaPlaylist } from '../types';

const APP_STORAGE_KEYS = [
  'freebuff_manga_app_settings_v1',
  'c2_sub_auto_ai_home_playlist_context_v1',
  'c2_sub_auto_ai_playlists_backup',
  'freebuff_manga_cache_index',
];

const OCR_CACHE_PREFIX = 'freebuff_manga_ocr_v1_';
const APP_DATABASES = [
  'C2SubAutoAI_WorkspaceDB_v1',
  'C2SubAutoAI_PlaylistsDB_v1',
];

const APP_STORES = {
  'C2SubAutoAI_WorkspaceDB_v1': 'manga_pages_store',
  'C2SubAutoAI_PlaylistsDB_v1': 'playlists_store',
};

export interface AppDataStats {
  totalBytes: number;
  pageCount: number;
  bubbleCount: number;
  playlistCount: number;
  chapterCount: number;
  cacheEntryCount: number;
  settingsCount: number;
}

function readStoreRecords(databaseName: string, storeName: string): Promise<unknown[]> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve([]);
      return;
    }

    const read = async () => {
      try {
        const databases = await indexedDB.databases?.();
        if (databases && !databases.some((database) => database.name === databaseName)) {
          resolve([]);
          return;
        }

        const database = await new Promise<IDBDatabase>((openResolve, openReject) => {
          const request = indexedDB.open(databaseName);
          request.onsuccess = () => openResolve(request.result);
          request.onerror = () => openReject(request.error);
        });

        if (!database.objectStoreNames.contains(storeName)) {
          database.close();
          resolve([]);
          return;
        }

        const request = database.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        request.onsuccess = () => {
          database.close();
          resolve(request.result);
        };
        request.onerror = () => {
          database.close();
          resolve([]);
        };
      } catch {
        resolve([]);
      }
    };

    void read();
  });
}

function getFallbackPlaylists(): MangaPlaylist[] {
  try {
    const value = localStorage.getItem('c2_sub_auto_ai_playlists_backup');
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed as MangaPlaylist[] : [];
  } catch {
    return [];
  }
}

export async function getAppDataStats(): Promise<AppDataStats> {
  let totalBytes = 0;
  let cacheEntryCount = 0;
  let settingsCount = 0;

  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key || (!APP_STORAGE_KEYS.includes(key) && !key.startsWith(OCR_CACHE_PREFIX))) continue;

      totalBytes += new Blob([key, localStorage.getItem(key) || '']).size;
      if (key.startsWith(OCR_CACHE_PREFIX)) cacheEntryCount++;
      if (key === 'freebuff_manga_app_settings_v1') settingsCount = 1;
    }
  } catch {
    // Continue with IndexedDB estimates when localStorage is unavailable.
  }

  const [workspaceRecords, playlistRecords] = await Promise.all([
    readStoreRecords('C2SubAutoAI_WorkspaceDB_v1', APP_STORES.C2SubAutoAI_WorkspaceDB_v1),
    readStoreRecords('C2SubAutoAI_PlaylistsDB_v1', APP_STORES.C2SubAutoAI_PlaylistsDB_v1),
  ]);
  const workspacePages = workspaceRecords.flatMap((record) => Array.isArray(record) ? record : [record]) as MangaPage[];
  const storedPlaylists = playlistRecords.filter((record): record is MangaPlaylist =>
    Boolean(record && typeof record === 'object' && 'chapters' in record)
  );
  const playlistsById = new Map<string, MangaPlaylist>();
  getFallbackPlaylists().forEach((playlist) => playlistsById.set(playlist.id, playlist));
  storedPlaylists.forEach((playlist) => playlistsById.set(playlist.id, playlist));

  const pagesById = new Map<string, MangaPage>();
  workspacePages.forEach((page) => {
    if (page && typeof page.id === 'string') pagesById.set(page.id, page);
  });
  const chaptersById = new Set<string>();
  playlistsById.forEach((playlist) => {
    (playlist.chapters || []).forEach((chapter, chapterIndex) => {
      chaptersById.add(chapter.id || `${playlist.id}:${chapterIndex}`);
      (chapter.pages || []).forEach((page) => {
        if (page && typeof page.id === 'string') pagesById.set(page.id, page);
      });
    });
  });

  const bubbleIds = new Set<string>();
  pagesById.forEach((page) => {
    (page.ocrResults || []).forEach((bubble) => bubbleIds.add(`${page.id}:${bubble.id}`));
  });
  [...workspaceRecords, ...playlistRecords].forEach((record) => {
    totalBytes += new Blob([JSON.stringify(record)]).size;
  });

  return {
    totalBytes,
    pageCount: pagesById.size,
    bubbleCount: bubbleIds.size,
    playlistCount: playlistsById.size,
    chapterCount: chaptersById.size,
    cacheEntryCount,
    settingsCount,
  };
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error(`Failed to delete ${name}`));
    request.onblocked = () => reject(new Error(`Database deletion is blocked: ${name}`));
  });
}

export async function clearAllAppData(): Promise<void> {
  APP_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith(OCR_CACHE_PREFIX)) {
      localStorage.removeItem(key);
    }
  });

  if (typeof indexedDB !== 'undefined') {
    await Promise.all(APP_DATABASES.map(deleteDatabase));
  }
}