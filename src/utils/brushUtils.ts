import { TextBubble } from '../types';

/**
 * Converts a percentage (1% - 200%) to brush/eraser pixel size.
 * - 1%: 2px (fine precision retouching)
 * - 50%: 20px
 * - 100%: 40px (standard bubble erase)
 * - 150%: 80px
 * - 200%: 120px (large quick erase)
 */
export function percentToBrushPixelSize(percent: number): number {
  const clamped = Math.max(1, Math.min(200, percent));
  if (clamped <= 100) {
    return Math.max(2, Math.round(2 + ((clamped - 1) / 99) * 38));
  }
  return Math.round(40 + ((clamped - 100) / 100) * 80);
}

/**
 * Converts a brush/eraser pixel size back to percentage (1% - 200%).
 */
export function brushPixelSizeToPercent(pixelSize: number): number {
  if (pixelSize <= 40) {
    return Math.max(1, Math.min(100, Math.round(1 + ((pixelSize - 2) / 38) * 99)));
  }
  return Math.min(200, Math.round(100 + ((pixelSize - 40) / 80) * 100));
}

/**
 * Checks if an OCR bubble was drawn over with eraser strokes.
 * If more than 15% of the bubble's area was covered with non-transparent strokes,
 * or the center area was erased, it is considered erased.
 */
export function isBubbleErasedByStrokes(
  ctx: CanvasRenderingContext2D,
  bubble: TextBubble,
  canvasWidth: number,
  canvasHeight: number
): boolean {
  if (!bubble.box_2d || bubble.box_2d.length !== 4) return false;

  const ymin = bubble.box_2d[0];
  const xmin = bubble.box_2d[1];
  const ymax = bubble.box_2d[2];
  const xmax = bubble.box_2d[3];

  const bx = Math.max(0, Math.round((xmin / 1000) * canvasWidth));
  const by = Math.max(0, Math.round((ymin / 1000) * canvasHeight));
  const bw = Math.min(canvasWidth - bx, Math.round(((xmax - xmin) / 1000) * canvasWidth));
  const bh = Math.min(canvasHeight - by, Math.round(((ymax - ymin) / 1000) * canvasHeight));

  if (bw <= 2 || bh <= 2) return false;

  try {
    const imgData = ctx.getImageData(bx, by, bw, bh);
    const data = imgData.data;
    let coveredPixels = 0;
    // Step by 16 bytes (every 4th pixel) for high performance
    const totalSampled = Math.max(1, Math.floor(data.length / 16));

    for (let i = 3; i < data.length; i += 16) {
      if (data[i] > 30) {
        // Alpha > 30 means user drew eraser strokes in this region
        coveredPixels++;
      }
    }

    // If at least 15% of sample pixels in the bubble area were touched by eraser
    return (coveredPixels / totalSampled) >= 0.15;
  } catch (err) {
    console.warn('Could not check bubble eraser overlap:', err);
    return false;
  }
}

/**
 * Filters out bubbles from the list that were covered by eraser strokes.
 */
export function filterOutErasedBubbles(
  ctx: CanvasRenderingContext2D,
  bubbles: TextBubble[],
  canvasWidth: number,
  canvasHeight: number
): TextBubble[] {
  if (!bubbles || bubbles.length === 0) return [];
  return bubbles.filter(bubble => !isBubbleErasedByStrokes(ctx, bubble, canvasWidth, canvasHeight));
}
