import { MangaPage } from '../types';
import { loadCanvasImage } from './mangaCanvasRenderer';
import { wrapCanvasText } from './canvasTextLayout';

function normalizeBubbleBox(
  box: [number, number, number, number],
  width: number,
  height: number
) {
  let [ymin, xmin, ymax, xmax] = box;
  if (ymin <= 1 && ymax <= 1 && ymax > 0) {
    ymin *= 1000;
    xmin *= 1000;
    ymax *= 1000;
    xmax *= 1000;
  }
  const x = Math.max(0, Math.floor((Math.min(xmin, xmax) / 1000) * width));
  const y = Math.max(0, Math.floor((Math.min(ymin, ymax) / 1000) * height));
  const right = Math.min(width, Math.ceil((Math.max(xmin, xmax) / 1000) * width));
  const bottom = Math.min(height, Math.ceil((Math.max(ymin, ymax) / 1000) * height));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

function sampleBoxEdgeColor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const inset = Math.max(2, Math.min(8, Math.round(Math.min(width, height) * 0.1)));
  const samples: Array<[number, number, number]> = [];
  const steps = Math.max(4, Math.min(16, Math.round((width + height) / 80)));

  for (let index = 0; index <= steps; index++) {
    const horizontal = x + inset + ((width - inset * 2) * index) / steps;
    const vertical = y + inset + ((height - inset * 2) * index) / steps;
    for (const [sampleX, sampleY] of [
      [horizontal, y + inset],
      [horizontal, y + height - inset - 1],
      [x + inset, vertical],
      [x + width - inset - 1, vertical],
    ]) {
      const pixel = ctx.getImageData(Math.max(0, Math.round(sampleX)), Math.max(0, Math.round(sampleY)), 1, 1).data;
      samples.push([pixel[0], pixel[1], pixel[2]]);
    }
  }

  const colorBuckets = new Map<string, Array<[number, number, number]>>();
  for (const sample of samples) {
    const bucket = sample.map(value => Math.round(value / 32) * 32).join(',');
    const bucketSamples = colorBuckets.get(bucket) || [];
    bucketSamples.push(sample);
    colorBuckets.set(bucket, bucketSamples);
  }
  const dominantSamples = [...colorBuckets.values()].sort((left, right) => right.length - left.length)[0] || samples;
  const average = (channel: number) => Math.round(dominantSamples.reduce((sum, sample) => sum + sample[channel], 0) / dominantSamples.length);
  return { red: average(0), green: average(1), blue: average(2) };
}

function luminance(red: number, green: number, blue: number) {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

/** Clears high-contrast source glyph pixels from OCR areas while retaining the speech-bubble artwork. */
export async function removeDetectedTextFromImage(page: MangaPage): Promise<string> {
  const image = await loadCanvasImage(page.originalImageUrl);
  const width = image.naturalWidth || page.width || 800;
  const height = image.naturalHeight || page.height || 1200;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to acquire 2D canvas context');
  ctx.drawImage(image, 0, 0, width, height);

  for (const bubble of page.ocrResults) {
    const box = normalizeBubbleBox(bubble.box_2d, width, height);
    const inset = Math.max(2, Math.min(8, Math.round(Math.min(box.width, box.height) * 0.1)));
    if (box.width <= inset * 2 || box.height <= inset * 2) continue;

    const background = sampleBoxEdgeColor(ctx, box.x, box.y, box.width, box.height);
    const innerX = box.x + inset;
    const innerY = box.y + inset;
    const innerWidth = box.width - inset * 2;
    const innerHeight = box.height - inset * 2;
    const pixels = ctx.getImageData(innerX, innerY, innerWidth, innerHeight);
    const backgroundLuminance = luminance(background.red, background.green, background.blue);

    for (let index = 0; index < pixels.data.length; index += 4) {
      const red = pixels.data[index];
      const green = pixels.data[index + 1];
      const blue = pixels.data[index + 2];
      const pixelLuminance = luminance(red, green, blue);
      const colorDistance = Math.hypot(red - background.red, green - background.green, blue - background.blue);
      const isDarkInkOnLightBubble = backgroundLuminance >= 150 && pixelLuminance < backgroundLuminance - 32;
      const isLightInkOnDarkBubble = backgroundLuminance <= 105 && pixelLuminance > backgroundLuminance + 32;
      const isStrongContrastInk = backgroundLuminance > 105 && backgroundLuminance < 150 && colorDistance > 92;

      if (isDarkInkOnLightBubble || isLightInkOnDarkBubble || isStrongContrastInk) {
        pixels.data[index] = background.red;
        pixels.data[index + 1] = background.green;
        pixels.data[index + 2] = background.blue;
      }
    }
    ctx.putImageData(pixels, innerX, innerY);
  }

  return canvas.toDataURL('image/png', 1.0);
}

/**
 * Embeds translated text directly after the user has manually removed original text.
 * 
 * @returns A new data URL of the inpainted image with embedded translations.
 */
export async function inpaintAndEmbedText(
  page: MangaPage
): Promise<string> {
  const img = await loadCanvasImage(page.originalImageUrl);
  const width = img.naturalWidth || page.width || 800;
  const height = img.naturalHeight || page.height || 1200;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to acquire 2D canvas context');

  // 1. Draw the original manga artwork
  ctx.drawImage(img, 0, 0, width, height);

  // 2. Draw only translated text. The original artwork remains untouched.
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
    const boxW = Math.max(10, ((xmax - xmin) / 1000) * width);
    const boxH = Math.max(10, ((ymax - ymin) / 1000) * height);

    const text = bubble.translated_text || '';
    if (!text) continue;

    ctx.save();

    // Calculate dynamic font size
    const boxArea = boxW * boxH;
    const textLen = Math.max(1, text.length);
    const charArea = boxArea / textLen;
    let fontSize = Math.round(Math.sqrt(charArea) * 0.9);
    fontSize = Math.max(10, Math.min(Math.round(boxH * 0.4), fontSize, 48));

    ctx.font = `bold ${fontSize}px "Mali", "Sarabun", "Itim", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const padding = 6;
    const maxTextWidth = Math.max(1, boxW - padding * 2);
    const lines = wrapCanvasText(ctx, text, maxTextWidth);

    const lineHeight = fontSize * 1.25;
    const totalTextHeight = lines.length * lineHeight;
    const startY = boxY + (boxH - totalTextHeight) / 2 + lineHeight / 2;
    const centerX = boxX + boxW / 2;

    for (let l = 0; l < lines.length; l++) {
      const lineText = lines[l];
      const lineY = startY + l * lineHeight;

      ctx.fillStyle = bubble.text_color || (bubble.bubble_type === 'sfx' ? '#f59e0b' : '#000000');
      ctx.fillText(lineText, centerX, lineY);
    }

    ctx.restore();
  }

  return canvas.toDataURL('image/png', 1.0);
}

/**
 * Applies eraser/paint strokes onto the manga page image.
 * Takes the overlay canvas data and composites it onto the original image.
 * 
 * @returns A new data URL of the modified image.
 */
export async function applyDrawingToImage(
  originalImageUrl: string,
  overlayCanvas: HTMLCanvasElement,
  pageWidth: number,
  pageHeight: number
): Promise<string> {
  const img = await loadCanvasImage(originalImageUrl);
  const width = img.naturalWidth || pageWidth || 800;
  const height = img.naturalHeight || pageHeight || 1200;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to acquire 2D canvas context');

  // 1. Draw original image
  ctx.drawImage(img, 0, 0, width, height);

  // 2. Composite the overlay strokes on top
  ctx.drawImage(overlayCanvas, 0, 0, width, height);

  return canvas.toDataURL('image/png', 1.0);
}
