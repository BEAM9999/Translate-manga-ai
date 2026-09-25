import { describe, expect, it } from 'vitest';
import {
  BackupDataBundle,
  BACKUP_FORMAT_VERSION,
  buildBackupZip,
  parseBackupFromJson,
  parseBackupFromZip,
  validateBackupBundle,
} from './backupService';
import { AppSettings, MangaPlaylist } from '../types';

const mockSettings: AppSettings = {
  provider: 'openrouter',
  apiKey: 'AIzaSyTestGeminiKey12345678901234567',
  geminiApiKeysPool: ['AIzaSyTestGeminiKey12345678901234567'],
  openRouterApiKey: 'sk-or-v1-testkey12345678901234567890',
  openRouterModel: 'stepfun/step-3.5-flash:free',
  openRouterModelEntries: [
    {
      id: 'stepfun/step-3.5-flash:free',
      name: 'StepFun Flash Free',
      key: 'sk-or-v1-testkey12345678901234567890',
      provider: 'openrouter',
    },
  ],
  customOpenRouterModels: [],
  rawSmartPasteText: 'name: StepFun Flash Free\nid: stepfun/step-3.5-flash:free\nkey: sk-or-v1-testkey12345678901234567890',
  selectedModel: 'gemini-2.5-flash',
  customModelName: '',
  targetLanguage: 'Thai',
  translationContext: 'game_system',
  customContextPrompt: 'คำสั่งพิเศษสำหรับดันเจี้ยน',
  enableAiMemory: true,
  aiMemoryDirectives: 'Sung Jinwoo -> ซองจินอู',
  sourceLanguage: 'auto',
  fontFamily: 'Mali',
  fontSizeScale: 1.1,
  bubbleBackdropColor: 'auto',
  bubbleOpacity: 0.9,
  bubblePadding: 5,
  readingDirection: 'ltr',
  autoTranslateNewPages: false,
  enableSeamStitching: true,
  voicePitch: 1.0,
  voiceRate: 1.05,
};

const mockPlaylist: MangaPlaylist = {
  id: 'pl_test_1',
  name: 'Solo Leveling',
  description: 'มังงะดันเจี้ยนและฮันเตอร์',
  createdAt: 1700000000000,
  updatedAt: 1700000050000,
  memoryInstructions: 'ตัวละครเอกให้ใช้สรรพนามแบบกระชับ',
  memoryEntries: [
    {
      id: 'mem_1',
      sourceName: 'Sung Jinwoo',
      thaiName: 'ซองจินอู',
      category: 'character',
      source: 'user',
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    },
  ],
  chapters: [
    {
      id: 'ch_1',
      playlistId: 'pl_test_1',
      chapterTitle: 'ตอนที่ 1',
      pageCount: 1,
      translatedBubbleCount: 2,
      pages: [
        {
          id: 'p_1',
          originalImageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          width: 100,
          height: 100,
          isTranslating: false,
          isTranslated: true,
          orderIndex: 1,
          ocrResults: [
            {
              id: 'b_1',
              box_2d: [100, 100, 200, 200],
              source_text: 'Hello',
              translated_text: 'สวัสดี',
              speaker: 'Protagonist',
              bubble_type: 'speech',
              reading_order: 1,
            },
          ],
        },
      ],
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    },
  ],
};

describe('backupService full export & import flow', () => {
  it('validates a complete backup bundle', () => {
    const bundle: BackupDataBundle = {
      manifest: {
        appName: 'C2 Sub Auto AI',
        formatVersion: BACKUP_FORMAT_VERSION,
        createdAt: Date.now(),
        createdDateString: new Date().toLocaleString(),
        stats: {
          hasSettings: true,
          geminiKeysCount: 1,
          openRouterModelsCount: 1,
          playlistsCount: 1,
          totalChaptersCount: 1,
          totalMemoriesCount: 1,
          hasWorkspaceDraft: false,
          workspaceDraftPagesCount: 0,
        },
      },
      settings: mockSettings,
      playlists: [mockPlaylist],
    };

    const validation = validateBackupBundle(bundle);
    expect(validation.isValid).toBe(true);
    expect(validation.stats?.playlistsCount).toBe(1);
    expect(validation.stats?.chaptersCount).toBe(1);
    expect(validation.stats?.memoriesCount).toBe(1);
    expect(validation.stats?.hasApiKeys).toBe(true);
    expect(validation.stats?.openRouterModelsCount).toBe(1);
  });

  it('rejects invalid or empty backup data', () => {
    const emptyResult = validateBackupBundle({});
    expect(emptyResult.isValid).toBe(false);
    expect(emptyResult.errors.length).toBeGreaterThan(0);
  });

  it('builds a zip archive with human-readable playlist subfolders and files', async () => {
    const bundle: BackupDataBundle = {
      manifest: {
        appName: 'C2 Sub Auto AI',
        formatVersion: BACKUP_FORMAT_VERSION,
        createdAt: Date.now(),
        createdDateString: new Date().toLocaleString(),
        stats: {
          hasSettings: true,
          geminiKeysCount: 1,
          openRouterModelsCount: 1,
          playlistsCount: 1,
          totalChaptersCount: 1,
          totalMemoriesCount: 1,
          hasWorkspaceDraft: false,
          workspaceDraftPagesCount: 0,
        },
      },
      settings: mockSettings,
      playlists: [mockPlaylist],
      rawSmartPasteText: mockSettings.rawSmartPasteText,
    };

    const zip = await buildBackupZip(bundle);

    // Root files
    expect(zip.file('manifest.json')).not.toBeNull();
    expect(zip.file('settings.json')).not.toBeNull();
    expect(zip.file('playlists.json')).not.toBeNull();
    expect(zip.file('raw_keys_and_models.txt')).not.toBeNull();

    // Human-readable playlist folder
    const plFolder = zip.folder(`playlists/Solo Leveling_${mockPlaylist.id}`);
    expect(plFolder).not.toBeNull();
    expect(plFolder?.file('playlist_info.json')).not.toBeNull();
    expect(plFolder?.file('context_instructions.txt')).not.toBeNull();
    expect(plFolder?.file('memory_glossary.json')).not.toBeNull();
    expect(plFolder?.file('chapters.json')).not.toBeNull();

    // Verify context instructions content
    const contextContent = await plFolder?.file('context_instructions.txt')?.async('text');
    expect(contextContent).toBe('ตัวละครเอกให้ใช้สรรพนามแบบกระชับ');
  });

  it('parses backup back from zip archive correctly', async () => {
    const bundle: BackupDataBundle = {
      manifest: {
        appName: 'C2 Sub Auto AI',
        formatVersion: BACKUP_FORMAT_VERSION,
        createdAt: Date.now(),
        createdDateString: new Date().toLocaleString(),
        stats: {
          hasSettings: true,
          geminiKeysCount: 1,
          openRouterModelsCount: 1,
          playlistsCount: 1,
          totalChaptersCount: 1,
          totalMemoriesCount: 1,
          hasWorkspaceDraft: false,
          workspaceDraftPagesCount: 0,
        },
      },
      settings: mockSettings,
      playlists: [mockPlaylist],
      rawSmartPasteText: mockSettings.rawSmartPasteText,
    };

    const zip = await buildBackupZip(bundle);
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    const parsed = await parseBackupFromZip(zipBlob);
    expect(parsed.isValid).toBe(true);
    expect(parsed.bundle?.settings?.apiKey).toBe(mockSettings.apiKey);
    expect(parsed.bundle?.settings?.openRouterApiKey).toBe(mockSettings.openRouterApiKey);
    expect(parsed.bundle?.playlists).toHaveLength(1);
    expect(parsed.bundle?.playlists[0].name).toBe('Solo Leveling');
    expect(parsed.bundle?.playlists[0].chapters).toHaveLength(1);
    expect(parsed.bundle?.playlists[0].memoryEntries).toHaveLength(1);
    expect(parsed.bundle?.playlists[0].memoryInstructions).toBe('ตัวละครเอกให้ใช้สรรพนามแบบกระชับ');
  });

  it('parses backup from JSON string correctly', async () => {
    const bundle: BackupDataBundle = {
      manifest: {
        appName: 'C2 Sub Auto AI',
        formatVersion: BACKUP_FORMAT_VERSION,
        createdAt: Date.now(),
        createdDateString: new Date().toLocaleString(),
        stats: {
          hasSettings: true,
          geminiKeysCount: 1,
          openRouterModelsCount: 1,
          playlistsCount: 1,
          totalChaptersCount: 1,
          totalMemoriesCount: 1,
          hasWorkspaceDraft: false,
          workspaceDraftPagesCount: 0,
        },
      },
      settings: mockSettings,
      playlists: [mockPlaylist],
    };

    const jsonString = JSON.stringify(bundle);
    const parsed = await parseBackupFromJson(jsonString);
    expect(parsed.isValid).toBe(true);
    expect(parsed.bundle?.settings?.selectedModel).toBe('gemini-2.5-flash');
    expect(parsed.bundle?.playlists[0].name).toBe('Solo Leveling');
  });
});
