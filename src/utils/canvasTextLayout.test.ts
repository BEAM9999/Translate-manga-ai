import { describe, expect, it } from 'vitest';
import { wrapCanvasText } from './canvasTextLayout';

const context = {
  measureText: (text: string) => ({ width: text.length * 10 }),
};

describe('wrapCanvasText', () => {
  it('keeps an explicit Shift+Enter line break', () => {
    expect(wrapCanvasText(context, 'บรรทัดแรก\nบรรทัดสอง', 200)).toEqual([
      'บรรทัดแรก',
      'บรรทัดสอง',
    ]);
  });

  it('keeps an intentional blank line', () => {
    expect(wrapCanvasText(context, 'หนึ่ง\n\nสอง', 200)).toEqual(['หนึ่ง', '', 'สอง']);
  });

  it('preserves spaces while soft-wrapping text', () => {
    expect(wrapCanvasText(context, 'one two three', 90)).toEqual(['one two ', 'three']);
  });
});