import {
  MangaPlaylist,
  MangaChapter,
  MangaPage,
  PlaylistMemoryCategory,
  PlaylistMemoryEntry,
  PlaylistMemorySource,
} from '../types';

const PLAYLIST_DB_NAME = 'C2SubAutoAI_PlaylistsDB_v1';
const PLAYLIST_DB_VERSION = 1;
const PLAYLIST_STORE_NAME = 'playlists_store';
const LOCAL_STORAGE_FALLBACK_KEY = 'c2_sub_auto_ai_playlists_backup';

const MEMORY_CATEGORIES: PlaylistMemoryCategory[] = [
  'character',
  'organization',
  'university',
  'school',
  'pronoun',
  'power_rank',
  'skill',
  'character_level',
  'location',
  'item',
  'other',
];

const MEMORY_SOURCES: PlaylistMemorySource[] = ['user', 'ai', 'shared'];
const playlistWriteQueues = new Map<string, Promise<unknown>>();
let fallbackWriteQueue: Promise<void> = Promise.resolve();

export type PlaylistMemoryEntryInput = Pick<
  PlaylistMemoryEntry,
  'sourceName' | 'thaiName' | 'category'
> & Partial<Omit<PlaylistMemoryEntry, 'sourceName' | 'thaiName' | 'category'>>;

export interface PlaylistMemoryMergeResult {
  entries: PlaylistMemoryEntry[];
  addedEntries: PlaylistMemoryEntry[];
  skippedCount: number;
}

export interface PlaylistMemoryShareResult {
  playlistId: string;
  addedCount: number;
  skippedCount: number;
}

function cleanMemoryText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizeMemoryInstructions(value: unknown): string {
  if (typeof value !== 'string') return '';

  const instructions = value.replace(/\r\n?/g, '\n');
  return instructions.trim() ? instructions : '';
}

function stripMatchingQuotes(value: string): string {
  const trimmed = cleanMemoryText(value);
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'") || (first === '“' && last === '”')) {
      return cleanMemoryText(trimmed.slice(1, -1));
    }
  }
  return trimmed;
}

/**
 * Extracts only explicit name mappings from the legacy AI Memory textarea.
 * Free-form translation instructions remain story context rather than fake glossary entries.
 */
export function extractPlaylistMemoryEntriesFromInstructions(instructions: string): PlaylistMemoryEntryInput[] {
  const extracted: PlaylistMemoryEntryInput[] = [];
  const addMapping = (sourceName: string, thaiName: string) => {
    const source = stripMatchingQuotes(sourceName);
    const thai = stripMatchingQuotes(thaiName);
    if (!source || !thai || source.length > 120 || thai.length > 120) return;
    extracted.push({ sourceName: source, thaiName: thai, category: 'other', source: 'user' });
  };

  instructions.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*(?:[-*]\s*)?(.+?)\s*(?:->|=>|→)\s*(.+?)\s*$/);
    if (match) addMapping(match[1], match[2]);
  });

  const thaiInstructionPattern = /ถ้าเจอ(?:ชื่อ)?\s*["“]([^"”]+)["”]\s*ให้แปล(?:ว่า)?\s*["“]([^"”]+)["”]/g;
  let instructionMatch: RegExpExecArray | null;
  while ((instructionMatch = thaiInstructionPattern.exec(instructions)) !== null) {
    addMapping(instructionMatch[1], instructionMatch[2]);
  }

  return mergePlaylistMemoryEntryLists([], extracted, 'user').entries;
}

function isMemoryCategory(value: unknown): value is PlaylistMemoryCategory {
  return MEMORY_CATEGORIES.includes(value as PlaylistMemoryCategory);
}

function isMemorySource(value: unknown): value is PlaylistMemorySource {
  return MEMORY_SOURCES.includes(value as PlaylistMemorySource);
}

export function normalizePlaylistMemoryKey(sourceName: string): string {
  return cleanMemoryText(sourceName).toLocaleLowerCase();
}

function normalizeMemoryEntry(
  input: PlaylistMemoryEntryInput,
  fallbackSource: PlaylistMemorySource
): PlaylistMemoryEntry | null {
  const sourceName = cleanMemoryText(input.sourceName);
  const thaiName = cleanMemoryText(input.thaiName);

  if (!sourceName || !thaiName) return null;

  const now = Date.now();
  return {
    id: cleanMemoryText(input.id) || `memory_${now}_${Math.random().toString(36).slice(2, 8)}`,
    sourceName,
    thaiName,
    category: isMemoryCategory(input.category) ? input.category : 'other',
    notes: cleanMemoryText(input.notes) || undefined,
    source: isMemorySource(input.source) ? input.source : fallbackSource,
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === 'number' ? input.updatedAt : now,
  };
}

function normalizeMemoryEntries(rawEntries: PlaylistMemoryEntry[]): PlaylistMemoryEntry[] {
  return rawEntries.reduce<PlaylistMemoryEntry[]>((entries, entry) => {
    const normalized = normalizeMemoryEntry(
      {
        id: entry.id,
        sourceName: entry.sourceName,
        thaiName: entry.thaiName,
        category: entry.category,
        notes: entry.notes,
        source: entry.source,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      },
      'user'
    );

    if (normalized) entries.push(normalized);
    return entries;
  }, []);
}

function getMemoryEntriesFromPlaylist(playlist: MangaPlaylist): PlaylistMemoryEntry[] {
  const rawEntries = Array.isArray(playlist.memoryEntries) ? playlist.memoryEntries : [];
  return normalizeMemoryEntries(rawEntries);
}

function hydratePlaylist(playlist: MangaPlaylist): MangaPlaylist {
  const memoryInstructions = normalizeMemoryInstructions(playlist.memoryInstructions);

  return {
    ...playlist,
    memoryEntries: getMemoryEntriesFromPlaylist(playlist),
    memoryInstructions: memoryInstructions || undefined,
  };
}

function getFallbackPlaylists(): MangaPlaylist[] {
  try {
    const fallback = localStorage.getItem(LOCAL_STORAGE_FALLBACK_KEY);
    const parsed = fallback ? JSON.parse(fallback) : [];
    return Array.isArray(parsed) ? parsed.map(hydratePlaylist) : [];
  } catch {
    return [];
  }
}

function enqueueFallbackWrite(operation: () => void): Promise<void> {
  const next = fallbackWriteQueue.catch(() => undefined).then(operation);
  fallbackWriteQueue = next;
  return next;
}

async function upsertFallbackPlaylist(playlist: MangaPlaylist): Promise<void> {
  await enqueueFallbackWrite(() => {
    const playlists = getFallbackPlaylists();
    const playlistIndex = playlists.findIndex(item => item.id === playlist.id);
    const nextPlaylists = [...playlists];

    if (playlistIndex === -1) {
      nextPlaylists.push(hydratePlaylist(playlist));
    } else {
      nextPlaylists[playlistIndex] = hydratePlaylist(playlist);
    }

    try {
      localStorage.setItem(LOCAL_STORAGE_FALLBACK_KEY, JSON.stringify(nextPlaylists));
    } catch (err) {
      console.warn('Failed to save playlist fallback:', err);
    }
  });
}

async function deleteFallbackPlaylist(playlistId: string): Promise<void> {
  await enqueueFallbackWrite(() => {
    try {
      localStorage.setItem(
        LOCAL_STORAGE_FALLBACK_KEY,
        JSON.stringify(getFallbackPlaylists().filter(playlist => playlist.id !== playlistId))
      );
    } catch (err) {
      console.warn('Failed to delete playlist fallback:', err);
    }
  });
}

function enqueuePlaylistWrite<T>(playlistId: string, operation: () => Promise<T>): Promise<T> {
  const previous = playlistWriteQueues.get(playlistId) || Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  playlistWriteQueues.set(playlistId, next);

  return next.finally(() => {
    if (playlistWriteQueues.get(playlistId) === next) {
      playlistWriteQueues.delete(playlistId);
    }
  });
}

function openPlaylistDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported.'));
      return;
    }

    const request = window.indexedDB.open(PLAYLIST_DB_NAME, PLAYLIST_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PLAYLIST_STORE_NAME)) {
        db.createObjectStore(PLAYLIST_STORE_NAME, { keyPath: 'id' });
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
 * Retrieves all playlists with their chapters from IndexedDB
 */
export async function getAllPlaylists(): Promise<MangaPlaylist[]> {
  try {
    const db = await openPlaylistDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(PLAYLIST_STORE_NAME, 'readonly');
      const store = transaction.objectStore(PLAYLIST_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const result = request.result as MangaPlaylist[];
        if (result && Array.isArray(result)) {
          // Sort by latest updated
          resolve(result.map(hydratePlaylist).sort((a, b) => b.updatedAt - a.updatedAt));
        } else {
          resolve([]);
        }
      };

      request.onerror = () => {
        resolve(getFallbackPlaylists());
      };
    });
  } catch {
    return getFallbackPlaylists();
  }
}

async function writePlaylist(playlist: MangaPlaylist): Promise<void> {
  try {
    const db = await openPlaylistDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(PLAYLIST_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(PLAYLIST_STORE_NAME);
      const request = store.put(playlist);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to save playlist in IndexedDB; using local backup:', err);
    await upsertFallbackPlaylist(playlist);
  }
}

/**
 * Saves a single playlist to IndexedDB.
 * Writes for the same playlist run in order so memory and chapter saves cannot overwrite each other.
 */
export async function savePlaylist(playlist: MangaPlaylist): Promise<void> {
  const hydratedPlaylist = hydratePlaylist(playlist);
  await enqueuePlaylistWrite(playlist.id, () => writePlaylist(hydratedPlaylist));
}

async function mutatePlaylist<T>(
  playlistId: string,
  mutation: (playlist: MangaPlaylist) => T
): Promise<T> {
  return enqueuePlaylistWrite(playlistId, async () => {
    const playlists = await getAllPlaylists();
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist) {
      throw new Error('ไม่พบ Playlist ที่ระบุ');
    }

    const result = mutation(playlist);
    playlist.memoryEntries = getMemoryEntriesFromPlaylist(playlist);
    playlist.updatedAt = Date.now();
    await writePlaylist(playlist);
    return result;
  });
}

export async function getPlaylistById(playlistId: string): Promise<MangaPlaylist | null> {
  const playlists = await getAllPlaylists();
  return playlists.find(playlist => playlist.id === playlistId) || null;
}

/**
 * Creates a new playlist
 */
export async function createPlaylist(name: string, description = ''): Promise<MangaPlaylist> {
  const newPlaylist: MangaPlaylist = {
    id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    description: description.trim(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    chapters: [],
    memoryEntries: [],
  };

  await savePlaylist(newPlaylist);
  return newPlaylist;
}

/**
 * Renames or updates a playlist description
 */
export async function updatePlaylist(playlistId: string, name: string, description?: string): Promise<void> {
  await mutatePlaylist(playlistId, (playlist) => {
    playlist.name = name.trim();
    if (description !== undefined) playlist.description = description.trim();
  });
}

async function removePlaylistRecord(playlistId: string): Promise<void> {
  try {
    const db = await openPlaylistDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(PLAYLIST_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(PLAYLIST_STORE_NAME);
      const request = store.delete(playlistId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to delete playlist in IndexedDB; using local backup:', err);
    await deleteFallbackPlaylist(playlistId);
  }
}

/**
 * Deletes an entire playlist and all its saved chapters
 */
export async function deletePlaylist(playlistId: string): Promise<void> {
  await enqueuePlaylistWrite(playlistId, () => removePlaylistRecord(playlistId));
}

/**
 * Removes ALL playlists from storage. Used by backup restore in "overwrite" mode.
 */
export async function clearAllPlaylists(): Promise<void> {
  const all = await getAllPlaylists();
  for (const pl of all) {
    await deletePlaylist(pl.id);
  }
}

/**
 * Saves or updates a chapter within a playlist
 */
export async function saveChapterToPlaylist(
  playlistId: string,
  chapterTitle: string,
  pages: MangaPage[]
): Promise<MangaChapter> {
  return mutatePlaylist(playlistId, (targetPlaylist) => {
    const cleanPages: MangaPage[] = pages.map((p, idx) => ({
      id: p.id || `p_${idx}`,
      originalImageUrl: p.originalImageUrl,
      width: p.width,
      height: p.height,
      isTranslating: false,
      isTranslated: p.isTranslated,
      ocrResults: p.ocrResults,
      orderIndex: idx + 1,
      cachedAt: p.cachedAt,
      originalTextCleanupAt: p.originalTextCleanupAt,
      translationsEmbedded: p.translationsEmbedded,
    }));

    const totalBubbles = cleanPages.reduce((sum, p) => sum + (p.ocrResults?.length || 0), 0);
    const thumbnailUrl = cleanPages[0]?.originalImageUrl || '';
    const newChapter: MangaChapter = {
      id: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      playlistId,
      chapterTitle: chapterTitle.trim() || `ตอนที่ ${targetPlaylist.chapters.length + 1}`,
      thumbnailUrl,
      pageCount: cleanPages.length,
      translatedBubbleCount: totalBubbles,
      pages: cleanPages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    targetPlaylist.chapters.push(newChapter);
    return newChapter;
  });
}

/**
 * Renames a chapter
 */
export async function renameChapter(playlistId: string, chapterId: string, newTitle: string): Promise<void> {
  await mutatePlaylist(playlistId, (playlist) => {
    const chapter = playlist.chapters.find(c => c.id === chapterId);
    if (!chapter) return;

    chapter.chapterTitle = newTitle.trim();
    chapter.updatedAt = Date.now();
  });
}

/**
 * Deletes a chapter from a playlist
 */
export async function deleteChapter(playlistId: string, chapterId: string): Promise<void> {
  await mutatePlaylist(playlistId, (playlist) => {
    playlist.chapters = playlist.chapters.filter(c => c.id !== chapterId);
  });
}

/**
 * Updates the pages and OCR results of an existing chapter in a playlist
 */
export async function updateChapterPages(
  playlistId: string,
  chapterId: string,
  pages: MangaPage[]
): Promise<void> {
  await mutatePlaylist(playlistId, (playlist) => {
    const chapter = playlist.chapters.find(c => c.id === chapterId);
    if (!chapter) return;

    const cleanPages: MangaPage[] = pages.map((p, idx) => ({
      id: p.id || `p_${idx}`,
      originalImageUrl: p.originalImageUrl,
      width: p.width,
      height: p.height,
      isTranslating: false,
      isTranslated: p.isTranslated,
      ocrResults: p.ocrResults || [],
      orderIndex: idx + 1,
      cachedAt: p.cachedAt,
      originalTextCleanupAt: p.originalTextCleanupAt,
      translationsEmbedded: p.translationsEmbedded,
    }));

    const totalBubbles = cleanPages.reduce((sum, p) => sum + (p.ocrResults?.length || 0), 0);
    const thumbnailUrl = cleanPages[0]?.originalImageUrl || chapter.thumbnailUrl || '';

    chapter.pages = cleanPages;
    chapter.pageCount = cleanPages.length;
    chapter.translatedBubbleCount = totalBubbles;
    chapter.thumbnailUrl = thumbnailUrl;
    chapter.updatedAt = Date.now();
  });
}

export async function getPlaylistMemoryEntries(playlistId: string): Promise<PlaylistMemoryEntry[]> {
  const playlist = await getPlaylistById(playlistId);
  return playlist ? getMemoryEntriesFromPlaylist(playlist) : [];
}

export async function savePlaylistMemoryEntry(
  playlistId: string,
  input: PlaylistMemoryEntryInput
): Promise<PlaylistMemoryEntry> {
  return mutatePlaylist(playlistId, (playlist) => {
    const entries = getMemoryEntriesFromPlaylist(playlist);
    const existing = input.id ? entries.find(entry => entry.id === input.id) : undefined;
    const normalized = normalizeMemoryEntry(
      {
        ...input,
        id: existing?.id || input.id,
        source: existing?.source || input.source || 'user',
        createdAt: existing?.createdAt || input.createdAt,
        updatedAt: Date.now(),
      },
      'user'
    );

    if (!normalized) {
      throw new Error('กรุณาระบุชื่อภาษาอังกฤษหรือชื่อต้นฉบับ และชื่อภาษาไทย');
    }

    const duplicate = entries.find(entry =>
      entry.id !== normalized.id &&
      normalizePlaylistMemoryKey(entry.sourceName) === normalizePlaylistMemoryKey(normalized.sourceName)
    );
    if (duplicate) {
      throw new Error(`มีข้อมูล "${duplicate.sourceName}" อยู่ใน Playlist นี้แล้ว`);
    }

    const savedEntry: PlaylistMemoryEntry = {
      ...normalized,
      source: existing?.source || normalized.source,
      createdAt: existing?.createdAt || normalized.createdAt,
      updatedAt: Date.now(),
    };
    playlist.memoryEntries = existing
      ? entries.map(entry => entry.id === savedEntry.id ? savedEntry : entry)
      : [...entries, savedEntry];
    return savedEntry;
  });
}

export async function deletePlaylistMemoryEntry(playlistId: string, entryId: string): Promise<void> {
  await mutatePlaylist(playlistId, (playlist) => {
    playlist.memoryEntries = getMemoryEntriesFromPlaylist(playlist)
      .filter(entry => entry.id !== entryId);
  });
}

export async function savePlaylistMemoryInstructions(
  playlistId: string,
  instructions: string
): Promise<void> {
  await mutatePlaylist(playlistId, (playlist) => {
    playlist.memoryInstructions = normalizeMemoryInstructions(instructions) || undefined;
  });
}

export function mergePlaylistMemoryEntryLists(
  existingEntries: PlaylistMemoryEntry[],
  incomingEntries: PlaylistMemoryEntryInput[],
  source: PlaylistMemorySource = 'ai'
): PlaylistMemoryMergeResult {
  const entries = normalizeMemoryEntries(existingEntries);
  const knownKeys = new Set(entries.map(entry => normalizePlaylistMemoryKey(entry.sourceName)));
  const addedEntries: PlaylistMemoryEntry[] = [];
  let skippedCount = 0;

  incomingEntries.forEach((incoming) => {
    const normalized = normalizeMemoryEntry(
      {
        ...incoming,
        id: undefined,
        source,
        createdAt: undefined,
        updatedAt: undefined,
      },
      source
    );
    const key = normalized ? normalizePlaylistMemoryKey(normalized.sourceName) : '';

    if (!normalized || !key || knownKeys.has(key)) {
      skippedCount += 1;
      return;
    }

    knownKeys.add(key);
    addedEntries.push(normalized);
  });

  return {
    entries: [...entries, ...addedEntries],
    addedEntries,
    skippedCount,
  };
}

export async function mergePlaylistMemoryEntries(
  playlistId: string,
  incomingEntries: PlaylistMemoryEntryInput[],
  source: PlaylistMemorySource = 'ai'
): Promise<PlaylistMemoryMergeResult> {
  return mutatePlaylist(playlistId, (playlist) => {
    const result = mergePlaylistMemoryEntryLists(
      getMemoryEntriesFromPlaylist(playlist),
      incomingEntries,
      source
    );
    playlist.memoryEntries = result.entries;
    return result;
  });
}

export async function sharePlaylistMemoryEntries(
  sourcePlaylistId: string,
  targetPlaylistIds: string[]
): Promise<PlaylistMemoryShareResult[]> {
  const sourcePlaylist = await getPlaylistById(sourcePlaylistId);
  if (!sourcePlaylist) {
    throw new Error('ไม่พบ Playlist ต้นทางสำหรับแชร์ข้อมูล');
  }

  const sourceEntries = getMemoryEntriesFromPlaylist(sourcePlaylist);
  const uniqueTargetIds = [...new Set(targetPlaylistIds)]
    .filter(playlistId => playlistId && playlistId !== sourcePlaylistId);

  return Promise.all(uniqueTargetIds.map(async (playlistId) => {
    const result = await mergePlaylistMemoryEntries(playlistId, sourceEntries, 'shared');
    return {
      playlistId,
      addedCount: result.addedEntries.length,
      skippedCount: result.skippedCount,
    };
  }));
}

export function formatPlaylistMemoryDirectives(
  entries: PlaylistMemoryEntry[],
  instructions = ''
): string {
  const glossary = normalizeMemoryEntries(entries)
    .sort((left, right) => left.category.localeCompare(right.category) || left.sourceName.localeCompare(right.sourceName))
    .map(entry => {
      const note = entry.notes ? ` | note: ${entry.notes}` : '';
      return `- [${entry.category}] ${entry.sourceName} => ${entry.thaiName}${note}`;
    })
    .join('\n');
  const storyInstructions = normalizeMemoryInstructions(instructions);

  if (!storyInstructions) return glossary;
  if (!glossary) return `STORY CONTEXT RULES:\n${storyInstructions}`;
  return `${glossary}\n\nSTORY CONTEXT RULES:\n${storyInstructions}`;
}

export function getPlaylistMemoryFingerprint(
  entries: PlaylistMemoryEntry[],
  instructions = ''
): string {
  const source = formatPlaylistMemoryDirectives(entries, instructions);
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `memory_${(hash >>> 0).toString(36)}`;
}
