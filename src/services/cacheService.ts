import { MangaPage, TextBubble } from '../types';

const CACHE_PREFIX = 'freebuff_manga_ocr_v1_';
const CACHE_INDEX_KEY = 'freebuff_manga_cache_index';

export function buildOcrCacheContextKey(
  targetLanguage: string,
  translationContext: string,
  playlistId: string,
  memoryFingerprint: string
): string {
  return [
    targetLanguage,
    translationContext || 'default',
    `playlist:${playlistId || 'none'}`,
    `memory:${memoryFingerprint || 'empty'}`,
  ].join('::');
}

// Simple fast perceptual hash calculation from base64/URL
export async function calculateImageHash(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    // If it's a data url or short url, hash snippet
    if (imageUrl.startsWith('data:')) {
      let hash = 0;
      const sample = imageUrl.slice(0, 5000) + imageUrl.slice(-5000);
      for (let i = 0; i < sample.length; i++) {
        const char = sample.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
      }
      resolve(`img_${Math.abs(hash)}_${imageUrl.length}`);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, 16, 16);
          const data = ctx.getImageData(0, 0, 16, 16).data;
          let hash = 0;
          for (let i = 0; i < data.length; i += 4) {
            hash = (hash << 5) - hash + data[i] + data[i + 1] + data[i + 2];
            hash |= 0;
          }
          resolve(`hash_${Math.abs(hash)}_${img.naturalWidth}x${img.naturalHeight}`);
          return;
        }
      } catch (e) {
        // fallback
      }
      resolve(`url_${encodeURIComponent(imageUrl.slice(-40))}`);
    };
    img.onerror = () => {
      resolve(`url_${encodeURIComponent(imageUrl.slice(-40))}`);
    };
    img.src = imageUrl;
  });
}

export function saveOcrToCache(imageHash: string, bubbles: TextBubble[], model: string, targetLang: string) {
  try {
    const key = `${CACHE_PREFIX}${imageHash}_${targetLang}`;
    const payload = {
      bubbles,
      model,
      targetLang,
      cachedAt: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(payload));

    // Update index
    const indexStr = localStorage.getItem(CACHE_INDEX_KEY);
    const index: string[] = indexStr ? JSON.parse(indexStr) : [];
    if (!index.includes(key)) {
      index.push(key);
      localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index.slice(-100))); // keep latest 100
    }
  } catch (e) {
    console.warn('Failed to save to local cache:', e);
  }
}

export function getOcrFromCache(imageHash: string, targetLang: string): TextBubble[] | null {
  try {
    const key = `${CACHE_PREFIX}${imageHash}_${targetLang}`;
    const item = localStorage.getItem(key);
    if (!item) return null;
    const parsed = JSON.parse(item);
    return parsed.bubbles || null;
  } catch (e) {
    return null;
  }
}

export function clearOcrCache() {
  try {
    const indexStr = localStorage.getItem(CACHE_INDEX_KEY);
    if (indexStr) {
      const index: string[] = JSON.parse(indexStr);
      index.forEach((k) => localStorage.removeItem(k));
      localStorage.removeItem(CACHE_INDEX_KEY);
    }
    // Also clean any leftover
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(k);
      }
    });
  } catch (e) {
    console.error('Error clearing cache', e);
  }
}

export function getCacheStats() {
  let count = 0;
  let sizeBytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith(CACHE_PREFIX) || key === CACHE_INDEX_KEY)) {
      count++;
      sizeBytes += (localStorage.getItem(key) || '').length * 2;
    }
  }
  return { count, sizeKb: (sizeBytes / 1024).toFixed(1) };
}
