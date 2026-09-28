import { describe, expect, it, beforeEach } from 'vitest';
import {
  getStoredAccessToken,
  getStoredGoogleUser,
  getLastSyncTimestamp,
  signOutGoogleDrive,
  GOOGLE_DRIVE_TOKEN_KEY,
  GOOGLE_DRIVE_USER_KEY,
  GOOGLE_DRIVE_LAST_SYNC_KEY,
  GOOGLE_DRIVE_EXPIRES_KEY,
  GoogleDriveUser,
} from './googleDriveService';

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) || null,
  setItem: (key: string, val: string) => storage.set(key, val),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};
globalThis.localStorage = localStorageMock as unknown as Storage;

describe('googleDriveService storage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('retrieves valid token and handles expiration', () => {
    expect(getStoredAccessToken()).toBeNull();

    // Set token with future expiration
    localStorage.setItem(GOOGLE_DRIVE_TOKEN_KEY, 'test_access_token_123');
    localStorage.setItem(GOOGLE_DRIVE_EXPIRES_KEY, (Date.now() + 3600000).toString());
    expect(getStoredAccessToken()).toBe('test_access_token_123');

    // Expired token
    localStorage.setItem(GOOGLE_DRIVE_EXPIRES_KEY, (Date.now() - 1000).toString());
    expect(getStoredAccessToken()).toBeNull();
  });

  it('stores and retrieves user profile correctly', () => {
    expect(getStoredGoogleUser()).toBeNull();

    const mockUser: GoogleDriveUser = {
      email: 'test@gmail.com',
      name: 'Test Manga Translator',
      picture: 'https://example.com/avatar.jpg',
      connectedAt: 1700000000000,
    };

    localStorage.setItem(GOOGLE_DRIVE_USER_KEY, JSON.stringify(mockUser));
    const retrieved = getStoredGoogleUser();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.email).toBe('test@gmail.com');
    expect(retrieved?.name).toBe('Test Manga Translator');
  });

  it('clears session on signOutGoogleDrive', () => {
    localStorage.setItem(GOOGLE_DRIVE_TOKEN_KEY, 'test_token');
    localStorage.setItem(GOOGLE_DRIVE_EXPIRES_KEY, (Date.now() + 3600000).toString());
    localStorage.setItem(GOOGLE_DRIVE_USER_KEY, JSON.stringify({ email: 'test@gmail.com' }));

    signOutGoogleDrive();

    expect(getStoredAccessToken()).toBeNull();
    expect(getStoredGoogleUser()).toBeNull();
  });
});

describe('extractDriveError', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('handles 401 Unauthorized and clears token', async () => {
    const { extractDriveError } = await import('./googleDriveService');
    localStorage.setItem(GOOGLE_DRIVE_TOKEN_KEY, 'stale_token');
    localStorage.setItem(GOOGLE_DRIVE_EXPIRES_KEY, (Date.now() + 3600000).toString());

    const mockResponse = new Response(JSON.stringify({ error: { code: 401, message: 'Invalid Credentials' } }), {
      status: 401,
      statusText: '',
    });

    const err = await extractDriveError(mockResponse, 'ค้นหาโฟลเดอร์ล้มเหลว');
    expect(err.message).toContain('401 Unauthorized');
    expect(localStorage.getItem(GOOGLE_DRIVE_TOKEN_KEY)).toBeNull();
  });

  it('handles 403 Insufficient Scope and clears invalid token', async () => {
    const { extractDriveError } = await import('./googleDriveService');
    localStorage.setItem(GOOGLE_DRIVE_TOKEN_KEY, 'unprivileged_token');

    const mockResponse = new Response(
      JSON.stringify({ error: { code: 403, message: 'Request had insufficient authentication scopes.' } }),
      { status: 403, statusText: '' }
    );

    const err = await extractDriveError(mockResponse, 'ค้นหาโฟลเดอร์ล้มเหลว');
    expect(err.message).toContain('403 Insufficient Scope');
    expect(err.message).toContain('ติ๊กเครื่องหมายถูกที่ช่องนี้');
    expect(localStorage.getItem(GOOGLE_DRIVE_TOKEN_KEY)).toBeNull();
  });

  it('handles 403 Access Denied / Test User error', async () => {
    const { extractDriveError } = await import('./googleDriveService');

    const mockResponse = new Response(
      JSON.stringify({ error: { code: 403, message: 'access_denied: user is not an approved test user' } }),
      { status: 403, statusText: '' }
    );

    const err = await extractDriveError(mockResponse, 'ค้นหาโฟลเดอร์ล้มเหลว');
    expect(err.message).toContain('403 Access Denied');
    expect(err.message).toContain('Test users');
  });

  it('handles other errors with descriptive message and status code', async () => {
    const { extractDriveError } = await import('./googleDriveService');

    const mockResponse = new Response(
      JSON.stringify({ error: { code: 500, message: 'Backend internal error' } }),
      { status: 500, statusText: 'Internal Server Error' }
    );

    const err = await extractDriveError(mockResponse, 'อัปโหลดล้มเหลว');
    expect(err.message).toContain('Backend internal error');
  });
});

describe('restoreBackupFromGoogleDrive monolithic restore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('successfully downloads and restores monolithic ZIP backup', async () => {
    const JSZip = (await import('jszip')).default;
    const { restoreBackupFromGoogleDrive, GOOGLE_DRIVE_TOKEN_KEY, GOOGLE_DRIVE_EXPIRES_KEY } = await import('./googleDriveService');

    // Setup stored token
    localStorage.setItem(GOOGLE_DRIVE_TOKEN_KEY, 'valid_test_token');
    localStorage.setItem(GOOGLE_DRIVE_EXPIRES_KEY, (Date.now() + 3600000).toString());

    // Build a mock monolithic ZIP
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ appName: 'C2 Sub Auto AI', formatVersion: '1.0.0' }));
    zip.file('settings.json', JSON.stringify({ apiKey: 'gemini_test_key_123', provider: 'gemini' }));
    zip.file('playlists.json', JSON.stringify([
      {
        id: 'pl_test_1',
        name: 'Test Manga Series',
        chapters: [
          {
            id: 'ch_test_1',
            playlistId: 'pl_test_1',
            chapterTitle: 'Chapter 1',
            thumbnailUrl: 'images/thumb.jpg',
            pageCount: 1,
            pages: [
              {
                id: 'p_1',
                orderIndex: 0,
                width: 800,
                height: 1200,
                originalImageUrl: 'images/page1.jpg',
                isTranslating: false,
                isTranslated: true,
                ocrResults: [],
              },
            ],
          },
        ],
      },
    ]));
    zip.file('playlists/Test Manga Series_pl_test_1/images/thumb.jpg', 'fake_thumb_data');
    zip.file('playlists/Test Manga Series_pl_test_1/images/page1.jpg', 'fake_page_data');

    const zipBlob = await zip.generateAsync({ type: 'blob' });

    // Mock fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      // Search app folder
      if (decodeURIComponent(url).includes('C2_Translate_Manga_Data')) {
        return new Response(JSON.stringify({ files: [{ id: 'app_folder_id', name: 'C2_Translate_Manga_Data' }] }), { status: 200 });
      }

      // List files in folder
      if (url.includes("'app_folder_id' in parents")) {
        return new Response(JSON.stringify({
          files: [
            { id: 'file_zip_id', name: 'C2_Manga_Cloud_Backup.zip', size: zipBlob.size, modifiedTime: new Date().toISOString() },
          ],
        }), { status: 200 });
      }

      // Download ZIP
      if (url.includes('file_zip_id') && url.includes('alt=media')) {
        return new Response(zipBlob, {
          status: 200,
          headers: { 'Content-Type': 'application/zip', 'Content-Length': zipBlob.size.toString() },
        });
      }

      return new Response('Not Found', { status: 404 });
    };

    try {
      const progressList: string[] = [];
      const result = await restoreBackupFromGoogleDrive(
        {
          restoreSettings: true,
          restorePlaylists: true,
          playlistRestoreMode: 'overwrite',
          restoreWorkspaceDraft: false,
        },
        undefined,
        (prog) => progressList.push(prog.message)
      );

      expect(result.settingsRestored).toBe(true);
      expect(result.playlistsAddedCount).toBeGreaterThanOrEqual(1);
      expect(result.chaptersRestoredCount).toBe(1);
      expect(progressList.length).toBeGreaterThan(0);
      expect(localStorage.getItem('freebuff_manga_app_settings_v1')).toContain('gemini_test_key_123');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
