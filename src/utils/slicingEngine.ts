import { TextBubble } from '../types';

export interface SliceInfo {
  index: number;
  startY: number; // 0 to 1000
  endY: number;   // 0 to 1000
  startYPx: number;
  heightPx: number;
  widthPx: number;
}

export interface SmartSliceResult {
  pageId: string;
  totalSlices: number;
  slices: SliceInfo[];
  isAutoDetermined: boolean;
  reason: string;
}

/**
 * Calculates optimal slice count based on aspect ratio and image height
 */
export function calculateAutoSliceCount(width: number, height: number): number {
  if (!width || !height) return 1;
  const ratio = height / width;

  if (height <= 1800 || ratio <= 1.8) {
    return 1; // Standard single manga page
  }
  if (ratio <= 3.2 || height <= 3200) {
    return 2;
  }
  if (ratio <= 5.0 || height <= 5200) {
    return 3;
  }
  if (ratio <= 7.5 || height <= 7500) {
    return 4;
  }
  if (ratio <= 10.0 || height <= 10000) {
    return 5;
  }
  return Math.min(8, Math.ceil(height / 1800));
}

/**
 * Finds the optimal vertical cut line that avoids slicing across any speech bubble
 * @param idealCutY Normalized 0-1000 ideal cut point
 * @param bubbles List of OCR text bubbles on the page
 * @param searchWindow Normalized search window around idealCutY (e.g. ±60)
 */
function findSafeSeam(idealCutY: number, bubbles: TextBubble[], searchWindow = 60): number {
  if (bubbles.length === 0) return idealCutY;

  const minSearchY = Math.max(10, idealCutY - searchWindow);
  const maxSearchY = Math.min(990, idealCutY + searchWindow);

  // Check if idealCutY itself is safe (doesn't intersect any bubble)
  const isSafe = (y: number) => {
    return !bubbles.some(b => {
      const [ymin, , ymax] = b.box_2d;
      // Add a small safety padding of 8 units
      return y >= (ymin - 8) && y <= (ymax + 8);
    });
  };

  if (isSafe(idealCutY)) {
    return idealCutY;
  }

  // Scan outward from idealCutY to find the closest safe gap
  for (let delta = 1; delta <= searchWindow; delta++) {
    const yDown = idealCutY + delta;
    if (yDown <= maxSearchY && isSafe(yDown)) {
      return yDown;
    }
    const yUp = idealCutY - delta;
    if (yUp >= minSearchY && isSafe(yUp)) {
      return yUp;
    }
  }

  // Fallback: If entire search window has bubbles, find the point with minimal overlap
  return idealCutY;
}

/**
 * Computes slice boundary coordinates for a page
 */
export function computePageSlices(
  width: number,
  height: number,
  bubbles: TextBubble[],
  forcedSliceCount?: number
): SmartSliceResult {
  const autoCount = calculateAutoSliceCount(width, height);
  const sliceCount = (forcedSliceCount && forcedSliceCount > 0) ? forcedSliceCount : autoCount;

  if (sliceCount <= 1) {
    return {
      pageId: '',
      totalSlices: 1,
      slices: [
        {
          index: 1,
          startY: 0,
          endY: 1000,
          startYPx: 0,
          heightPx: height,
          widthPx: width,
        }
      ],
      isAutoDetermined: !forcedSliceCount,
      reason: 'ขนาดภาพมาตรฐาน ไม่จำเป็นต้องตัดท่อน'
    };
  }

  // Calculate cut points
  const cutPoints: number[] = [0];
  const step = 1000 / sliceCount;

  for (let i = 1; i < sliceCount; i++) {
    const idealY = Math.round(i * step);
    const safeCutY = findSafeSeam(idealY, bubbles);
    cutPoints.push(safeCutY);
  }
  cutPoints.push(1000);

  // Build slice infos
  const slices: SliceInfo[] = [];
  for (let i = 0; i < cutPoints.length - 1; i++) {
    const startY = cutPoints[i];
    const endY = cutPoints[i + 1];
    const startYPx = Math.round((startY / 1000) * height);
    const endYPx = Math.round((endY / 1000) * height);
    const heightPx = Math.max(10, endYPx - startYPx);

    slices.push({
      index: i + 1,
      startY,
      endY,
      startYPx,
      heightPx,
      widthPx: width,
    });
  }

  return {
    pageId: '',
    totalSlices: slices.length,
    slices,
    isAutoDetermined: !forcedSliceCount,
    reason: `คำนวณความยาวภาพ (${height}px) ตัดแบ่งเป็น ${slices.length} ท่อน โดยกะระยะหลบบอลลูนคำพูด`
  };
}
