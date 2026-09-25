import { MangaPage, TextBubble } from '../types';

export interface SeamStitchResult {
  compositeImageUrl: string;
  topSliceRatio: number;
  bottomSliceRatio: number;
  seamYRatio: number; // 0.5 (500/1000)
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Loads an image from a URL or Data URI safely
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Failed to load image for seam stitching: ' + e));
    img.src = src;
  });
}

/**
 * Creates a vertical composite slice stitching the bottom edge of topPage and top edge of bottomPage
 * @param topPage Top adjacent manga page
 * @param bottomPage Bottom adjacent manga page
 * @param overlapPx Number of vertical pixels to extract from each boundary (default 380px)
 */
export async function stitchAdjacentPageSeam(
  topPage: MangaPage,
  bottomPage: MangaPage,
  overlapPx = 380
): Promise<SeamStitchResult> {
  const [topImg, bottomImg] = await Promise.all([
    loadImage(topPage.originalImageUrl),
    loadImage(bottomPage.originalImageUrl)
  ]);

  const targetWidth = Math.max(topImg.naturalWidth, bottomImg.naturalWidth);
  const actualTopOverlapPx = Math.min(overlapPx, topImg.naturalHeight * 0.45);
  const actualBottomOverlapPx = Math.min(overlapPx, bottomImg.naturalHeight * 0.45);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = actualTopOverlapPx + actualBottomOverlapPx;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }

  // Clear canvas
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 1. Draw bottom slice of top page
  // Source: x=0, y=topImg.height - actualTopOverlapPx, w=topImg.width, h=actualTopOverlapPx
  // Dest: x=0, y=0, w=targetWidth, h=actualTopOverlapPx
  ctx.drawImage(
    topImg,
    0,
    topImg.naturalHeight - actualTopOverlapPx,
    topImg.naturalWidth,
    actualTopOverlapPx,
    0,
    0,
    targetWidth,
    actualTopOverlapPx
  );

  // 2. Draw top slice of bottom page
  // Source: x=0, y=0, w=bottomImg.width, h=actualBottomOverlapPx
  // Dest: x=0, y=actualTopOverlapPx, w=targetWidth, h=actualBottomOverlapPx
  ctx.drawImage(
    bottomImg,
    0,
    0,
    bottomImg.naturalWidth,
    actualBottomOverlapPx,
    0,
    actualTopOverlapPx,
    targetWidth,
    actualBottomOverlapPx
  );

  const compositeImageUrl = canvas.toDataURL('image/jpeg', 0.92);

  return {
    compositeImageUrl,
    topSliceRatio: actualTopOverlapPx / topImg.naturalHeight,
    bottomSliceRatio: actualBottomOverlapPx / bottomImg.naturalHeight,
    seamYRatio: actualTopOverlapPx / canvas.height,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height
  };
}

/**
 * Remaps OCR bubbles detected on the seam composite back onto the top and bottom pages
 */
export function remapSeamOcrBubbles(
  seamBubbles: TextBubble[],
  topPage: MangaPage,
  bottomPage: MangaPage,
  stitchInfo: SeamStitchResult
): { updatedTopBubbles: TextBubble[]; updatedBottomBubbles: TextBubble[] } {
  const topRemapped: TextBubble[] = [];
  const bottomRemapped: TextBubble[] = [];

  const seamSplitY = stitchInfo.seamYRatio * 1000; // e.g. 500

  for (const b of seamBubbles) {
    const [ymin, xmin, ymax, xmax] = b.box_2d;
    const yCenter = (ymin + ymax) / 2;

    // Check if the bubble spans across the seam (cut in half)
    const isCrossingSeam = ymin < seamSplitY && ymax > seamSplitY;

    if (isCrossingSeam) {
      // For split bubbles across the border:
      // Place the full, complete translated bubble on whichever page holds more of the bubble
      if (yCenter < seamSplitY) {
        // Belongs primarily to top page bottom border
        // Remap to top page coords (near y=1000)
        const mappedYmin = Math.max(0, 1000 - ((seamSplitY - ymin) / seamSplitY) * (stitchInfo.topSliceRatio * 1000));
        const mappedYmax = 998;
        topRemapped.push({
          ...b,
          id: `seam_top_${b.id}_${Date.now()}`,
          box_2d: [mappedYmin, xmin, mappedYmax, xmax]
        });
      } else {
        // Belongs primarily to bottom page top border
        // Remap to bottom page coords (near y=0)
        const mappedYmin = 2;
        const mappedYmax = Math.min(1000, ((ymax - seamSplitY) / (1000 - seamSplitY)) * (stitchInfo.bottomSliceRatio * 1000));
        bottomRemapped.push({
          ...b,
          id: `seam_bottom_${b.id}_${Date.now()}`,
          box_2d: [mappedYmin, xmin, mappedYmax, xmax]
        });
      }
    } else if (yCenter < seamSplitY) {
      // Purely on the top page bottom edge
      const mappedYmin = Math.max(0, 1000 - ((seamSplitY - ymin) / seamSplitY) * (stitchInfo.topSliceRatio * 1000));
      const mappedYmax = Math.min(1000, 1000 - ((seamSplitY - ymax) / seamSplitY) * (stitchInfo.topSliceRatio * 1000));
      topRemapped.push({
        ...b,
        id: `seam_top_${b.id}_${Date.now()}`,
        box_2d: [Math.min(mappedYmin, mappedYmax), xmin, Math.max(mappedYmin, mappedYmax), xmax]
      });
    } else {
      // Purely on the bottom page top edge
      const mappedYmin = Math.max(0, ((ymin - seamSplitY) / (1000 - seamSplitY)) * (stitchInfo.bottomSliceRatio * 1000));
      const mappedYmax = Math.min(1000, ((ymax - seamSplitY) / (1000 - seamSplitY)) * (stitchInfo.bottomSliceRatio * 1000));
      bottomRemapped.push({
        ...b,
        id: `seam_bottom_${b.id}_${Date.now()}`,
        box_2d: [Math.min(mappedYmin, mappedYmax), xmin, Math.max(mappedYmin, mappedYmax), xmax]
      });
    }
  }

  // Filter out any broken half-cut fragments from original pages near borders (top page bottom: y > 850, bottom page top: y < 150)
  const cleanedTop = topPage.ocrResults.filter(b => {
    const isNearBottom = b.box_2d[2] > (1000 - stitchInfo.topSliceRatio * 1000);
    // If we found a better remapped bubble at the seam, remove old border fragment
    if (isNearBottom && topRemapped.length > 0) {
      return !topRemapped.some(r => Math.abs(r.box_2d[1] - b.box_2d[1]) < 80);
    }
    return true;
  });

  const cleanedBottom = bottomPage.ocrResults.filter(b => {
    const isNearTop = b.box_2d[0] < (stitchInfo.bottomSliceRatio * 1000);
    if (isNearTop && bottomRemapped.length > 0) {
      return !bottomRemapped.some(r => Math.abs(r.box_2d[1] - b.box_2d[1]) < 80);
    }
    return true;
  });

  return {
    updatedTopBubbles: [...cleanedTop, ...topRemapped],
    updatedBottomBubbles: [...cleanedBottom, ...bottomRemapped]
  };
}
