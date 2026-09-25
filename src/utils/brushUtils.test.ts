import { describe, it, expect } from 'vitest';
import { percentToBrushPixelSize, brushPixelSizeToPercent, filterOutErasedBubbles } from './brushUtils';
import { TextBubble } from '../types';

describe('brushUtils', () => {
  it('converts percent to brush pixel size correctly', () => {
    expect(percentToBrushPixelSize(1)).toBe(2);
    expect(percentToBrushPixelSize(50)).toBeGreaterThanOrEqual(18);
    expect(percentToBrushPixelSize(50)).toBeLessThanOrEqual(24);
    expect(percentToBrushPixelSize(100)).toBe(40);
    expect(percentToBrushPixelSize(150)).toBe(80);
    expect(percentToBrushPixelSize(200)).toBe(120);
  });

  it('converts pixel size back to percent', () => {
    expect(brushPixelSizeToPercent(2)).toBe(1);
    expect(brushPixelSizeToPercent(40)).toBe(100);
    expect(brushPixelSizeToPercent(120)).toBe(200);
  });

  it('filters out bubbles covered by eraser strokes', () => {
    const mockBubbles: TextBubble[] = [
      {
        id: 'bubble_1',
        box_2d: [100, 100, 200, 200], // ymin, xmin, ymax, xmax
        source_text: 'Hello',
        translated_text: 'สวัสดี',
        speaker: 'Narrator',
        bubble_type: 'speech',
        reading_order: 1,
      },
      {
        id: 'bubble_2',
        box_2d: [500, 500, 600, 600],
        source_text: 'World',
        translated_text: 'โลก',
        speaker: 'Narrator',
        bubble_type: 'speech',
        reading_order: 2,
      },
    ];

    // Mock CanvasRenderingContext2D in Node environment
    const mockCtx = {
      getImageData: (x: number, y: number, w: number, h: number) => {
        const data = new Uint8Array(w * h * 4);
        // If query rect is in the erased area (100, 100, 100, 100), fill alpha
        if (x <= 150 && y <= 150) {
          for (let i = 3; i < data.length; i += 4) {
            data[i] = 255;
          }
        }
        return { data };
      },
    } as unknown as CanvasRenderingContext2D;

    const remaining = filterOutErasedBubbles(mockCtx, mockBubbles, 1000, 1000);
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe('bubble_2');
  });
});
