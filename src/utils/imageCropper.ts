/**
 * Performs canvas-based lossless image cropping
 */
export async function cropImage(
  imageUrl: string,
  cropRect: { top: number; left: number; width: number; height: number }
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = cropRect.width;
        canvas.height = cropRect.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }

        // Draw cropped region from source
        ctx.drawImage(
          img,
          cropRect.left,
          cropRect.top,
          cropRect.width,
          cropRect.height,
          0,
          0,
          cropRect.width,
          cropRect.height
        );

        const dataUrl = canvas.toDataURL('image/png', 1.0);
        resolve({ dataUrl, width: cropRect.width, height: cropRect.height });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

/**
 * Splits an image into top and bottom parts at cutYPx
 */
export async function splitImageAtY(
  imageUrl: string,
  cutYPx: number,
  totalWidth: number,
  totalHeight: number
): Promise<{
  topDataUrl: string;
  bottomDataUrl: string;
  topHeight: number;
  bottomHeight: number;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const safeCutY = Math.max(5, Math.min(img.naturalHeight - 5, Math.round((cutYPx / totalHeight) * img.naturalHeight)));
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;

        // Top Canvas
        const topCanvas = document.createElement('canvas');
        topCanvas.width = imgW;
        topCanvas.height = safeCutY;
        const topCtx = topCanvas.getContext('2d');
        if (topCtx) {
          topCtx.drawImage(img, 0, 0, imgW, safeCutY, 0, 0, imgW, safeCutY);
        }

        // Bottom Canvas
        const bottomHeightPx = imgH - safeCutY;
        const bottomCanvas = document.createElement('canvas');
        bottomCanvas.width = imgW;
        bottomCanvas.height = bottomHeightPx;
        const bottomCtx = bottomCanvas.getContext('2d');
        if (bottomCtx) {
          bottomCtx.drawImage(img, 0, safeCutY, imgW, bottomHeightPx, 0, 0, imgW, bottomHeightPx);
        }

        resolve({
          topDataUrl: topCanvas.toDataURL('image/png', 1.0),
          bottomDataUrl: bottomCanvas.toDataURL('image/png', 1.0),
          topHeight: safeCutY,
          bottomHeight: bottomHeightPx,
        });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}
