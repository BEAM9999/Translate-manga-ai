import { describe, expect, it } from 'vitest';
import { safeParseOcrMemoryEntries, safeParseOcrTranslationResult } from './safeJsonParser';

describe('safe OCR memory parser', () => {
  it('parses bubbles and valid memory entries independently', () => {
    const parsed = safeParseOcrTranslationResult(JSON.stringify({
      bubbles: [
        {
          box_2d: [10, 20, 40, 80],
          source_text: 'Hello',
          translated_text: 'Thai hello',
          speaker: 'Hero',
          bubble_type: 'speech',
        },
      ],
      memory_entries: [
        {
          source_name: 'Hero Name',
          thai_name: 'Hero Thai Name',
          category: 'character',
          notes: 'Main character',
        },
        {
          source_name: 'hero name',
          thai_name: 'Duplicate Thai Name',
          category: 'character',
        },
        {
          source_name: '',
          thai_name: 'Ignored entry',
          category: 'character',
        },
      ],
    }));

    expect(parsed.bubbles).toHaveLength(1);
    expect(parsed.memoryEntries).toEqual([
      {
        sourceName: 'Hero Name',
        thaiName: 'Hero Thai Name',
        category: 'character',
        notes: 'Main character',
      },
    ]);
  });

  it('recovers memory entries when the larger response cannot be parsed as JSON', () => {
    const entries = safeParseOcrMemoryEntries(`
      Incomplete response before a valid object
      {"source_name":"Guild Name","thai_name":"Guild Thai Name","category":"organization","notes":"Faction"}
    `);

    expect(entries).toEqual([
      {
        sourceName: 'Guild Name',
        thaiName: 'Guild Thai Name',
        category: 'organization',
        notes: 'Faction',
      },
    ]);
  });
});
