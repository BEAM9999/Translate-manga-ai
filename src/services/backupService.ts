import JSZip from 'jszip';
import {
  AppSettings,
  MangaPlaylist,
  MangaChapter,
  MangaPage,
  PlaylistMemoryEntry,
} from '../types';
import {
  getAllPlaylists,
  savePlaylist,
  clearAllPlaylists,
} from './playlistStorageService';
import {
  loadPagesFromLocalStorage,
  savePagesToLocalStorage,
} from './storageService';

export const BACKUP_FORMAT_VERSION = '1.0.0';
export const SETTINGS_STORAGE_KEY = 'freebuff_manga_app_settings_v1';
export const HOME_PLAYLIST_CONTEXT_STORAGE_KEY = 'c2_sub_auto_ai_home_playlist_context_v1';

export interface BackupManifest {
  appName: string;
  formatVersion: string;
  createdAt: number;
  createdDateString: string;
  stats: {
    hasSettings: boolean;
    geminiKeysCount: number;
    openRouterModelsCount: number;
    playlistsCount: number;
    totalChaptersCount: number;
    totalMemoriesCount: number;
    hasWorkspaceDraft: boolean;
    workspaceDraftPagesCount: number;
  };
}

export interface BackupDataBundle {
  manifest: BackupManifest;
  settings?: AppSettings;
  homePlaylistContextId?: string | null;
  playlists: MangaPlaylist[];
  workspaceDraftPages?: MangaPage[] | null;
  rawSmartPasteText?: string;
}

export interface BackupValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  bundle?: BackupDataBundle;
  stats?: {
    playlistsCount: number;
    chaptersCount: number;
    memoriesCount: number;
    hasSettings: boolean;
    hasApiKeys: boolean;
    openRouterModelsCount: number;
    geminiKeysCount: number;
  };
}

export interface RestoreOptions {
  restoreSettings: boolean;
  restorePlaylists: boolean;
  playlistRestoreMode: 'merge' | 'overwrite';
  restoreWorkspaceDraft: boolean;
}

export interface RestoreResult {
  settingsRestored: boolean;
  playlistsAddedCount: number;
  playlistsUpdatedCount: number;
  totalPlaylistsCount: number;
  chaptersRestoredCount: number;
  workspaceDraftRestored: boolean;
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'unnamed';
}

function formatTimestampForFilename(timestamp: number): string {
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hh}-${min}`;
}

/**
 * Gathers all current application data into a single consolidated BackupDataBundle
 */
export async function gatherFullBackupBundle(
  currentSettings?: AppSettings
): Promise<BackupDataBundle> {
  // 1. Settings
  let settings: AppSettings | undefined = currentSettings;
  if (!settings) {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        settings = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to read settings from localStorage for backup:', e);
    }
  }

  // 2. Home Playlist Context ID
  let homePlaylistContextId: string | null = null;
  try {
    homePlaylistContextId = localStorage.getItem(HOME_PLAYLIST_CONTEXT_STORAGE_KEY);
  } catch {}

  // 3. Playlists & Chapters
  const playlists = await getAllPlaylists();

  // 4. Workspace Draft (active unfinished pages in Home Studio)
  let workspaceDraftPages: MangaPage[] | null = null;
  try {
    workspaceDraftPages = await loadPagesFromLocalStorage();
  } catch {}

  // Calculate statistics
  const now = Date.now();
  const geminiKeysCount = settings?.geminiApiKeysPool?.length || (settings?.apiKey ? 1 : 0);
  const openRouterModelsCount = settings?.openRouterModelEntries?.length || 0;
  const totalChaptersCount = playlists.reduce((sum, p) => sum + (p.chapters?.length || 0), 0);
  const totalMemoriesCount = playlists.reduce((sum, p) => sum + (p.memoryEntries?.length || 0), 0);
  const workspaceDraftPagesCount = workspaceDraftPages?.length || 0;

  const manifest: BackupManifest = {
    appName: 'C2 Sub Auto AI',
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: now,
    createdDateString: new Date(now).toLocaleString('th-TH'),
    stats: {
      hasSettings: Boolean(settings),
      geminiKeysCount,
      openRouterModelsCount,
      playlistsCount: playlists.length,
      totalChaptersCount,
      totalMemoriesCount,
      hasWorkspaceDraft: workspaceDraftPagesCount > 0,
      workspaceDraftPagesCount,
    },
  };

  return {
    manifest,
    settings,
    homePlaylistContextId,
    playlists,
    workspaceDraftPages,
    rawSmartPasteText: settings?.rawSmartPasteText || '',
  };
}

export interface BackupExportOptions {
  includeImages?: boolean;
}

export interface ExtractedBinaryImage {
  data: Uint8Array;
  mime: string;
  ext: string;
}

/**
 * Parses a Data URL (base64) into raw binary Uint8Array without string expansion
 */
export function parseDataUrl(dataUrl: string): ExtractedBinaryImage | null {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return null;
  }
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) return null;

  const header = dataUrl.slice(0, commaIndex);
  const base64Data = dataUrl.slice(commaIndex + 1);
  const mimeMatch = header.match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  let ext = 'jpg';
  if (mime.includes('png')) ext = 'png';
  else if (mime.includes('webp')) ext = 'webp';
  else if (mime.includes('gif')) ext = 'gif';
  else if (mime.includes('svg')) ext = 'svg';

  try {
    const binaryStr = atob(base64Data);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return { data: bytes, mime, ext };
  } catch (e) {
    console.warn('Failed to decode data URL binary:', e);
    return null;
  }
}

/**
 * Creates a lightweight copy of the backup bundle without heavy image data
 */
export function stripImagesFromBundle(bundle: BackupDataBundle): BackupDataBundle {
  return {
    ...bundle,
    playlists: (bundle.playlists || []).map(p => ({
      ...p,
      chapters: (p.chapters || []).map(ch => ({
        ...ch,
        thumbnailUrl: '',
        pages: (ch.pages || []).map(pg => ({
          ...pg,
          originalImageUrl: '',
        })),
      })),
    })),
    workspaceDraftPages: bundle.workspaceDraftPages
      ? bundle.workspaceDraftPages.map(pg => ({ ...pg, originalImageUrl: '' }))
      : null,
  };
}

/**
 * Downloads a Blob or DataURL as a file in the browser
 */
export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export interface DirectoryExportProgress {
  stage: 'init' | 'writing' | 'completed';
  current: number;
  total: number;
  percent: number;
  message: string;
  currentTitle?: string;
}

export type DirectoryExportProgressCallback = (progress: DirectoryExportProgress) => void;

/**
 * Builds a lightweight standalone ZIP archive for a single chapter with separated binary images.
 * Keeps RAM usage strictly bounded to that single chapter (< 30 MB).
 */
export async function buildSingleChapterZip(
  chapter: MangaChapter,
  includeImages = true
): Promise<Blob> {
  const zip = new JSZip();
  const imagesFolder = includeImages ? zip.folder('images') : null;

  const processedPages: MangaPage[] = (chapter.pages || []).map((page, pIdx) => {
    const cleanPage = { ...page };
    if (includeImages && cleanPage.originalImageUrl) {
      const parsed = parseDataUrl(cleanPage.originalImageUrl);
      if (parsed && imagesFolder) {
        const filename = `img_p${pIdx + 1}.${parsed.ext}`;
        imagesFolder.file(filename, parsed.data, { binary: true });
        cleanPage.originalImageUrl = `images/${filename}`;
      }
    } else if (!includeImages) {
      cleanPage.originalImageUrl = '';
    }
    return cleanPage;
  });

  let cleanThumbnailUrl = '';
  if (includeImages && chapter.thumbnailUrl) {
    const parsedThumb = parseDataUrl(chapter.thumbnailUrl);
    if (parsedThumb && imagesFolder) {
      const thumbFilename = `thumb.${parsedThumb.ext}`;
      imagesFolder.file(thumbFilename, parsedThumb.data, { binary: true });
      cleanThumbnailUrl = `images/${thumbFilename}`;
    }
  }

  const cleanChapter: MangaChapter = {
    ...chapter,
    thumbnailUrl: cleanThumbnailUrl,
    pages: processedPages,
  };

  zip.file('chapter.json', JSON.stringify(cleanChapter, null, 2));

  return await zip.generateAsync({
    type: 'blob',
    compression: 'STORE',
  });
}

/**
 * Rehydrates a standalone chapter ZIP archive back into a full MangaChapter with Base64 Data URLs
 */
export async function restoreSingleChapterZip(zipBlob: Blob | ArrayBuffer): Promise<MangaChapter> {
  const arrayBuf = zipBlob instanceof ArrayBuffer ? zipBlob : await (zipBlob as Blob).arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuf);
  const chapterFile = zip.file('chapter.json');
  if (!chapterFile) {
    throw new Error('ไม่พบข้อมูล chapter.json ในไฟล์ตอน');
  }
  const chapterJsonText = await chapterFile.async('text');
  const chapter: MangaChapter = JSON.parse(chapterJsonText);

  // Rehydrate page images
  const hydratedPages: MangaPage[] = [];
  for (const page of chapter.pages || []) {
    const cleanPage = { ...page };
    if (cleanPage.originalImageUrl && cleanPage.originalImageUrl.startsWith('images/')) {
      const imgFile = zip.file(cleanPage.originalImageUrl);
      if (imgFile) {
        const ext = cleanPage.originalImageUrl.split('.').pop()?.toLowerCase() || 'jpg';
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        const b64 = await imgFile.async('base64');
        cleanPage.originalImageUrl = `data:${mime};base64,${b64}`;
      }
    }
    hydratedPages.push(cleanPage);
  }

  // Rehydrate thumbnail
  let hydratedThumb = chapter.thumbnailUrl || '';
  if (hydratedThumb.startsWith('images/')) {
    const thumbFile = zip.file(hydratedThumb);
    if (thumbFile) {
      const ext = hydratedThumb.split('.').pop()?.toLowerCase() || 'jpg';
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const b64 = await thumbFile.async('base64');
      hydratedThumb = `data:${mime};base64,${b64}`;
    }
  }

  return {
    ...chapter,
    thumbnailUrl: hydratedThumb,
    pages: hydratedPages,
  };
}

/**
 * Generates an organized JSZip archive containing the complete backup folder structure.
 * Page images are extracted into separate binary files in the zip to prevent "Invalid string length" errors.
 */
export async function buildBackupZip(
  bundle: BackupDataBundle,
  options: BackupExportOptions = { includeImages: true }
): Promise<JSZip> {
  const includeImages = options.includeImages !== false;
  const zip = new JSZip();

  // 1. Root files
  zip.file('manifest.json', JSON.stringify(bundle.manifest, null, 2));

  if (bundle.settings) {
    zip.file('settings.json', JSON.stringify(bundle.settings, null, 2));
  }

  if (bundle.rawSmartPasteText) {
    zip.file('raw_keys_and_models.txt', bundle.rawSmartPasteText);
  }

  if (bundle.homePlaylistContextId) {
    zip.file('home_playlist_context.txt', bundle.homePlaylistContextId);
  }

  // Workspace Draft Pages
  let processedDraftPages = bundle.workspaceDraftPages;
  if (bundle.workspaceDraftPages && bundle.workspaceDraftPages.length > 0) {
    if (includeImages) {
      const draftImagesFolder = zip.folder('draft_images');
      processedDraftPages = bundle.workspaceDraftPages.map((page, idx) => {
        const cleanPage = { ...page };
        if (cleanPage.originalImageUrl) {
          const parsed = parseDataUrl(cleanPage.originalImageUrl);
          if (parsed && draftImagesFolder) {
            const filename = `draft_${idx + 1}_${sanitizeFileName(cleanPage.id)}.${parsed.ext}`;
            draftImagesFolder.file(filename, parsed.data, { binary: true });
            cleanPage.originalImageUrl = `draft_images/${filename}`;
          }
        }
        return cleanPage;
      });
    } else {
      processedDraftPages = bundle.workspaceDraftPages.map(page => ({
        ...page,
        originalImageUrl: '',
      }));
    }
    zip.file('workspace_draft.json', JSON.stringify(processedDraftPages, null, 2));
  }

  // 2. Playlists & Chapters with separate binary images
  const playlistsFolder = zip.folder('playlists');
  const processedPlaylists: MangaPlaylist[] = [];

  for (let i = 0; i < bundle.playlists.length; i++) {
    const p = bundle.playlists[i];
    const safeName = sanitizeFileName(p.name || `Playlist_${i + 1}`);
    const plFolder = playlistsFolder ? playlistsFolder.folder(`${safeName}_${p.id}`) : null;
    const imagesFolder = includeImages && plFolder ? plFolder.folder('images') : null;

    // Process chapters
    const processedChapters: MangaChapter[] = (p.chapters || []).map((ch, chIdx) => {
      const cleanChapter: MangaChapter = {
        ...ch,
        pages: (ch.pages || []).map((page, pIdx) => {
          const cleanPage: MangaPage = { ...page };
          if (includeImages && cleanPage.originalImageUrl) {
            const parsed = parseDataUrl(cleanPage.originalImageUrl);
            if (parsed && imagesFolder) {
              const imgFilename = `img_ch${chIdx + 1}_p${pIdx + 1}_${sanitizeFileName(cleanPage.id)}.${parsed.ext}`;
              imagesFolder.file(imgFilename, parsed.data, { binary: true });
              cleanPage.originalImageUrl = `images/${imgFilename}`;
            }
          } else if (!includeImages) {
            cleanPage.originalImageUrl = '';
          }
          return cleanPage;
        }),
      };

      if (includeImages && cleanChapter.thumbnailUrl) {
        const parsedThumb = parseDataUrl(cleanChapter.thumbnailUrl);
        if (parsedThumb && imagesFolder) {
          const thumbFilename = `thumb_ch${chIdx + 1}_${sanitizeFileName(cleanChapter.id)}.${parsedThumb.ext}`;
          imagesFolder.file(thumbFilename, parsedThumb.data, { binary: true });
          cleanChapter.thumbnailUrl = `images/${thumbFilename}`;
        }
      } else if (!includeImages) {
        cleanChapter.thumbnailUrl = '';
      }

      return cleanChapter;
    });

    if (plFolder) {
      // Basic playlist info
      plFolder.file(
        'playlist_info.json',
        JSON.stringify(
          {
            id: p.id,
            name: p.name,
            description: p.description,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
            chapterCount: p.chapters?.length || 0,
            memoryEntriesCount: p.memoryEntries?.length || 0,
          },
          null,
          2
        )
      );

      // Story context instructions (plain text)
      if (p.memoryInstructions) {
        plFolder.file('context_instructions.txt', p.memoryInstructions);
      }

      // Memory glossary (names, organizations, skills)
      if (p.memoryEntries && p.memoryEntries.length > 0) {
        plFolder.file('memory_glossary.json', JSON.stringify(p.memoryEntries, null, 2));
      }

      // Chapters with page data & bubble translations (clean with relative images)
      if (processedChapters.length > 0) {
        plFolder.file('chapters.json', JSON.stringify(processedChapters, null, 2));
      }
    }

    processedPlaylists.push({
      ...p,
      chapters: processedChapters,
    });
  }

  // Consolidated playlists for instant 1-click parsing (compact with relative paths)
  zip.file('playlists.json', JSON.stringify(processedPlaylists, null, 2));

  return zip;
}

/**
 * Exports complete backup as a ZIP file (extracts into an organized folder).
 * Uses STORE compression so binary images do not trigger high CPU or V8 string allocation errors.
 */
export async function exportBackupToZipFile(
  currentSettings?: AppSettings,
  options: BackupExportOptions = { includeImages: true }
): Promise<string> {
  const bundle = await gatherFullBackupBundle(currentSettings);
  const zip = await buildBackupZip(bundle, options);
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'STORE',
  });

  const timestampStr = formatTimestampForFilename(bundle.manifest.createdAt);
  const suffix = options.includeImages === false ? '_compact' : '';
  const filename = `C2_Sub_Auto_AI_Backup_${timestampStr}${suffix}.zip`;
  triggerFileDownload(blob, filename);
  return filename;
}

/**
 * Exports backup as a single JSON file
 */
export async function exportBackupToJsonFile(
  currentSettings?: AppSettings,
  options: BackupExportOptions = { includeImages: true }
): Promise<string> {
  const bundle = await gatherFullBackupBundle(currentSettings);
  const targetBundle = options.includeImages === false ? stripImagesFromBundle(bundle) : bundle;

  let jsonString: string;
  try {
    jsonString = JSON.stringify(targetBundle, null, 2);
  } catch (err) {
    try {
      jsonString = JSON.stringify(targetBundle);
    } catch {
      throw new Error(
        'ข้อมูลมีขนาดใหญ่เกินกว่าที่เบราว์เซอร์จะรวมเป็นไฟล์ JSON เดียวได้ (Invalid string length) กรุณาใช้ตัวเลือก "ดาวน์โหลดเป็นโฟลเดอร์ ZIP" หรือปิดตัวเลือก "รวมรูปภาพมังงะ"'
      );
    }
  }

  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const timestampStr = formatTimestampForFilename(bundle.manifest.createdAt);
  const suffix = options.includeImages === false ? '_compact' : '';
  const filename = `C2_Sub_Auto_AI_Backup_${timestampStr}${suffix}.json`;
  triggerFileDownload(blob, filename);
  return filename;
}

/**
 * Checks if the browser supports the File System Access API (showDirectoryPicker)
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Exports complete backup directly into a folder selected by the user via File System Access API
 */
export async function exportBackupToDirectory(
  currentSettings?: AppSettings,
  options: BackupExportOptions = { includeImages: true },
  onProgress?: DirectoryExportProgressCallback
): Promise<{ success: boolean; folderName?: string; error?: string }> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('เบราว์เซอร์นี้ไม่รองรับ File System Access API กรุณาเลือกดาวน์โหลดเป็นไฟล์ ZIP');
  }

  try {
    const win = window as unknown as { showDirectoryPicker?: (options: { mode: string }) => Promise<FileSystemDirectoryHandle> };
    if (!win.showDirectoryPicker) {
      throw new Error('เบราว์เซอร์นี้ไม่รองรับ File System Access API');
    }
    const rootHandle = await win.showDirectoryPicker({
      mode: 'readwrite',
    });

    onProgress?.({
      stage: 'init',
      current: 0,
      total: 100,
      percent: 5,
      message: 'กำลังเตรียมโครงสร้างโฟลเดอร์สำหรับบันทึก...',
    });

    // 1. Settings & metadata
    let settings: AppSettings | undefined = currentSettings;
    if (!settings) {
      try {
        const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (stored) settings = JSON.parse(stored);
      } catch {}
    }

    let homePlaylistContextId: string | null = null;
    try {
      homePlaylistContextId = localStorage.getItem(HOME_PLAYLIST_CONTEXT_STORAGE_KEY);
    } catch {}

    const playlists = await getAllPlaylists();
    const includeImages = options.includeImages !== false;

    const totalChapters = playlists.reduce((sum, p) => sum + (p.chapters?.length || 0), 0);
    const now = Date.now();
    const timestampStr = formatTimestampForFilename(now);
    const suffix = includeImages === false ? '_compact' : '';
    const backupFolderName = `C2_Manga_Backup_Stream_${timestampStr}${suffix}`;
    const backupDirHandle = await rootHandle.getDirectoryHandle(backupFolderName, { create: true });

    // Helper to write text or blob file
    const writeFile = async (dir: FileSystemDirectoryHandle, name: string, content: string | Blob) => {
      const fileHandle = await dir.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
    };

    // 2. Write root metadata files
    const geminiKeysCount = settings?.geminiApiKeysPool?.length || (settings?.apiKey ? 1 : 0);
    const openRouterModelsCount = settings?.openRouterModelEntries?.length || 0;
    const totalMemoriesCount = playlists.reduce((sum, p) => sum + (p.memoryEntries?.length || 0), 0);

    const manifest: BackupManifest = {
      appName: 'C2 Sub Auto AI',
      formatVersion: BACKUP_FORMAT_VERSION,
      createdAt: now,
      createdDateString: new Date(now).toLocaleString('th-TH'),
      stats: {
        hasSettings: Boolean(settings),
        geminiKeysCount,
        openRouterModelsCount,
        playlistsCount: playlists.length,
        totalChaptersCount: totalChapters,
        totalMemoriesCount,
        hasWorkspaceDraft: false,
        workspaceDraftPagesCount: 0,
      },
    };

    if (settings) {
      await writeFile(backupDirHandle, 'settings.json', JSON.stringify(settings, null, 2));
    }

    if (settings?.rawSmartPasteText) {
      await writeFile(backupDirHandle, 'raw_keys_and_models.txt', settings.rawSmartPasteText);
    }

    if (homePlaylistContextId) {
      await writeFile(backupDirHandle, 'home_playlist_context.txt', homePlaylistContextId);
    }

    // Workspace Draft
    try {
      const draftPages = await loadPagesFromLocalStorage();
      if (draftPages && draftPages.length > 0) {
        manifest.stats.hasWorkspaceDraft = true;
        manifest.stats.workspaceDraftPagesCount = draftPages.length;
        const cleanDraft = draftPages.map(p => ({ ...p, originalImageUrl: '' }));
        await writeFile(backupDirHandle, 'workspace_draft.json', JSON.stringify(cleanDraft, null, 2));
      }
    } catch {}

    await writeFile(backupDirHandle, 'manifest.json', JSON.stringify(manifest, null, 2));

    // 3. Playlists Index (lightweight metadata without heavy Base64 images)
    const lightweightPlaylists = playlists.map(p => ({
      ...p,
      chapters: (p.chapters || []).map(ch => ({
        ...ch,
        thumbnailUrl: '',
        pages: (ch.pages || []).map(pg => ({ ...pg, originalImageUrl: '' })),
      })),
    }));
    await writeFile(backupDirHandle, 'playlists_index.json', JSON.stringify(lightweightPlaylists, null, 2));
    await writeFile(backupDirHandle, 'playlists.json', JSON.stringify(lightweightPlaylists, null, 2));

    // 4. Stream chapters into chapters/ subfolder (low RAM!)
    const chaptersDirHandle = await backupDirHandle.getDirectoryHandle('chapters', { create: true });

    let processedCount = 0;
    for (const p of playlists) {
      for (const ch of p.chapters || []) {
        const chapterTitle = `${p.name} - ${ch.chapterTitle}`;
        onProgress?.({
          stage: 'writing',
          current: processedCount,
          total: totalChapters,
          percent: Math.round(10 + (processedCount / (totalChapters || 1)) * 85),
          message: `กำลังบันทึกตอน: ${chapterTitle} (${processedCount + 1}/${totalChapters})...`,
          currentTitle: chapterTitle,
        });

        let chapterZipBlob: Blob | null = await buildSingleChapterZip(ch, includeImages);
        const filename = `ch_${sanitizeFileName(p.id)}_${sanitizeFileName(ch.id)}.zip`;
        await writeFile(chaptersDirHandle, filename, chapterZipBlob);

        chapterZipBlob = null; // Free RAM immediately!
        processedCount++;
      }
    }

    onProgress?.({
      stage: 'completed',
      current: totalChapters,
      total: totalChapters,
      percent: 100,
      message: `บันทึกข้อมูลเรียบร้อยทั้งหมด ${totalChapters} ตอนในโฟลเดอร์ "${backupFolderName}"`,
    });

    return { success: true, folderName: backupFolderName };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { success: false, error: 'ยกเลิกการเลือกโฟลเดอร์' };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเขียนโฟลเดอร์',
    };
  }
}

/**
 * Validates a parsed backup bundle structure
 */
export function validateBackupBundle(bundle: unknown): BackupValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!bundle || typeof bundle !== 'object') {
    return { isValid: false, errors: ['ไฟล์ข้อมูลสำรองไม่ถูกต้อง หรือรูปแบบไม่ตรงตามมาตรฐาน'], warnings };
  }

  const b = bundle as Partial<BackupDataBundle>;

  // Check playlists
  let playlists: MangaPlaylist[] = [];
  if (Array.isArray(b.playlists)) {
    playlists = b.playlists;
  } else if (Array.isArray(bundle)) {
    // Direct array of playlists
    playlists = bundle as MangaPlaylist[];
  } else if (b.settings && !b.playlists) {
    // Only settings backup
    playlists = [];
  } else {
    warnings.push('ไม่พบข้อมูลคลัง Playlist ในไฟล์สำรองนี้');
  }

  // Check settings
  const hasSettings = Boolean(b.settings && typeof b.settings === 'object');
  const hasApiKeys = Boolean(
    b.settings?.apiKey ||
    (b.settings?.geminiApiKeysPool && b.settings.geminiApiKeysPool.length > 0) ||
    b.settings?.openRouterApiKey ||
    (b.settings?.openRouterModelEntries && b.settings.openRouterModelEntries.length > 0)
  );

  const playlistsCount = playlists.length;
  const chaptersCount = playlists.reduce((sum, p) => sum + (Array.isArray(p.chapters) ? p.chapters.length : 0), 0);
  const memoriesCount = playlists.reduce((sum, p) => sum + (Array.isArray(p.memoryEntries) ? p.memoryEntries.length : 0), 0);
  const openRouterModelsCount = b.settings?.openRouterModelEntries?.length || 0;
  const geminiKeysCount = b.settings?.geminiApiKeysPool?.length || (b.settings?.apiKey ? 1 : 0);

  if (!hasSettings && playlistsCount === 0) {
    errors.push('ไฟล์สำรองนี้ไม่มีทั้งการตั้งค่าและคลัง Playlist ที่สามารถนำเข้าได้');
  }

  const normalizedBundle: BackupDataBundle = {
    manifest: b.manifest || {
      appName: 'C2 Sub Auto AI',
      formatVersion: BACKUP_FORMAT_VERSION,
      createdAt: Date.now(),
      createdDateString: new Date().toLocaleString('th-TH'),
      stats: {
        hasSettings,
        geminiKeysCount,
        openRouterModelsCount,
        playlistsCount,
        totalChaptersCount: chaptersCount,
        totalMemoriesCount: memoriesCount,
        hasWorkspaceDraft: Boolean(b.workspaceDraftPages && b.workspaceDraftPages.length > 0),
        workspaceDraftPagesCount: b.workspaceDraftPages?.length || 0,
      },
    },
    settings: b.settings,
    homePlaylistContextId: b.homePlaylistContextId || null,
    playlists,
    workspaceDraftPages: b.workspaceDraftPages || null,
    rawSmartPasteText: b.rawSmartPasteText || b.settings?.rawSmartPasteText || '',
  };

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    bundle: normalizedBundle,
    stats: {
      playlistsCount,
      chaptersCount,
      memoriesCount,
      hasSettings,
      hasApiKeys,
      openRouterModelsCount,
      geminiKeysCount,
    },
  };
}

/**
 * Parses and validates backup data from a ZIP file
 */
export async function parseBackupFromZip(
  file: File | Blob | ArrayBuffer | Uint8Array
): Promise<BackupValidationResult> {
  try {
    let zipData: ArrayBuffer | Uint8Array | string = file as ArrayBuffer;
    if (file && typeof (file as Blob).arrayBuffer === 'function') {
      zipData = await (file as Blob).arrayBuffer();
    }
    const zip = await JSZip.loadAsync(zipData);

    let settings: AppSettings | undefined;
    let playlists: MangaPlaylist[] = [];
    let workspaceDraftPages: MangaPage[] | null = null;
    let homePlaylistContextId: string | null = null;
    let rawSmartPasteText = '';
    let manifest: BackupManifest | undefined;

    // 1. Check for manifest.json
    const manifestFile = zip.file('manifest.json');
    if (manifestFile) {
      try {
        const text = await manifestFile.async('text');
        manifest = JSON.parse(text);
      } catch {}
    }

    // 2. Check for settings.json
    const settingsFile = zip.file('settings.json');
    if (settingsFile) {
      try {
        const text = await settingsFile.async('text');
        settings = JSON.parse(text);
      } catch {}
    }

    // 3. Check for raw_keys_and_models.txt
    const rawKeysFile = zip.file('raw_keys_and_models.txt');
    if (rawKeysFile) {
      try {
        rawSmartPasteText = await rawKeysFile.async('text');
      } catch {}
    }

    // 4. Check for playlists.json
    const playlistsFile = zip.file('playlists.json');
    if (playlistsFile) {
      try {
        const text = await playlistsFile.async('text');
        playlists = JSON.parse(text);
      } catch {}
    } else {
      // Look for individual playlists in playlists/ folder if playlists.json wasn't found
      const playlistFolders = Object.keys(zip.files).filter(f => f.startsWith('playlists/') && f.endsWith('/playlist_info.json'));
      for (const infoPath of playlistFolders) {
        try {
          const dirPath = infoPath.replace(/playlist_info\.json$/, '');
          const infoText = await zip.file(infoPath)?.async('text');
          if (!infoText) continue;
          const info = JSON.parse(infoText);

          let instructions: string | undefined;
          const instrFile = zip.file(`${dirPath}context_instructions.txt`);
          if (instrFile) {
            instructions = await instrFile.async('text');
          }

          let memoryEntries: PlaylistMemoryEntry[] = [];
          const memFile = zip.file(`${dirPath}memory_glossary.json`);
          if (memFile) {
            const memText = await memFile.async('text');
            memoryEntries = JSON.parse(memText);
          }

          let chapters = [];
          const chFile = zip.file(`${dirPath}chapters.json`);
          if (chFile) {
            const chText = await chFile.async('text');
            chapters = JSON.parse(chText);
          }

          playlists.push({
            id: info.id || `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: info.name || 'Untitled Playlist',
            description: info.description || '',
            createdAt: info.createdAt || Date.now(),
            updatedAt: info.updatedAt || Date.now(),
            chapters,
            memoryEntries,
            memoryInstructions: instructions,
          });
        } catch {}
      }
    }

    // 5. Check for workspace_draft.json
    const draftFile = zip.file('workspace_draft.json');
    if (draftFile) {
      try {
        const text = await draftFile.async('text');
        workspaceDraftPages = JSON.parse(text);
      } catch {}
    }

    // 6. Check for home_playlist_context.txt
    const ctxFile = zip.file('home_playlist_context.txt');
    if (ctxFile) {
      try {
        homePlaylistContextId = (await ctxFile.async('text')).trim();
      } catch {}
    }

    // Helper to resolve an image in the zip to a Data URL
    const resolveZipImage = async (imagePath?: string, dirPath = ''): Promise<string> => {
      if (!imagePath || imagePath.startsWith('data:') || imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        return imagePath || '';
      }
      let file = zip.file(dirPath + imagePath);
      if (!file) {
        file = zip.file(imagePath);
      }
      if (!file) {
        const basename = imagePath.split(/[/\\]/).pop();
        if (basename) {
          const matched = Object.keys(zip.files).find(k => k.endsWith('/' + basename) || k === basename);
          if (matched) {
            file = zip.file(matched);
          }
        }
      }
      if (file) {
        try {
          const ext = imagePath.split('.').pop()?.toLowerCase() || 'jpg';
          const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
          const b64 = await file.async('base64');
          return `data:${mime};base64,${b64}`;
        } catch {
          return imagePath;
        }
      }
      return imagePath;
    };

    // Rehydrate images for all playlists & chapters
    for (const pl of playlists) {
      const safeName = sanitizeFileName(pl.name || 'Playlist');
      const dirPath = `playlists/${safeName}_${pl.id}/`;
      if (Array.isArray(pl.chapters)) {
        for (const ch of pl.chapters) {
          if (ch.thumbnailUrl) {
            ch.thumbnailUrl = await resolveZipImage(ch.thumbnailUrl, dirPath);
          }
          if (Array.isArray(ch.pages)) {
            for (const page of ch.pages) {
              if (page.originalImageUrl) {
                page.originalImageUrl = await resolveZipImage(page.originalImageUrl, dirPath);
              }
            }
          }
        }
      }
    }

    if (Array.isArray(workspaceDraftPages)) {
      for (const page of workspaceDraftPages) {
        if (page.originalImageUrl) {
          page.originalImageUrl = await resolveZipImage(page.originalImageUrl, '');
        }
      }
    }

    const bundle: BackupDataBundle = {
      manifest: manifest || {
        appName: 'C2 Sub Auto AI',
        formatVersion: BACKUP_FORMAT_VERSION,
        createdAt: Date.now(),
        createdDateString: new Date().toLocaleString('th-TH'),
        stats: {
          hasSettings: Boolean(settings),
          geminiKeysCount: settings?.geminiApiKeysPool?.length || (settings?.apiKey ? 1 : 0),
          openRouterModelsCount: settings?.openRouterModelEntries?.length || 0,
          playlistsCount: playlists.length,
          totalChaptersCount: playlists.reduce((sum, p) => sum + (p.chapters?.length || 0), 0),
          totalMemoriesCount: playlists.reduce((sum, p) => sum + (p.memoryEntries?.length || 0), 0),
          hasWorkspaceDraft: Boolean(workspaceDraftPages && workspaceDraftPages.length > 0),
          workspaceDraftPagesCount: workspaceDraftPages?.length || 0,
        },
      },
      settings,
      playlists,
      workspaceDraftPages,
      homePlaylistContextId,
      rawSmartPasteText: rawSmartPasteText || settings?.rawSmartPasteText || '',
    };

    return validateBackupBundle(bundle);
  } catch (err) {
    return {
      isValid: false,
      errors: [`ไม่สามารถอ่านไฟล์ ZIP ได้: ${err instanceof Error ? err.message : String(err)}`],
      warnings: [],
    };
  }
}

/**
 * Parses and validates backup from a JSON file or JSON string
 */
export async function parseBackupFromJson(content: string | File): Promise<BackupValidationResult> {
  try {
    let jsonString: string;
    if (typeof content === 'string') {
      jsonString = content;
    } else {
      jsonString = await content.text();
    }

    const parsed = JSON.parse(jsonString);
    return validateBackupBundle(parsed);
  } catch (err) {
    return {
      isValid: false,
      errors: [`ไม่สามารถอ่านไฟล์ JSON ได้: ${err instanceof Error ? err.message : String(err)}`],
      warnings: [],
    };
  }
}

/**
 * Parses backup files from a directory upload via input[webkitdirectory]
 */
export async function parseBackupFromDirectoryFiles(files: FileList | File[]): Promise<BackupValidationResult> {
  const fileArray = Array.from(files);
  const fileMap = new Map<string, File>();

  for (const f of fileArray) {
    // Normalise path (remove top folder name)
    const relativePath = (f.webkitRelativePath || f.name).replace(/^[^/\\\\]+[/\\]/, '');
    fileMap.set(relativePath, f);
    fileMap.set(f.name, f);
  }

  let settings: AppSettings | undefined;
  let playlists: MangaPlaylist[] = [];
  let workspaceDraftPages: MangaPage[] | null = null;
  let homePlaylistContextId: string | null = null;
  let rawSmartPasteText = '';

  // 1. Settings
  const settingsFile = fileMap.get('settings.json');
  if (settingsFile) {
    try {
      const text = await settingsFile.text();
      settings = JSON.parse(text);
    } catch {}
  }

  // 2. Raw keys
  const rawFile = fileMap.get('raw_keys_and_models.txt');
  if (rawFile) {
    try {
      rawSmartPasteText = await rawFile.text();
    } catch {}
  }

  // 3. Playlists (Check modern distributed streaming format first, then fallback to playlists.json)
  let isDistributedStreamFormat = false;
  const playlistsIndexFile = fileMap.get('playlists_index.json');
  if (playlistsIndexFile) {
    try {
      const text = await playlistsIndexFile.text();
      playlists = JSON.parse(text);
      isDistributedStreamFormat = true;

      // Hydrate each chapter from chapters/ch_<plId>_<chId>.zip
      for (const pl of playlists) {
        const safePlId = sanitizeFileName(pl.id);
        if (Array.isArray(pl.chapters)) {
          const hydratedChapters: MangaChapter[] = [];
          for (const ch of pl.chapters) {
            const safeChId = sanitizeFileName(ch.id);
            const zipName = `ch_${safePlId}_${safeChId}.zip`;
            const chapterZipFile = fileMap.get(`chapters/${zipName}`) || fileMap.get(zipName);
            if (chapterZipFile) {
              try {
                const hydrated = await restoreSingleChapterZip(await chapterZipFile.arrayBuffer());
                hydratedChapters.push(hydrated);
              } catch {
                hydratedChapters.push(ch);
              }
            } else {
              hydratedChapters.push(ch);
            }
          }
          pl.chapters = hydratedChapters;
        }
      }
    } catch {}
  }

  if (!isDistributedStreamFormat) {
    const playlistsFile = fileMap.get('playlists.json');
    if (playlistsFile) {
      try {
        const text = await playlistsFile.text();
        playlists = JSON.parse(text);
      } catch {}
    }
  }

  // 4. Draft
  const draftFile = fileMap.get('workspace_draft.json');
  if (draftFile) {
    try {
      const text = await draftFile.text();
      workspaceDraftPages = JSON.parse(text);
    } catch {}
  }

  // 5. Context ID
  const ctxFile = fileMap.get('home_playlist_context.txt');
  if (ctxFile) {
    try {
      homePlaylistContextId = (await ctxFile.text()).trim();
    } catch {}
  }

  // Helper to resolve directory image into Data URL
  const resolveDirectoryImage = async (imagePath?: string, dirPrefix = ''): Promise<string> => {
    if (!imagePath || imagePath.startsWith('data:') || imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath || '';
    }
    const file = fileMap.get(dirPrefix + imagePath) || fileMap.get(imagePath) || fileMap.get(imagePath.split(/[/\\]/).pop() || '');
    if (file) {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : imagePath);
        reader.onerror = () => resolve(imagePath);
        reader.readAsDataURL(file);
      });
    }
    return imagePath;
  };

  // Rehydrate images for all playlists & chapters (only if legacy folder format)
  if (!isDistributedStreamFormat) {
    for (const pl of playlists) {
      const safeName = sanitizeFileName(pl.name || 'Playlist');
      const dirPrefix = `playlists/${safeName}_${pl.id}/`;
      if (Array.isArray(pl.chapters)) {
        for (const ch of pl.chapters) {
          if (ch.thumbnailUrl) {
            ch.thumbnailUrl = await resolveDirectoryImage(ch.thumbnailUrl, dirPrefix);
          }
          if (Array.isArray(ch.pages)) {
            for (const page of ch.pages) {
              if (page.originalImageUrl) {
                page.originalImageUrl = await resolveDirectoryImage(page.originalImageUrl, dirPrefix);
              }
            }
          }
        }
      }
    }
  }

  if (Array.isArray(workspaceDraftPages)) {
    for (const page of workspaceDraftPages) {
      if (page.originalImageUrl) {
        page.originalImageUrl = await resolveDirectoryImage(page.originalImageUrl, '');
      }
    }
  }

  return validateBackupBundle({
    settings,
    playlists,
    workspaceDraftPages,
    homePlaylistContextId,
    rawSmartPasteText: rawSmartPasteText || settings?.rawSmartPasteText || '',
  });
}

/**
 * Restores a validated backup bundle into the application storage
 */
export async function restoreBackupBundle(
  bundle: BackupDataBundle,
  options: RestoreOptions,
  onSettingsRestored?: (newSettings: AppSettings) => void
): Promise<RestoreResult> {
  let settingsRestored = false;
  let playlistsAddedCount = 0;
  let playlistsUpdatedCount = 0;
  let chaptersRestoredCount = 0;
  let workspaceDraftRestored = false;

  // 1. Restore Settings & API Keys
  if (options.restoreSettings && bundle.settings) {
    try {
      const mergedSettings: AppSettings = {
        ...bundle.settings,
        rawSmartPasteText: bundle.rawSmartPasteText || bundle.settings.rawSmartPasteText || '',
      };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(mergedSettings));
      if (bundle.homePlaylistContextId) {
        localStorage.setItem(HOME_PLAYLIST_CONTEXT_STORAGE_KEY, bundle.homePlaylistContextId);
      }
      if (onSettingsRestored) {
        onSettingsRestored(mergedSettings);
      }
      settingsRestored = true;
    } catch (err) {
      console.error('Failed to restore settings to localStorage:', err);
    }
  }

  // 2. Restore Playlists
  if (options.restorePlaylists && Array.isArray(bundle.playlists) && bundle.playlists.length > 0) {
    try {
      if (options.playlistRestoreMode === 'overwrite') {
        // Clear existing playlists first
        await clearAllPlaylists();
        for (const pl of bundle.playlists) {
          await savePlaylist(pl);
          playlistsAddedCount++;
          chaptersRestoredCount += pl.chapters?.length || 0;
        }
      } else {
        // Merge mode: retain existing playlists, update matching ones or add new
        const existing = await getAllPlaylists();
        const existingMap = new Map(existing.map(p => [p.id, p]));

        for (const incomingPl of bundle.playlists) {
          const match = existingMap.get(incomingPl.id);
          if (!match) {
            // New playlist
            await savePlaylist(incomingPl);
            playlistsAddedCount++;
            chaptersRestoredCount += incomingPl.chapters?.length || 0;
          } else {
            // Update / merge existing playlist
            const existingChapterIds = new Set((match.chapters || []).map(c => c.id));
            const newChapters = (incomingPl.chapters || []).filter(c => !existingChapterIds.has(c.id));
            const mergedChapters = [...(match.chapters || []), ...newChapters];

            // Merge memory entries
            const existingMemKeys = new Set((match.memoryEntries || []).map(m => m.sourceName.toLowerCase().trim()));
            const newMemories = (incomingPl.memoryEntries || []).filter(m => !existingMemKeys.has(m.sourceName.toLowerCase().trim()));
            const mergedMemories = [...(match.memoryEntries || []), ...newMemories];

            const mergedPlaylist: MangaPlaylist = {
              ...match,
              name: incomingPl.name || match.name,
              description: incomingPl.description || match.description,
              updatedAt: Math.max(match.updatedAt || 0, incomingPl.updatedAt || 0, Date.now()),
              memoryInstructions: incomingPl.memoryInstructions || match.memoryInstructions,
              memoryEntries: mergedMemories,
              chapters: mergedChapters,
            };

            await savePlaylist(mergedPlaylist);
            playlistsUpdatedCount++;
            chaptersRestoredCount += newChapters.length;
          }
        }
      }
    } catch (err) {
      console.error('Failed to restore playlists to storage:', err);
    }
  }

  // 3. Restore Workspace Draft (if selected and available)
  if (options.restoreWorkspaceDraft && bundle.workspaceDraftPages && bundle.workspaceDraftPages.length > 0) {
    try {
      await savePagesToLocalStorage(bundle.workspaceDraftPages);
      workspaceDraftRestored = true;
    } catch (err) {
      console.error('Failed to restore workspace draft:', err);
    }
  }

  const allCurrentPlaylists = await getAllPlaylists();

  return {
    settingsRestored,
    playlistsAddedCount,
    playlistsUpdatedCount,
    totalPlaylistsCount: allCurrentPlaylists.length,
    chaptersRestoredCount,
    workspaceDraftRestored,
  };
}
