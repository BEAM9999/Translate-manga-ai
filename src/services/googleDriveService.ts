import JSZip from 'jszip';
import {
  AppSettings,
  MangaPlaylist,
  MangaChapter,
  MangaPage,
} from '../types';
import {
  gatherFullBackupBundle,
  buildBackupZip,
  parseBackupFromZip,
  restoreBackupBundle,
  parseDataUrl,
  sanitizeFileName,
  buildSingleChapterZip,
  restoreSingleChapterZip,
  RestoreOptions,
  RestoreResult,
  BackupDataBundle,
  BackupManifest,
  BACKUP_FORMAT_VERSION,
  SETTINGS_STORAGE_KEY,
  HOME_PLAYLIST_CONTEXT_STORAGE_KEY,
} from './backupService';

export { buildSingleChapterZip, restoreSingleChapterZip };
import {
  getAllPlaylists,
  savePlaylist,
  clearAllPlaylists,
} from './playlistStorageService';
import {
  loadPagesFromLocalStorage,
  savePagesToLocalStorage,
} from './storageService';

export const DEFAULT_GOOGLE_CLIENT_ID = '15083734589-ud2cargqgm96rl2lvg8qjrc6v8otnpeg.apps.googleusercontent.com';
export const GOOGLE_DRIVE_TOKEN_KEY = 'c2_google_drive_access_token_v1';
export const GOOGLE_DRIVE_EXPIRES_KEY = 'c2_google_drive_token_expires_v1';
export const GOOGLE_DRIVE_USER_KEY = 'c2_google_drive_user_v1';
export const GOOGLE_DRIVE_LAST_SYNC_KEY = 'c2_google_drive_last_sync_v1';
export const GOOGLE_DRIVE_FOLDER_NAME = 'C2_Translate_Manga_Data';
export const GOOGLE_DRIVE_BACKUP_ZIP_NAME = 'C2_Manga_Cloud_Backup.zip';
export const GOOGLE_DRIVE_MANIFEST_NAME = 'manifest.json';
export const GOOGLE_DRIVE_PLAYLISTS_INDEX_NAME = 'playlists_index.json';
export const GOOGLE_DRIVE_SETTINGS_NAME = 'settings.json';
export const GOOGLE_DRIVE_CHAPTERS_FOLDER_NAME = 'chapters';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export interface GoogleDriveUser {
  email: string;
  name: string;
  picture: string;
  connectedAt: number;
}

export interface GoogleDriveBackupInfo {
  exists: boolean;
  isDistributed?: boolean;
  fileId?: string;
  name?: string;
  size?: number;
  modifiedTime?: string;
  chapterCount?: number;
}

export interface CloudSyncProgress {
  stage: 'checking' | 'uploading' | 'downloading' | 'completed' | 'error';
  current: number;
  total: number;
  chapterTitle?: string;
  percent: number;
  message: string;
}

export type CloudSyncProgressCallback = (progress: CloudSyncProgress) => void;

let activeTokenClient: unknown = null;

/**
 * Dynamically loads Google Identity Services (GIS) client script if not already present
 */
export function loadGoogleGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }
    const win = window as unknown as { google?: { accounts?: { oauth2?: unknown } } };
    if (win.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const existing = document.getElementById('google-gsi-client');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', (e) => reject(e));
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-client';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('ไม่สามารถโหลดสคริปต์ Google Identity Services ได้'));
    document.head.appendChild(script);
  });
}

/**
 * Retrieves the currently stored valid access token, or null if expired/not found
 */
export function getStoredAccessToken(): string | null {
  try {
    const token = localStorage.getItem(GOOGLE_DRIVE_TOKEN_KEY);
    const expires = localStorage.getItem(GOOGLE_DRIVE_EXPIRES_KEY);
    if (!token) return null;
    if (expires) {
      const expTime = parseInt(expires, 10);
      // Give a 60-second buffer
      if (Date.now() >= expTime - 60000) {
        return null;
      }
    }
    return token;
  } catch {
    return null;
  }
}

/**
 * Retrieves the currently connected Google Drive user from storage
 */
export function getStoredGoogleUser(): GoogleDriveUser | null {
  try {
    const raw = localStorage.getItem(GOOGLE_DRIVE_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Gets the timestamp of the last successful cloud sync
 */
export function getLastSyncTimestamp(): number | null {
  try {
    const raw = localStorage.getItem(GOOGLE_DRIVE_LAST_SYNC_KEY);
    return raw ? parseInt(raw, 10) : null;
  } catch {
    return null;
  }
}

/**
 * Requests an access token from Google via Google Identity Services popup
 */
export async function signInWithGoogleDrive(customClientId?: string): Promise<GoogleDriveUser> {
  await loadGoogleGsiScript();

  const clientId = customClientId || DEFAULT_GOOGLE_CLIENT_ID;
  const win = window as unknown as {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string; expires_in?: number; scope?: string }) => void;
            error_callback?: (err: unknown) => void;
          }) => {
            requestAccessToken: (options?: { prompt?: string }) => void;
          };
        };
      };
    };
  };

  if (!win.google?.accounts?.oauth2) {
    throw new Error('ระบบ Google Identity Services ยังไม่พร้อมใช้งาน');
  }

  return new Promise((resolve, reject) => {
    try {
      const tokenClient = win.google!.accounts!.oauth2!.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_SCOPES,
        callback: async (tokenResponse) => {
          if (tokenResponse.error) {
            reject(new Error(`การเข้าสู่ระบบล้มเหลว: ${tokenResponse.error}`));
            return;
          }

          if (!tokenResponse.access_token) {
            reject(new Error('ไม่ได้รับ Access Token จาก Google'));
            return;
          }

          // Check if Google Drive permission was granted by user
          const grantedScopes = tokenResponse.scope || '';
          if (grantedScopes && !grantedScopes.includes('drive.file')) {
            reject(
              new Error(
                'คุณยังไม่ได้ติ๊กอนุญาตสิทธิ์เข้าถึง Google Drive: ตอนเข้าสู่ระบบ Google จะมีหน้าต่างขอสิทธิ์ "ดู แก้ไข สร้าง และลบไฟล์ Google Drive ที่แอปนี้ใช้" กรุณากดเชื่อมต่อใหม่อีกครั้งและติ๊กถูกที่ช่องนี้'
              )
            );
            return;
          }

          const now = Date.now();
          const expiresInMs = (tokenResponse.expires_in || 3600) * 1000;
          localStorage.setItem(GOOGLE_DRIVE_TOKEN_KEY, tokenResponse.access_token);
          localStorage.setItem(GOOGLE_DRIVE_EXPIRES_KEY, (now + expiresInMs).toString());

          // Fetch user profile info
          try {
            const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
            });
            if (userRes.ok) {
              const userData = await userRes.json();
              const user: GoogleDriveUser = {
                email: userData.email || '',
                name: userData.name || userData.email || 'ผู้ใช้ Google Drive',
                picture: userData.picture || '',
                connectedAt: now,
              };
              localStorage.setItem(GOOGLE_DRIVE_USER_KEY, JSON.stringify(user));
              resolve(user);
              return;
            }
          } catch {
            // Fallback user profile
            const fallbackUser: GoogleDriveUser = {
              email: 'Google Account',
              name: 'ผู้ใช้ Google Drive',
              picture: '',
              connectedAt: Date.now(),
            };
            localStorage.setItem(GOOGLE_DRIVE_USER_KEY, JSON.stringify(fallbackUser));
            resolve(fallbackUser);
          }
        },
        error_callback: (err) => {
          reject(new Error(`เกิดข้อผิดพลาดในการเรียก Google OAuth: ${String(err)}`));
        },
      });

      activeTokenClient = tokenClient;
      tokenClient.requestAccessToken({ prompt: 'consent select_account' });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Disconnects Google Drive from local session
 */
export function signOutGoogleDrive(): void {
  try {
    const token = getStoredAccessToken();
    if (token) {
      const win = window as unknown as {
        google?: { accounts?: { oauth2?: { revoke: (t: string, cb?: () => void) => void } } };
      };
      if (win.google?.accounts?.oauth2?.revoke) {
        win.google.accounts.oauth2.revoke(token, () => {});
      }
    }
  } catch {}

  localStorage.removeItem(GOOGLE_DRIVE_TOKEN_KEY);
  localStorage.removeItem(GOOGLE_DRIVE_EXPIRES_KEY);
  localStorage.removeItem(GOOGLE_DRIVE_USER_KEY);
}

/**
 * Formats a comprehensive, user-friendly error message from a failed Google Drive API HTTP response
 */
export async function extractDriveError(res: Response, defaultMessage: string): Promise<Error> {
  let detail = '';
  try {
    const errorBody = await res.json();
    if (errorBody?.error?.message) {
      detail = errorBody.error.message;
    } else if (typeof errorBody === 'string') {
      detail = errorBody;
    }
  } catch {
    try {
      detail = await res.text();
    } catch {}
  }

  const statusMsg = `HTTP ${res.status}${res.statusText ? ` (${res.statusText})` : ''}`;
  console.error(`[GoogleDrive API Error] ${defaultMessage}:`, statusMsg, detail);

  // 401: Token expired or revoked
  if (res.status === 401) {
    localStorage.removeItem(GOOGLE_DRIVE_TOKEN_KEY);
    localStorage.removeItem(GOOGLE_DRIVE_EXPIRES_KEY);
    return new Error(
      `โทเค็นเชื่อมต่อ Google Drive หมดอายุหรือถูกยกเลิก (401 Unauthorized): กรุณากดปุ่ม "ออกจากระบบ" แล้วกดเชื่อมต่อใหม่อีกครั้ง`
    );
  }

  // 403: Permission / Scope denied
  if (res.status === 403) {
    localStorage.removeItem(GOOGLE_DRIVE_TOKEN_KEY);
    localStorage.removeItem(GOOGLE_DRIVE_EXPIRES_KEY);
    const detailLower = detail.toLowerCase();
    if (detailLower.includes('insufficient') || detailLower.includes('scope')) {
      return new Error(
        `ยังไม่ได้รับสิทธิ์เข้าถึง Google Drive (403 Insufficient Scope): ตอนเข้าสู่ระบบ Google จะมีหน้าต่างขอสิทธิ์ "ดู แก้ไข สร้าง และลบไฟล์ Google Drive ที่แอปนี้ใช้" ให้ติ๊กเครื่องหมายถูกที่ช่องนี้ด้วยครับ`
      );
    }
    if (detailLower.includes('access_denied') || detailLower.includes('not approved') || detailLower.includes('test user')) {
      return new Error(
        `บัญชีนี้ยังไม่ได้รับอนุญาตให้ทดสอบแอป (403 Access Denied): กรุณาเพิ่มอีเมลนี้ลงใน "Test users" ใน Google Cloud Console หรือใช้อีเมลเจ้าของโครงการ`
      );
    }
    return new Error(`ไม่มีสิทธิ์เข้าถึง Google Drive (403): ${detail || statusMsg}`);
  }

  // 404: Not found
  if (res.status === 404) {
    return new Error(`ไม่พบไฟล์หรือโฟลเดอร์บน Google Drive (404): ${detail || statusMsg}`);
  }

  return new Error(`${defaultMessage}: ${detail || statusMsg}`);
}

/**
 * Helper to ensure we have a valid access token, prompting login if needed
 */
export async function ensureValidAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh) {
    const token = getStoredAccessToken();
    if (token) return token;
  }

  const user = await signInWithGoogleDrive();
  const freshToken = getStoredAccessToken();
  if (!freshToken) {
    throw new Error('ไม่พบ Access Token กรุณาเข้าสู่ระบบ Google Drive อีกครั้ง');
  }
  return freshToken;
}

/**
 * Finds or creates the dedicated C2_Translate_Manga_Data folder in Google Drive
 */
export async function findOrCreateAppFolder(accessToken: string): Promise<string> {
  const query = `name='${GOOGLE_DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!searchRes.ok) {
    throw await extractDriveError(searchRes, 'ไม่สามารถค้นหาโฟลเดอร์ Google Drive');
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create folder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: GOOGLE_DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createRes.ok) {
    throw await extractDriveError(createRes, 'ไม่สามารถสร้างโฟลเดอร์ใน Google Drive ได้');
  }

  const created = await createRes.json();
  return created.id;
}

/**
 * Finds or creates a subfolder within a parent Google Drive folder
 */
export async function findOrCreateSubfolder(
  accessToken: string,
  parentFolderId: string,
  folderName: string
): Promise<string> {
  const query = `'${parentFolderId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!searchRes.ok) {
    throw await extractDriveError(searchRes, 'ไม่สามารถค้นหาโฟลเดอร์ย่อย');
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create subfolder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      parents: [parentFolderId],
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createRes.ok) {
    throw await extractDriveError(createRes, `ไม่สามารถสร้างโฟลเดอร์ย่อย ${folderName} ได้`);
  }

  const created = await createRes.json();
  return created.id;
}

/**
 * Lists all non-trashed files in a Google Drive folder with pagination
 */
export async function listDriveFilesInFolder(
  accessToken: string,
  folderId: string
): Promise<Map<string, { id: string; name: string; size?: number; modifiedTime?: string }>> {
  const map = new Map<string, { id: string; name: string; size?: number; modifiedTime?: string }>();
  let pageToken: string | undefined = undefined;

  do {
    let url = `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false&fields=nextPageToken,files(id,name,size,modifiedTime)&pageSize=1000`;
    if (pageToken) {
      url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw await extractDriveError(res, 'ไม่สามารถดึงรายชื่อไฟล์ในโฟลเดอร์ Google Drive');
    }

    const data = await res.json();
    if (data.files && Array.isArray(data.files)) {
      for (const f of data.files) {
        map.set(f.name, {
          id: f.id,
          name: f.name,
          size: f.size ? parseInt(f.size, 10) : undefined,
          modifiedTime: f.modifiedTime,
        });
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return map;
}

/**
 * Uploads a new file or updates (PATCH) an existing file in Google Drive using multipart upload
 */
export async function uploadOrUpdateDriveFile(
  token: string,
  parentFolderId: string,
  fileName: string,
  mimeType: string,
  content: Blob | string,
  existingFileId?: string
): Promise<{ id: string; name: string; modifiedTime: string }> {
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = existingFileId
    ? { name: fileName }
    : { name: fileName, parents: [parentFolderId] };

  let contentBlob: Blob;
  if (typeof content === 'string') {
    contentBlob = new Blob([content], { type: mimeType });
  } else {
    contentBlob = content;
  }

  const arrayBuffer = await contentBlob.arrayBuffer();

  const multipartRequestBody = new Blob(
    [
      delimiter,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      delimiter,
      `Content-Type: ${mimeType}\r\n\r\n`,
      arrayBuffer,
      closeDelimiter,
    ],
    { type: `multipart/related; boundary=${boundary}` }
  );

  let uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime';
  let method = 'POST';

  if (existingFileId) {
    uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,modifiedTime`;
    method = 'PATCH';
  }

  const res = await fetch(uploadUrl, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!res.ok) {
    throw await extractDriveError(res, `อัปโหลดไฟล์ ${fileName} ล้มเหลว`);
  }

  const data = await res.json();
  return {
    id: data.id,
    name: data.name,
    modifiedTime: data.modifiedTime,
  };
}

/**
 * Downloads a file from Google Drive as a binary Blob with support for large files (acknowledgeAbuse) and streaming progress
 */
export async function downloadDriveFileBlob(
  token: string,
  fileId: string,
  onDownloadProgress?: (loaded: number, total: number) => void
): Promise<Blob> {
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&acknowledgeAbuse=true`;
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw await extractDriveError(res, `ดาวน์โหลดไฟล์ ${fileId} ล้มเหลว`);
  }

  // Stream chunks if progress callback provided and ReadableStream is available
  if (onDownloadProgress && res.body && typeof res.body.getReader === 'function') {
    const contentLength = res.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    const reader = res.body.getReader();
    const chunks: BlobPart[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        onDownloadProgress(received, total || received);
      }
    }

    const contentType = res.headers.get('content-type') || 'application/zip';
    return new Blob(chunks, { type: contentType });
  }

  return await res.blob();
}

/**
 * Downloads a file from Google Drive as plain text
 */
export async function downloadDriveFileText(token: string, fileId: string): Promise<string> {
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&acknowledgeAbuse=true`;
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw await extractDriveError(res, `ดาวน์โหลดข้อความ ${fileId} ล้มเหลว`);
  }
  return await res.text();
}



/**
 * Checks for existing backup inside the Google Drive app folder.
 * Supports both modern distributed backups (folder/chapter stream) and legacy monolithic ZIP.
 */
export async function getGoogleDriveBackupInfo(): Promise<GoogleDriveBackupInfo> {
  const token = getStoredAccessToken();
  if (!token) return { exists: false };

  try {
    const folderId = await findOrCreateAppFolder(token);
    const rootFiles = await listDriveFilesInFolder(token, folderId);

    // 1. Check for modern distributed backup
    const manifestFile = rootFiles.get(GOOGLE_DRIVE_MANIFEST_NAME);
    const playlistsIndexFile = rootFiles.get(GOOGLE_DRIVE_PLAYLISTS_INDEX_NAME);

    if (playlistsIndexFile || manifestFile) {
      let totalSize = (manifestFile?.size || 0) + (playlistsIndexFile?.size || 0);
      let latestModified = playlistsIndexFile?.modifiedTime || manifestFile?.modifiedTime;

      const chaptersFolderId = await findOrCreateSubfolder(token, folderId, GOOGLE_DRIVE_CHAPTERS_FOLDER_NAME);
      const chapterFiles = await listDriveFilesInFolder(token, chaptersFolderId);

      for (const f of chapterFiles.values()) {
        totalSize += f.size || 0;
        if (!latestModified || (f.modifiedTime && f.modifiedTime > latestModified)) {
          latestModified = f.modifiedTime;
        }
      }

      return {
        exists: true,
        isDistributed: true,
        size: totalSize,
        modifiedTime: latestModified,
        chapterCount: chapterFiles.size,
      };
    }

    // 2. Fallback to legacy monolithic ZIP
    const legacyZip = rootFiles.get(GOOGLE_DRIVE_BACKUP_ZIP_NAME);
    if (legacyZip) {
      return {
        exists: true,
        isDistributed: false,
        fileId: legacyZip.id,
        name: legacyZip.name,
        size: legacyZip.size,
        modifiedTime: legacyZip.modifiedTime,
      };
    }

    return { exists: false };
  } catch {
    return { exists: false };
  }
}

/**
 * Uploads full backup to Google Drive using a Distributed & Incremental Streaming architecture.
 * Processes ONE chapter at a time to prevent RAM exhaustion, and skips chapters that haven't changed.
 */
export async function uploadBackupToGoogleDrive(
  currentSettings?: AppSettings,
  options: { includeImages?: boolean } = { includeImages: true },
  onProgress?: CloudSyncProgressCallback
): Promise<{ success: boolean; modifiedTime: string; chaptersSynced: number; totalChapters: number }> {
  onProgress?.({
    stage: 'checking',
    current: 0,
    total: 100,
    percent: 5,
    message: 'กำลังเชื่อมต่อและตรวจสอบไฟล์บน Google Drive...',
  });

  let token = await ensureValidAccessToken();
  let appFolderId: string;
  try {
    appFolderId = await findOrCreateAppFolder(token);
  } catch (err: unknown) {
    if (err instanceof Error && (err.message.includes('401') || err.message.includes('หมดอายุ'))) {
      token = await ensureValidAccessToken(true);
      appFolderId = await findOrCreateAppFolder(token);
    } else {
      throw err;
    }
  }
  const chaptersFolderId = await findOrCreateSubfolder(token, appFolderId, GOOGLE_DRIVE_CHAPTERS_FOLDER_NAME);

  // List existing files in chapters subfolder to detect diff/incremental changes
  const existingChapterFiles = await listDriveFilesInFolder(token, chaptersFolderId);
  const existingRootFiles = await listDriveFilesInFolder(token, appFolderId);

  // Load playlists from storage
  const playlists = await getAllPlaylists();
  const includeImages = options.includeImages !== false;

  interface ChapterTask {
    playlistId: string;
    playlistName: string;
    chapter: MangaChapter;
    filename: string;
    existingFileId?: string;
    needsUpload: boolean;
  }

  const tasks: ChapterTask[] = [];
  for (const p of playlists) {
    for (const ch of p.chapters || []) {
      const filename = `ch_${sanitizeFileName(p.id)}_${sanitizeFileName(ch.id)}.zip`;
      const existing = existingChapterFiles.get(filename);

      let needsUpload = true;
      if (existing && existing.modifiedTime) {
        const driveTime = new Date(existing.modifiedTime).getTime();
        const localTime = ch.updatedAt || ch.createdAt || 0;
        // If drive file was modified after or at chapter's local updated time, it is unchanged!
        if (driveTime >= localTime) {
          needsUpload = false;
        }
      }

      tasks.push({
        playlistId: p.id,
        playlistName: p.name,
        chapter: ch,
        filename,
        existingFileId: existing?.id,
        needsUpload,
      });
    }
  }

  const totalChapters = tasks.length;
  const toUploadCount = tasks.filter(t => t.needsUpload).length;
  let processedCount = 0;
  let uploadedCount = 0;

  onProgress?.({
    stage: 'uploading',
    current: 0,
    total: totalChapters,
    percent: 10,
    message: `พบมังงะ ${totalChapters} ตอน (อัปเดตใหม่ ${toUploadCount} ตอน, ข้าม ${totalChapters - toUploadCount} ตอนที่ซิงค์แล้ว)`,
  });

  // Sync chapters one by one (low RAM!)
  for (const task of tasks) {
    if (task.needsUpload) {
      onProgress?.({
        stage: 'uploading',
        current: processedCount,
        total: totalChapters,
        chapterTitle: `${task.playlistName} - ${task.chapter.chapterTitle}`,
        percent: Math.round(10 + (processedCount / (totalChapters || 1)) * 80),
        message: `กำลังซิงค์: ${task.playlistName} - ${task.chapter.chapterTitle} (${processedCount + 1}/${totalChapters})...`,
      });

      // Build lightweight single chapter zip
      let zipBlob: Blob | null = await buildSingleChapterZip(task.chapter, includeImages);

      await uploadOrUpdateDriveFile(
        token,
        chaptersFolderId,
        task.filename,
        'application/zip',
        zipBlob,
        task.existingFileId
      );

      uploadedCount++;
      zipBlob = null; // Free RAM immediately!
    }

    processedCount++;
    onProgress?.({
      stage: 'uploading',
      current: processedCount,
      total: totalChapters,
      chapterTitle: `${task.playlistName} - ${task.chapter.chapterTitle}`,
      percent: Math.round(10 + (processedCount / (totalChapters || 1)) * 80),
      message: `ซิงค์ตอนเสร็จแล้ว (${processedCount}/${totalChapters})`,
    });
  }

  // Upload Playlists Index (lightweight metadata without heavy Base64 images)
  onProgress?.({
    stage: 'uploading',
    current: totalChapters,
    total: totalChapters,
    percent: 92,
    message: 'กำลังบันทึกดัชนีคลัง Playlist และบทแปล...',
  });

  const lightweightPlaylists = playlists.map(p => ({
    ...p,
    chapters: (p.chapters || []).map(ch => ({
      ...ch,
      thumbnailUrl: ch.thumbnailUrl?.startsWith('images/') ? ch.thumbnailUrl : '',
      pages: (ch.pages || []).map(pg => ({
        ...pg,
        originalImageUrl: '', // Text/coords only!
      })),
    })),
  }));

  const playlistsIndexJson = JSON.stringify(lightweightPlaylists, null, 2);
  const existingIndexFile = existingRootFiles.get(GOOGLE_DRIVE_PLAYLISTS_INDEX_NAME);
  await uploadOrUpdateDriveFile(
    token,
    appFolderId,
    GOOGLE_DRIVE_PLAYLISTS_INDEX_NAME,
    'application/json',
    playlistsIndexJson,
    existingIndexFile?.id
  );

  // Upload Settings
  let settings = currentSettings;
  if (!settings) {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) settings = JSON.parse(stored);
    } catch {}
  }
  if (settings) {
    const settingsJson = JSON.stringify(settings, null, 2);
    const existingSettingsFile = existingRootFiles.get(GOOGLE_DRIVE_SETTINGS_NAME);
    await uploadOrUpdateDriveFile(
      token,
      appFolderId,
      GOOGLE_DRIVE_SETTINGS_NAME,
      'application/json',
      settingsJson,
      existingSettingsFile?.id
    );
  }

  // Upload Workspace Draft
  try {
    const draftPages = await loadPagesFromLocalStorage();
    if (draftPages && draftPages.length > 0) {
      const cleanDraft = draftPages.map(p => ({ ...p, originalImageUrl: '' }));
      const existingDraft = existingRootFiles.get('workspace_draft.json');
      await uploadOrUpdateDriveFile(
        token,
        appFolderId,
        'workspace_draft.json',
        'application/json',
        JSON.stringify(cleanDraft, null, 2),
        existingDraft?.id
      );
    }
  } catch {}

  // Upload Manifest
  const now = Date.now();
  const manifest = {
    appName: 'C2 Sub Auto AI',
    formatVersion: '2.0.0',
    syncMode: 'distributed',
    createdAt: now,
    createdDateString: new Date(now).toLocaleString('th-TH'),
    playlistsCount: playlists.length,
    totalChaptersCount: totalChapters,
  };
  const existingManifest = existingRootFiles.get(GOOGLE_DRIVE_MANIFEST_NAME);
  await uploadOrUpdateDriveFile(
    token,
    appFolderId,
    GOOGLE_DRIVE_MANIFEST_NAME,
    'application/json',
    JSON.stringify(manifest, null, 2),
    existingManifest?.id
  );

  localStorage.setItem(GOOGLE_DRIVE_LAST_SYNC_KEY, now.toString());

  onProgress?.({
    stage: 'completed',
    current: totalChapters,
    total: totalChapters,
    percent: 100,
    message: `ซิงค์ข้อมูลขึ้น Google Drive สำเร็จเรียบร้อย (อัปเดต ${uploadedCount} ตอน, รวมทั้งหมด ${totalChapters} ตอน)`,
  });

  return {
    success: true,
    modifiedTime: new Date(now).toISOString(),
    chaptersSynced: uploadedCount,
    totalChapters,
  };
}

/**
 * Restores backup from Google Drive with support for distributed streaming and legacy monolithic ZIP fallback
 */
export async function restoreBackupFromGoogleDrive(
  options: RestoreOptions,
  onSettingsRestored?: (settings: AppSettings) => void,
  onProgress?: CloudSyncProgressCallback
): Promise<RestoreResult> {
  onProgress?.({
    stage: 'checking',
    current: 0,
    total: 100,
    percent: 5,
    message: 'กำลังตรวจสอบข้อมูลสำรองบน Google Drive...',
  });

  let token = await ensureValidAccessToken();
  let appFolderId: string;
  try {
    appFolderId = await findOrCreateAppFolder(token);
  } catch (err: unknown) {
    if (err instanceof Error && (err.message.includes('401') || err.message.includes('หมดอายุ'))) {
      token = await ensureValidAccessToken(true);
      appFolderId = await findOrCreateAppFolder(token);
    } else {
      throw err;
    }
  }
  const rootFiles = await listDriveFilesInFolder(token, appFolderId);

  // 1. Check if distributed backup exists
  const playlistsIndexFile = rootFiles.get(GOOGLE_DRIVE_PLAYLISTS_INDEX_NAME);
  if (!playlistsIndexFile) {
    // Fallback to legacy monolithic ZIP if exists
    onProgress?.({
      stage: 'downloading',
      current: 0,
      total: 1,
      percent: 20,
      message: 'ตรวจพบไฟล์สำรองเวอร์ชันแรก (ZIP รวมก้อน) กำลังดาวน์โหลด...',
    });
    return await restoreBackupFromGoogleDriveMonolithic(token, appFolderId, rootFiles, options, onSettingsRestored, onProgress);
  }

  // 2. Restore Settings
  let settingsRestored = false;
  if (options.restoreSettings) {
    const settingsFile = rootFiles.get(GOOGLE_DRIVE_SETTINGS_NAME);
    if (settingsFile) {
      try {
        const text = await downloadDriveFileText(token, settingsFile.id);
        const parsed = JSON.parse(text);
        if (parsed) {
          localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(parsed));
          onSettingsRestored?.(parsed);
          settingsRestored = true;
        }
      } catch (e) {
        console.warn('Failed to restore settings:', e);
      }
    }
  }

  // 3. Restore Playlists & Chapters
  let playlistsAddedCount = 0;
  let playlistsUpdatedCount = 0;
  let chaptersRestoredCount = 0;

  if (options.restorePlaylists) {
    const indexText = await downloadDriveFileText(token, playlistsIndexFile.id);
    const cloudPlaylists: MangaPlaylist[] = JSON.parse(indexText);

    if (options.playlistRestoreMode === 'overwrite') {
      await clearAllPlaylists();
    }

    const chaptersFolderId = await findOrCreateSubfolder(token, appFolderId, GOOGLE_DRIVE_CHAPTERS_FOLDER_NAME);
    const cloudChapterFiles = await listDriveFilesInFolder(token, chaptersFolderId);

    const existingLocalPlaylists = await getAllPlaylists();
    const existingMap = new Map(existingLocalPlaylists.map(p => [p.id, p]));

    let totalChaptersInCloud = 0;
    cloudPlaylists.forEach(p => { totalChaptersInCloud += (p.chapters || []).length; });
    let chaptersProcessed = 0;

    for (const p of cloudPlaylists) {
      const hydratedChapters: MangaChapter[] = [];

      for (const ch of p.chapters || []) {
        chaptersProcessed++;
        onProgress?.({
          stage: 'downloading',
          current: chaptersProcessed,
          total: totalChaptersInCloud,
          chapterTitle: `${p.name} - ${ch.chapterTitle}`,
          percent: Math.round(15 + (chaptersProcessed / (totalChaptersInCloud || 1)) * 80),
          message: `กำลังดึงตอน: ${p.name} - ${ch.chapterTitle} (${chaptersProcessed}/${totalChaptersInCloud})...`,
        });

        const filename = `ch_${sanitizeFileName(p.id)}_${sanitizeFileName(ch.id)}.zip`;
        const driveChapterFile = cloudChapterFiles.get(filename);

        if (driveChapterFile) {
          try {
            const zipBlob = await downloadDriveFileBlob(token, driveChapterFile.id);
            const restoredChapter = await restoreSingleChapterZip(zipBlob);
            hydratedChapters.push(restoredChapter);
            chaptersRestoredCount++;
          } catch (e) {
            console.warn(`Failed to restore chapter ${ch.chapterTitle}:`, e);
            hydratedChapters.push(ch);
          }
        } else {
          hydratedChapters.push(ch);
        }
      }

      const fullPlaylist: MangaPlaylist = {
        ...p,
        chapters: hydratedChapters,
      };

      if (existingMap.has(p.id)) {
        playlistsUpdatedCount++;
      } else {
        playlistsAddedCount++;
      }

      await savePlaylist(fullPlaylist);
    }
  }

  // 4. Restore Workspace Draft if selected
  let workspaceDraftRestored = false;
  if (options.restoreWorkspaceDraft) {
    const draftFile = rootFiles.get('workspace_draft.json');
    if (draftFile) {
      try {
        const text = await downloadDriveFileText(token, draftFile.id);
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          await savePagesToLocalStorage(parsed);
          workspaceDraftRestored = true;
        }
      } catch {}
    }
  }

  const allLocal = await getAllPlaylists();

  onProgress?.({
    stage: 'completed',
    current: 100,
    total: 100,
    percent: 100,
    message: 'กู้คืนข้อมูลจาก Google Drive สำเร็จเรียบร้อย',
  });

  return {
    settingsRestored,
    playlistsAddedCount,
    playlistsUpdatedCount,
    totalPlaylistsCount: allLocal.length,
    chaptersRestoredCount,
    workspaceDraftRestored,
  };
}

/**
 * Memory-efficient legacy monolithic zip restore.
 * Streams download progress in MB and unpacks chapter-by-chapter directly into IndexedDB
 * to prevent V8 memory exhaustion (Invalid string length) on large backups.
 */
async function restoreBackupFromGoogleDriveMonolithic(
  token: string,
  folderId: string,
  rootFiles: Map<string, { id: string; name: string; size?: number }>,
  options: RestoreOptions,
  onSettingsRestored?: (settings: AppSettings) => void,
  onProgress?: CloudSyncProgressCallback
): Promise<RestoreResult> {
  const legacyZip = rootFiles.get(GOOGLE_DRIVE_BACKUP_ZIP_NAME);
  if (!legacyZip) {
    throw new Error('ไม่พบข้อมูลสำรองในโฟลเดอร์ Google Drive (C2_Translate_Manga_Data) กรุณาสำรองข้อมูลก่อน');
  }

  // 1. Download large ZIP with live streaming progress
  const zipBlob = await downloadDriveFileBlob(token, legacyZip.id, (loaded, total) => {
    const loadedMB = (loaded / (1024 * 1024)).toFixed(1);
    const totalMB = total > 0 ? (total / (1024 * 1024)).toFixed(1) : (legacyZip.size ? (legacyZip.size / (1024 * 1024)).toFixed(1) : '?');
    const percent = total > 0 ? Math.min(50, Math.round((loaded / total) * 50)) : 25;
    onProgress?.({
      stage: 'downloading',
      current: loaded,
      total: total || legacyZip.size || loaded,
      percent,
      message: `กำลังดาวน์โหลดไฟล์สำรอง ZIP จาก Google Drive: ${loadedMB} MB / ${totalMB} MB (${total > 0 ? Math.round((loaded / total) * 100) : 50}%)...`,
    });
  });

  onProgress?.({
    stage: 'downloading',
    current: 50,
    total: 100,
    percent: 52,
    message: 'ดาวน์โหลดไฟล์เสร็จสมบูรณ์ กำลังอ่านโครงสร้างไฟล์สำรอง...',
  });

  const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());

  // 2. Restore Settings
  let settingsRestored = false;
  if (options.restoreSettings) {
    const settingsFile = zip.file('settings.json');
    if (settingsFile) {
      try {
        const text = await settingsFile.async('text');
        const parsed = JSON.parse(text);
        if (parsed) {
          localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(parsed));
          onSettingsRestored?.(parsed);
          settingsRestored = true;
        }
      } catch (e) {
        console.warn('Failed to restore settings:', e);
      }
    }

    const ctxFile = zip.file('home_playlist_context.txt');
    if (ctxFile) {
      try {
        const ctxText = (await ctxFile.async('text')).trim();
        if (ctxText) localStorage.setItem(HOME_PLAYLIST_CONTEXT_STORAGE_KEY, ctxText);
      } catch {}
    }
  }

  // 3. Parse Playlists metadata
  let playlists: MangaPlaylist[] = [];
  const playlistsFile = zip.file('playlists.json');
  if (playlistsFile) {
    try {
      playlists = JSON.parse(await playlistsFile.async('text'));
    } catch {}
  } else {
    const playlistFolders = Object.keys(zip.files).filter(f => f.startsWith('playlists/') && f.endsWith('/playlist_info.json'));
    for (const infoPath of playlistFolders) {
      try {
        const dirPath = infoPath.replace(/playlist_info\.json$/, '');
        const infoText = await zip.file(infoPath)?.async('text');
        if (!infoText) continue;
        const info = JSON.parse(infoText);

        let instructions: string | undefined;
        const instrFile = zip.file(`${dirPath}context_instructions.txt`);
        if (instrFile) instructions = await instrFile.async('text');

        let memoryEntries = [];
        const memFile = zip.file(`${dirPath}memory_glossary.json`);
        if (memFile) memoryEntries = JSON.parse(await memFile.async('text'));

        let chapters = [];
        const chFile = zip.file(`${dirPath}chapters.json`);
        if (chFile) chapters = JSON.parse(await chFile.async('text'));

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

  // 4. Stream Restore Playlists & Chapters chapter-by-chapter into IndexedDB
  let playlistsAddedCount = 0;
  let playlistsUpdatedCount = 0;
  let chaptersRestoredCount = 0;

  if (options.restorePlaylists && playlists.length > 0) {
    if (options.playlistRestoreMode === 'overwrite') {
      await clearAllPlaylists();
    }

    const existingLocal = await getAllPlaylists();
    const existingMap = new Map(existingLocal.map(p => [p.id, p]));

    let totalChapters = 0;
    playlists.forEach(p => { totalChapters += (p.chapters || []).length; });
    let chaptersProcessed = 0;

    for (const pl of playlists) {
      const safeName = sanitizeFileName(pl.name || 'Playlist');
      const dirPath = `playlists/${safeName}_${pl.id}/`;

      const hydratedChapters: MangaChapter[] = [];

      for (const ch of pl.chapters || []) {
        chaptersProcessed++;
        onProgress?.({
          stage: 'downloading',
          current: chaptersProcessed,
          total: totalChapters,
          chapterTitle: `${pl.name} - ${ch.chapterTitle}`,
          percent: Math.round(55 + (chaptersProcessed / (totalChapters || 1)) * 42),
          message: `กำลังกู้คืนตอน: ${pl.name} - ${ch.chapterTitle} (${chaptersProcessed}/${totalChapters})...`,
        });

        // Resolve chapter thumbnail
        let thumbUrl = ch.thumbnailUrl;
        if (thumbUrl && !thumbUrl.startsWith('data:') && !thumbUrl.startsWith('http')) {
          let thumbFile = zip.file(dirPath + thumbUrl) || zip.file(thumbUrl);
          if (!thumbFile) {
            const basename = thumbUrl.split(/[/\\]/).pop();
            if (basename) {
              const matched = Object.keys(zip.files).find(k => k.endsWith('/' + basename) || k === basename);
              if (matched) thumbFile = zip.file(matched);
            }
          }
          if (thumbFile) {
            try {
              const ext = thumbUrl.split('.').pop()?.toLowerCase() || 'jpg';
              const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
              thumbUrl = `data:${mime};base64,${await thumbFile.async('base64')}`;
            } catch {}
          }
        }

        // Resolve chapter page images
        const hydratedPages: MangaPage[] = [];
        for (const pg of ch.pages || []) {
          let pageImg = pg.originalImageUrl;
          if (pageImg && !pageImg.startsWith('data:') && !pageImg.startsWith('http')) {
            let pageFile = zip.file(dirPath + pageImg) || zip.file(pageImg);
            if (!pageFile) {
              const basename = pageImg.split(/[/\\]/).pop();
              if (basename) {
                const matched = Object.keys(zip.files).find(k => k.endsWith('/' + basename) || k === basename);
                if (matched) pageFile = zip.file(matched);
              }
            }
            if (pageFile) {
              try {
                const ext = pageImg.split('.').pop()?.toLowerCase() || 'jpg';
                const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
                pageImg = `data:${mime};base64,${await pageFile.async('base64')}`;
              } catch {}
            }
          }
          hydratedPages.push({
            ...pg,
            originalImageUrl: pageImg,
          });
        }

        hydratedChapters.push({
          ...ch,
          thumbnailUrl: thumbUrl,
          pages: hydratedPages,
        });

        chaptersRestoredCount++;
      }

      // Merge or overwrite playlist in IndexedDB
      const match = existingMap.get(pl.id);
      if (!match || options.playlistRestoreMode === 'overwrite') {
        const fullPlaylist: MangaPlaylist = {
          ...pl,
          chapters: hydratedChapters,
        };
        await savePlaylist(fullPlaylist);
        playlistsAddedCount++;
      } else {
        const existingChIds = new Set((match.chapters || []).map(c => c.id));
        const newChapters = hydratedChapters.filter(c => !existingChIds.has(c.id));
        const mergedChapters = [...(match.chapters || []), ...newChapters];

        const existingMemKeys = new Set((match.memoryEntries || []).map(m => m.sourceName.toLowerCase().trim()));
        const newMemories = (pl.memoryEntries || []).filter(m => !existingMemKeys.has(m.sourceName.toLowerCase().trim()));
        const mergedMemories = [...(match.memoryEntries || []), ...newMemories];

        const mergedPlaylist: MangaPlaylist = {
          ...match,
          name: pl.name || match.name,
          description: pl.description || match.description,
          updatedAt: Math.max(match.updatedAt || 0, pl.updatedAt || 0, Date.now()),
          memoryInstructions: pl.memoryInstructions || match.memoryInstructions,
          memoryEntries: mergedMemories,
          chapters: mergedChapters,
        };
        await savePlaylist(mergedPlaylist);
        playlistsUpdatedCount++;
      }
    }
  }

  // 5. Restore Workspace Draft
  let workspaceDraftRestored = false;
  if (options.restoreWorkspaceDraft) {
    const draftFile = zip.file('workspace_draft.json');
    if (draftFile) {
      try {
        const parsed = JSON.parse(await draftFile.async('text'));
        if (Array.isArray(parsed)) {
          for (const pg of parsed) {
            if (pg.originalImageUrl && !pg.originalImageUrl.startsWith('data:') && !pg.originalImageUrl.startsWith('http')) {
              const file = zip.file(pg.originalImageUrl);
              if (file) {
                const b64 = await file.async('base64');
                pg.originalImageUrl = `data:image/jpeg;base64,${b64}`;
              }
            }
          }
          await savePagesToLocalStorage(parsed);
          workspaceDraftRestored = true;
        }
      } catch {}
    }
  }

  const allLocal = await getAllPlaylists();

  onProgress?.({
    stage: 'completed',
    current: 100,
    total: 100,
    percent: 100,
    message: `กู้คืนข้อมูลจาก Google Drive สำเร็จเรียบร้อย (คลัง Playlist ทั้งหมด ${allLocal.length} เรื่อง, ตอนที่กู้คืน ${chaptersRestoredCount} ตอน)`,
  });

  return {
    settingsRestored,
    playlistsAddedCount,
    playlistsUpdatedCount,
    totalPlaylistsCount: allLocal.length,
    chaptersRestoredCount,
    workspaceDraftRestored,
  };
}
