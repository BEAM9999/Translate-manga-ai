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
