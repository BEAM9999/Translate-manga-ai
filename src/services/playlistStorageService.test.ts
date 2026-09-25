import { describe, expect, it, vi } from 'vitest';
import { PlaylistMemoryEntry } from '../types';
import {
  createPlaylist,
  extractPlaylistMemoryEntriesFromInstructions,
  formatPlaylistMemoryDirectives,
  getPlaylistById,
  getPlaylistMemoryFingerprint,
  mergePlaylistMemoryEntryLists,
  normalizePlaylistMemoryKey,
  savePlaylistMemoryInstructions,
} from './playlistStorageService';

const existingEntry: PlaylistMemoryEntry = {
  id: 'existing-character',
  sourceName: 'Sung Jinwoo',
  thaiName: 'Existing Thai Name',
  category: 'character',
  notes: 'Target playlist context',
  source: 'user',
  createdAt: 1,
  updatedAt: 1,
};

describe('playlist memory merge rules', () => {
  it('normalizes spaces and letter case for duplicate detection', () => {
    expect(normalizePlaylistMemoryKey('  SUNG   Jinwoo  ')).toBe('sung jinwoo');
  });

  it('preserves the target Thai name when an incoming source name already exists', () => {
    const result = mergePlaylistMemoryEntryLists(
      [existingEntry],
      [
        {
          sourceName: '  sung   jinwoo ',
          thaiName: 'Incoming Thai Name',
          category: 'character',
        },
        {
          sourceName: 'Shadow Monarch',
          thaiName: 'Shadow Monarch Thai',
          category: 'power_rank',
        },
      ],
      'shared'
    );

    expect(result.skippedCount).toBe(1);
    expect(result.addedEntries).toHaveLength(1);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].thaiName).toBe('Existing Thai Name');
    expect(result.entries[1]).toMatchObject({
      sourceName: 'Shadow Monarch',
      thaiName: 'Shadow Monarch Thai',
      source: 'shared',
    });
  });

  it('removes duplicate entries within one AI response', () => {
    const result = mergePlaylistMemoryEntryLists(
      [],
      [
        { sourceName: 'Hunter Guild', thaiName: 'Hunter Guild Thai', category: 'organization' },
        { sourceName: 'hunter guild', thaiName: 'Different Thai Name', category: 'organization' },
      ]
    );

    expect(result.entries).toHaveLength(1);
    expect(result.skippedCount).toBe(1);
    expect(result.entries[0].thaiName).toBe('Hunter Guild Thai');
  });

  it('includes free-form story context alongside the playlist glossary', () => {
    const directives = formatPlaylistMemoryDirectives(
      [existingEntry],
      'Female characters speak politely using เจ้าค่ะ.'
    );

    expect(directives).toContain('Sung Jinwoo => Existing Thai Name');
    expect(directives).toContain('STORY CONTEXT RULES:');
    expect(directives).toContain('Female characters speak politely');
  });

  it('preserves paragraph breaks and indentation in formatted story context', () => {
    const instructions = 'World rules:\n\n  Keep this indented detail.\nFinal paragraph.';

    expect(formatPlaylistMemoryDirectives([], instructions)).toBe(
      `STORY CONTEXT RULES:\n${instructions}`
    );
  });

  it('preserves story context formatting when saved and loaded', async () => {
    const storedValues = new Map<string, string>();
    vi.stubGlobal('window', { indexedDB: undefined });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storedValues.get(key) ?? null,
      setItem: (key: string, value: string) => storedValues.set(key, value),
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const playlist = await createPlaylist('Formatting test');
      const instructions = 'World rules:\n\n  Keep this indented detail.\nFinal paragraph.\n';

      await savePlaylistMemoryInstructions(playlist.id, instructions);

      expect((await getPlaylistById(playlist.id))?.memoryInstructions).toBe(instructions);
    } finally {
      warning.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('imports only explicit name mappings from the AI Memory textarea', () => {
    const entries = extractPlaylistMemoryEntriesFromInstructions(`
      - Xiao Yan -> เซียวเหยียน
      ถ้าเจอชื่อ "Sister Lan" ให้แปลว่า "ศิษย์พี่หลาน"
      ตัวละครหญิงพูดสุภาพลงท้ายด้วย เจ้าค่ะ
      x -> ชื่อที่ยาวเกินไปเพราะไม่มีทางเป็น mapping ที่ตรงตามคำสั่งปกติ
    `);

    expect(entries).toHaveLength(3);
    expect(entries.map(entry => [entry.sourceName, entry.thaiName])).toEqual([
      ['Xiao Yan', 'เซียวเหยียน'],
      ['x', 'ชื่อที่ยาวเกินไปเพราะไม่มีทางเป็น mapping ที่ตรงตามคำสั่งปกติ'],
      ['Sister Lan', 'ศิษย์พี่หลาน'],
    ]);
  });

  it('changes the cache fingerprint when story context instructions change', () => {
    const withoutInstruction = getPlaylistMemoryFingerprint([existingEntry]);
    const withInstruction = getPlaylistMemoryFingerprint([existingEntry], 'Use a formal Thai tone.');

    expect(withInstruction).not.toBe(withoutInstruction);
  });
});
