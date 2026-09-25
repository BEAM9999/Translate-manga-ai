import { MangaPage, TextBubble } from '../types';
import { wrapCanvasText } from './canvasTextLayout';

/**
 * Loads an image from a URL or DataURL cleanly into an HTMLImageElement
 */
export function loadCanvasImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load image for rendering: ${e}`));
    img.src = src;
  });
}

/**
 * Draws a rounded rectangle path on canvas context
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Renders a full MangaPage with high-resolution translated speech bubbles directly onto an HTML5 Canvas
 */
export async function renderMangaPageToCanvas(
  page: MangaPage,
  backdropOpacity = 0.88
): Promise<HTMLCanvasElement> {
  const img = await loadCanvasImage(page.originalImageUrl);
  const width = img.naturalWidth || page.width || 800;
  const height = img.naturalHeight || page.height || 1200;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to acquire 2D canvas context');

  // 1. Draw base comic artwork
  ctx.drawImage(img, 0, 0, width, height);

  if (page.translationsEmbedded) return canvas;

  // 2. Draw translated text bubbles
  for (const bubble of page.ocrResults) {
    let [ymin, xmin, ymax, xmax] = bubble.box_2d;

    // Normalize floats if needed
    if (ymin <= 1.0 && ymax <= 1.0 && ymax > 0) {
      ymin *= 1000;
      xmin *= 1000;
      ymax *= 1000;
      xmax *= 1000;
    }

    const boxX = (xmin / 1000) * width;
    const boxY = (ymin / 1000) * height;
    const boxW = Math.max(30, ((xmax - xmin) / 1000) * width);
    const boxH = Math.max(20, ((ymax - ymin) / 1000) * height);

    const isSFX = bubble.bubble_type === 'sfx';
    const isDark = bubble.bg_color === '#000000';
    const isTransparent = bubble.bg_color === 'transparent';

    // Draw backdrop if not SFX and not fully transparent
    if (!isSFX && !isTransparent) {
      ctx.save();
      const radius = bubble.bubble_type === 'thought' ? 24 : 8;
      drawRoundedRect(ctx, boxX, boxY, boxW, boxH, radius);

      ctx.fillStyle = isDark
        ? `rgba(15, 20, 30, ${backdropOpacity})`
        : `rgba(255, 255, 255, ${backdropOpacity})`;
      ctx.fill();

      ctx.lineWidth = Math.max(1.5, Math.round(width / 600));
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.7)';
      ctx.stroke();
      ctx.restore();
    }

    // Draw Text with Stroke
    const text = bubble.translated_text || '';
    if (text) {
      ctx.save();

      // Calculate dynamic font size based on box dimensions
      const boxArea = boxW * boxH;
      const textLen = Math.max(1, text.length);
      const charArea = boxArea / textLen;
      let fontSize = Math.round(Math.sqrt(charArea) * 0.95);
      fontSize = Math.max(12, Math.min(Math.round(boxH * 0.45), fontSize, 48));

      ctx.font = `bold ${fontSize}px "Mali", "Sarabun", "Itim", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const padding = 8;
      const maxTextWidth = boxW - padding * 2;
      const lines = wrapCanvasText(ctx, text, maxTextWidth);

      const lineHeight = fontSize * 1.25;
      const totalTextHeight = lines.length * lineHeight;
      const startY = boxY + (boxH - totalTextHeight) / 2 + lineHeight / 2;
      const centerX = boxX + boxW / 2;

      for (let l = 0; l < lines.length; l++) {
        const lineText = lines[l];
        const lineY = startY + l * lineHeight;

        // Draw Thick Black Outline
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.lineWidth = Math.max(3, Math.round(fontSize * 0.18));
        ctx.strokeStyle = '#000000';
        ctx.strokeText(lineText, centerX, lineY);

        // Draw Crisp Text Fill
        ctx.fillStyle = isSFX ? '#f59e0b' : '#ffffff';
        ctx.fillText(lineText, centerX, lineY);
      }

      ctx.restore();
    }
  }

  return canvas;
}
