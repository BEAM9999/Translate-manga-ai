import {
  AppSettings,
  MangaPlaylist,
  MangaPage,
} from '../types';
import {
  gatherFullBackupBundle,
  buildBackupZip,
  parseBackupFromZip,
  restoreBackupBundle,
  RestoreOptions,
  RestoreResult,
  BackupDataBundle,
} from './backupService';

export const DEFAULT_GOOGLE_CLIENT_ID = '15083734589-ud2cargqgm96rl2lvg8qjrc6v8otnpeg.apps.googleusercontent.com';
export const GOOGLE_DRIVE_TOKEN_KEY = 'c2_google_drive_access_token_v1';
export const GOOGLE_DRIVE_EXPIRES_KEY = 'c2_google_drive_token_expires_v1';
export const GOOGLE_DRIVE_USER_KEY = 'c2_google_drive_user_v1';
export const GOOGLE_DRIVE_LAST_SYNC_KEY = 'c2_google_drive_last_sync_v1';
export const GOOGLE_DRIVE_FOLDER_NAME = 'C2_Translate_Manga_Data';
export const GOOGLE_DRIVE_BACKUP_ZIP_NAME = 'C2_Manga_Cloud_Backup.zip';

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
  fileId?: string;
  name?: string;
  size?: number;
  modifiedTime?: string;
}

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
            callback: (response: { access_token?: string; error?: string; expires_in?: number }) => void;
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

          const accessToken = tokenResponse.access_token;
          const expiresIn = (tokenResponse.expires_in || 3600) * 1000;
          const expiresAt = Date.now() + expiresIn;

          localStorage.setItem(GOOGLE_DRIVE_TOKEN_KEY, accessToken);
          localStorage.setItem(GOOGLE_DRIVE_EXPIRES_KEY, expiresAt.toString());

          // Fetch user profile
          try {
            const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            const info = await userInfoRes.json();
            const user: GoogleDriveUser = {
              email: info.email || 'Google User',
              name: info.name || info.email || 'ผู้ใช้ Google',
              picture: info.picture || '',
              connectedAt: Date.now(),
            };
            localStorage.setItem(GOOGLE_DRIVE_USER_KEY, JSON.stringify(user));
            resolve(user);
          } catch {
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
      tokenClient.requestAccessToken({ prompt: '' });
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
 * Helper to ensure we have a valid access token, prompting login if needed
 */
export async function ensureValidAccessToken(): Promise<string> {
  const token = getStoredAccessToken();
  if (token) return token;

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
    throw new Error(`ไม่สามารถค้นหาโฟลเดอร์ Google Drive: ${searchRes.statusText}`);
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
    throw new Error(`ไม่สามารถสร้างโฟลเดอร์ใน Google Drive ได้: ${createRes.statusText}`);
  }

  const created = await createRes.json();
  return created.id;
}

/**
 * Checks for the existing backup file inside the Google Drive app folder
 */
export async function getGoogleDriveBackupInfo(): Promise<GoogleDriveBackupInfo> {
  const token = getStoredAccessToken();
  if (!token) return { exists: false };

  try {
    const folderId = await findOrCreateAppFolder(token);
    const query = `'${folderId}' in parents and name='${GOOGLE_DRIVE_BACKUP_ZIP_NAME}' and trashed=false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,modifiedTime)&orderBy=modifiedTime desc`;

    const res = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return { exists: false };

    const data = await res.json();
    if (data.files && data.files.length > 0) {
      const file = data.files[0];
      return {
        exists: true,
        fileId: file.id,
        name: file.name,
        size: file.size ? parseInt(file.size, 10) : undefined,
        modifiedTime: file.modifiedTime,
      };
    }
    return { exists: false };
  } catch {
    return { exists: false };
  }
}

/**
 * Uploads full backup as a safe ZIP file directly into the user's Google Drive folder
 */
export async function uploadBackupToGoogleDrive(
  currentSettings?: AppSettings,
  options: { includeImages?: boolean } = { includeImages: true }
): Promise<{ success: boolean; modifiedTime: string; fileId: string }> {
  const token = await ensureValidAccessToken();
  const folderId = await findOrCreateAppFolder(token);

  // 1. Gather bundle & generate binary-safe ZIP archive
  const bundle = await gatherFullBackupBundle(currentSettings);
  const zip = await buildBackupZip(bundle, options);
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'STORE',
  });

  // 2. Check if backup file already exists in folder
  const query = `'${folderId}' in parents and name='${GOOGLE_DRIVE_BACKUP_ZIP_NAME}' and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const searchData = await searchRes.json();
  const existingFileId = searchData.files?.[0]?.id;

  // 3. Construct Multipart Body for Google Drive API
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = existingFileId
    ? { name: GOOGLE_DRIVE_BACKUP_ZIP_NAME }
    : { name: GOOGLE_DRIVE_BACKUP_ZIP_NAME, parents: [folderId] };

  const arrayBuffer = await blob.arrayBuffer();

  const multipartRequestBody = new Blob(
    [
      delimiter,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      delimiter,
      'Content-Type: application/zip\r\n\r\n',
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

  const uploadRes = await fetch(uploadUrl, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    throw new Error(`อัปโหลดไฟล์ขึ้น Google Drive ล้มเหลว (${uploadRes.status}): ${errorText}`);
  }

  const uploadData = await uploadRes.json();
  const now = Date.now();
  localStorage.setItem(GOOGLE_DRIVE_LAST_SYNC_KEY, now.toString());

  return {
    success: true,
    modifiedTime: uploadData.modifiedTime || new Date(now).toISOString(),
    fileId: uploadData.id,
  };
}

/**
 * Downloads and restores the latest backup file from Google Drive into application storage
 */
export async function restoreBackupFromGoogleDrive(
  options: RestoreOptions,
  onSettingsRestored?: (settings: AppSettings) => void
): Promise<RestoreResult> {
  const token = await ensureValidAccessToken();
  const folderId = await findOrCreateAppFolder(token);

  // Search for backup zip file
  const query = `'${folderId}' in parents and name='${GOOGLE_DRIVE_BACKUP_ZIP_NAME}' and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,modifiedTime)&orderBy=modifiedTime desc`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!searchRes.ok) {
    throw new Error(`ไม่สามารถค้นหาไฟล์สำรองใน Google Drive: ${searchRes.statusText}`);
  }

  const searchData = await searchRes.json();
  const file = searchData.files?.[0];
  if (!file || !file.id) {
    throw new Error('ไม่พบไฟล์สำรองในโฟลเดอร์ Google Drive (C2_Translate_Manga_Data) กรุณาสำรองข้อมูลขึ้นไดรฟ์ก่อน');
  }

  // Download file content as Blob
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
  const downloadRes = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!downloadRes.ok) {
    throw new Error(`ไม่สามารถดาวน์โหลดไฟล์สำรองจาก Google Drive ได้: ${downloadRes.statusText}`);
  }

  const zipBlob = await downloadRes.blob();
  const validation = await parseBackupFromZip(zipBlob);

  if (!validation.isValid || !validation.bundle) {
    throw new Error(`ไฟล์สำรองจาก Google Drive ไม่ถูกต้อง: ${validation.errors.join(', ')}`);
  }

  const result = await restoreBackupBundle(validation.bundle, options, onSettingsRestored);

  return result;
}
