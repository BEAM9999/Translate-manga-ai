import { describe, expect, it } from 'vitest';
import { TextBubble } from '../types';
import { mergeMissingOcrBubbles } from './ocrMerge';

const bubble = (id: string, source: string, translated: string, box: [number, number, number, number]): TextBubble => ({
  id,
  source_text: source,
  translated_text: translated,
  box_2d: box,
  speaker: 'ตัวละคร',
  bubble_type: 'speech',
  reading_order: 1,
});

describe('mergeMissingOcrBubbles', () => {
  it('keeps the existing translation when source and position match', () => {
    const existing = bubble('old', 'Hello hero', 'สวัสดี ฮีโร่', [100, 100, 200, 300]);
    const detected = bubble('new', ' hello   hero ', 'คำแปลใหม่', [105, 110, 205, 305]);

    expect(mergeMissingOcrBubbles([existing], [detected])).toEqual([
      expect.objectContaining({ id: 'old', translated_text: 'สวัสดี ฮีโร่' }),
    ]);
  });

  it('adds text that was missed by the previous scan', () => {
    const existing = bubble('old', 'First', 'แรก', [100, 100, 200, 300]);
    const missed = bubble('new', 'Second', 'สอง', [400, 100, 500, 300]);

    expect(mergeMissingOcrBubbles([existing], [missed])).toHaveLength(2);
  });
});