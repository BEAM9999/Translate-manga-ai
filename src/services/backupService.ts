import JSZip from 'jszip';
import {
  AppSettings,
  MangaPlaylist,
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

function sanitizeFileName(name: string): string {
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

/**
 * Generates an organized JSZip archive containing the complete backup folder structure
 */
export async function buildBackupZip(bundle: BackupDataBundle): Promise<JSZip> {
  const zip = new JSZip();

  // 1. Root files
  zip.file('manifest.json', JSON.stringify(bundle.manifest, null, 2));

  if (bundle.settings) {
    zip.file('settings.json', JSON.stringify(bundle.settings, null, 2));
  }

  if (bundle.rawSmartPasteText) {
    zip.file('raw_keys_and_models.txt', bundle.rawSmartPasteText);
  }

  // Consolidated playlists for instant 1-click parsing
  zip.file('playlists.json', JSON.stringify(bundle.playlists, null, 2));

  if (bundle.homePlaylistContextId) {
    zip.file('home_playlist_context.txt', bundle.homePlaylistContextId);
  }

  if (bundle.workspaceDraftPages && bundle.workspaceDraftPages.length > 0) {
    zip.file('workspace_draft.json', JSON.stringify(bundle.workspaceDraftPages, null, 2));
  }

  // 2. Human-readable subfolders for each playlist
  const playlistsFolder = zip.folder('playlists');
  if (playlistsFolder) {
    for (let i = 0; i < bundle.playlists.length; i++) {
      const p = bundle.playlists[i];
      const safeName = sanitizeFileName(p.name || `Playlist_${i + 1}`);
      const plFolder = playlistsFolder.folder(`${safeName}_${p.id}`);

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

        // Chapters with page data & bubble translations
        if (p.chapters && p.chapters.length > 0) {
          plFolder.file('chapters.json', JSON.stringify(p.chapters, null, 2));
        }
      }
    }
  }

  return zip;
}

/**
 * Exports complete backup as a ZIP file (which extracts into an organized folder)
 */
export async function exportBackupToZipFile(currentSettings?: AppSettings): Promise<string> {
  const bundle = await gatherFullBackupBundle(currentSettings);
  const zip = await buildBackupZip(bundle);
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const timestampStr = formatTimestampForFilename(bundle.manifest.createdAt);
  const filename = `C2_Sub_Auto_AI_Backup_${timestampStr}.zip`;
  triggerFileDownload(blob, filename);
  return filename;
}

/**
 * Exports complete backup as a single JSON file
 */
export async function exportBackupToJsonFile(currentSettings?: AppSettings): Promise<string> {
  const bundle = await gatherFullBackupBundle(currentSettings);
  const jsonString = JSON.stringify(bundle, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });

  const timestampStr = formatTimestampForFilename(bundle.manifest.createdAt);
  const filename = `C2_Sub_Auto_AI_Backup_${timestampStr}.json`;
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
  currentSettings?: AppSettings
): Promise<{ success: boolean; folderName?: string; error?: string }> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('เบราว์เซอร์นี้ไม่รองรับ File System Access API กรุณาเลือกดาวน์โหลดเป็นไฟล์ ZIP');
  }

  try {
    const bundle = await gatherFullBackupBundle(currentSettings);
    const win = window as unknown as { showDirectoryPicker?: (options: { mode: string }) => Promise<FileSystemDirectoryHandle> };
    if (!win.showDirectoryPicker) {
      throw new Error('เบราว์เซอร์นี้ไม่รองรับ File System Access API');
    }
    const rootHandle = await win.showDirectoryPicker({
      mode: 'readwrite',
    });

    const timestampStr = formatTimestampForFilename(bundle.manifest.createdAt);
    const backupFolderName = `C2_Backup_${timestampStr}`;
    const backupDirHandle = await rootHandle.getDirectoryHandle(backupFolderName, { create: true });

    // Helper to write text/json file
    const writeFile = async (dir: FileSystemDirectoryHandle, name: string, content: string) => {
      const fileHandle = await dir.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
    };

    // 1. Root files
    await writeFile(backupDirHandle, 'manifest.json', JSON.stringify(bundle.manifest, null, 2));

    if (bundle.settings) {
      await writeFile(backupDirHandle, 'settings.json', JSON.stringify(bundle.settings, null, 2));
    }

    if (bundle.rawSmartPasteText) {
      await writeFile(backupDirHandle, 'raw_keys_and_models.txt', bundle.rawSmartPasteText);
    }

    await writeFile(backupDirHandle, 'playlists.json', JSON.stringify(bundle.playlists, null, 2));

    if (bundle.homePlaylistContextId) {
      await writeFile(backupDirHandle, 'home_playlist_context.txt', bundle.homePlaylistContextId);
    }

    if (bundle.workspaceDraftPages && bundle.workspaceDraftPages.length > 0) {
      await writeFile(backupDirHandle, 'workspace_draft.json', JSON.stringify(bundle.workspaceDraftPages, null, 2));
    }

    // 2. Playlists subfolders
    const playlistsDirHandle = await backupDirHandle.getDirectoryHandle('playlists', { create: true });
    for (let i = 0; i < bundle.playlists.length; i++) {
      const p = bundle.playlists[i];
      const safeName = sanitizeFileName(p.name || `Playlist_${i + 1}`);
      const plDirHandle = await playlistsDirHandle.getDirectoryHandle(`${safeName}_${p.id}`, { create: true });

      await writeFile(
        plDirHandle,
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

      if (p.memoryInstructions) {
        await writeFile(plDirHandle, 'context_instructions.txt', p.memoryInstructions);
      }

      if (p.memoryEntries && p.memoryEntries.length > 0) {
        await writeFile(plDirHandle, 'memory_glossary.json', JSON.stringify(p.memoryEntries, null, 2));
      }

      if (p.chapters && p.chapters.length > 0) {
        await writeFile(plDirHandle, 'chapters.json', JSON.stringify(p.chapters, null, 2));
      }
    }

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

  // 3. Playlists
  const playlistsFile = fileMap.get('playlists.json');
  if (playlistsFile) {
    try {
      const text = await playlistsFile.text();
      playlists = JSON.parse(text);
    } catch {}
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
