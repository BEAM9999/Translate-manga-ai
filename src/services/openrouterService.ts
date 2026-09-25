import {
  DiscoveredPlaylistMemoryEntry,
  MangaOcrTranslationResult,
  TextBubble,
} from '../types';
import { GeminiQuotaError } from './geminiService';
import {
  RawOcrBubble,
  safeParseOcrTranslationResult,
  sanitizeBox2d,
} from '../utils/safeJsonParser';

interface OpenRouterOCRResponse {
  bubbles: RawOcrBubble[];
  memoryEntries: DiscoveredPlaylistMemoryEntry[];
}

// Convert image URL or File to an HTMLImageElement
function loadImageElement(imageUrlOrFile: string | File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;

    if (typeof imageUrlOrFile === 'string') {
      img.src = imageUrlOrFile;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(imageUrlOrFile);
    }
  });
}

function canvasToBase64(canvas: HTMLCanvasElement): { base64Data: string; mimeType: string; dataUrl: string } {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) throw new Error('Failed to convert canvas to base64');
  return { mimeType: match[1], base64Data: match[2], dataUrl };
}

function dedupeMemoryEntries(
  entries: DiscoveredPlaylistMemoryEntry[]
): DiscoveredPlaylistMemoryEntry[] {
  const knownNames = new Set<string>();

  return entries.filter((entry) => {
    const key = entry.sourceName.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    if (!key || knownNames.has(key)) return false;
    knownNames.add(key);
    return true;
  }).slice(0, 50);
}

/** Extracts only reusable story glossary entries from user-written context. */
export async function extractPlaylistMemoryFromTextWithOpenRouter(
  text: string,
  apiKey: string,
  modelId: string
): Promise<DiscoveredPlaylistMemoryEntry[]> {
  if (!apiKey.trim()) throw new Error('กรุณากรอก OpenRouter API Key ก่อนให้ AI วิเคราะห์บริบท');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`,
      'HTTP-Referer': 'http://localhost:3000/',
      'X-Title': 'Freebuff Manga OCR & Translation Studio',
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{
        role: 'user',
        content: `Extract only reusable manga glossary entries from the following user story context. Keep only explicit or highly confident character names, organizations, universities, schools, pronouns/titles, power ranks, skills, character levels, locations (including countries and cities), and items. Ignore ordinary prose and style instructions. Preserve exact original/source spelling in source_name and the Thai spelling supplied or clearly intended by the user in thai_name. Do not invent translations. Output JSON only: {"memory_entries":[{"source_name":"","thai_name":"","category":"character|organization|university|school|pronoun|power_rank|skill|character_level|location|item|other","notes":""}]}\n\nUSER STORY CONTEXT:\n${text}`,
      }],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) throw new Error(`OpenRouter ไม่สามารถวิเคราะห์บริบทได้ (${response.status})`);
  const result = await response.json();
  const rawText = result.choices?.[0]?.message?.content || '';
  return dedupeMemoryEntries(safeParseOcrTranslationResult(rawText).memoryEntries);
}

/** Extracts glossary entries from translated OCR dialogue text (source_text → translated_text pairs). */
export async function extractPlaylistMemoryFromTranslationsWithOpenRouter(
  translationPairs: string,
  apiKey: string,
  modelId: string
): Promise<DiscoveredPlaylistMemoryEntry[]> {
  if (!apiKey.trim()) throw new Error('กรุณากรอก OpenRouter API Key ก่อนให้ AI วิเคราะห์คำแปล');

  const prompt = `You are analyzing translated manga/comic dialogue. The input contains pairs of original text and Thai translations extracted from OCR. Your job is to identify and extract ALL reusable glossary entries including:

- Character names (first name, last name, family name, nickname, alias)
- Organization names (sects, guilds, clans, teams, companies)
- University and school names
- Location names (countries, cities, provinces, towns, villages, specific places)
- Pronoun/title mappings (honorifics, ranks, titles)
- Power rank names and levels
- Skill and technique names
- Character level designations
- Item names
- Any other proper nouns or recurring translated terms

For each entry, provide:
- source_name: The exact original/source language spelling as it appears in the source text
- thai_name: The Thai translation/transliteration as used in the translated text
- category: One of character|organization|university|school|pronoun|power_rank|skill|character_level|location|item|other
- notes: Brief context (e.g. "ตัวเอก", "สมาชิกทีม", "เมืองหลวง")

Be thorough and extract ALL proper nouns you can find. Do not skip any names, places, or terms. Do not invent entries that don't appear in the text.

Output JSON only: {"memory_entries":[{"source_name":"","thai_name":"","category":"","notes":""}]}

TRANSLATED DIALOGUE DATA:
${translationPairs}`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`,
      'HTTP-Referer': 'http://localhost:3000/',
      'X-Title': 'Freebuff Manga OCR & Translation Studio',
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) throw new Error(`OpenRouter ไม่สามารถวิเคราะห์คำแปลได้ (${response.status})`);
  const result = await response.json();
  const rawText = result.choices?.[0]?.message?.content || '';
  return dedupeMemoryEntries(safeParseOcrTranslationResult(rawText).memoryEntries);
}

/**
 * Calls OpenRouter Vision API for a single image chunk
 */
async function callOpenRouterForChunk(
  dataUrl: string,
  apiKey: string,
  modelId: string,
  targetLanguage: string,
  contextGuidance = '',
  memoryDirectives = ''
): Promise<OpenRouterOCRResponse> {
  let systemInstruction = `You are an exhaustive, ultra-thorough Manga/Comic OCR & Translation AI.
PRIMARY DIRECTIVE:
Detect and translate EVERY single piece of text on this page with ZERO omissions.

COMPREHENSIVE DETECTION CHECKLIST (DO NOT SKIP ANY):
1. All speech balloons (round, oval, jagged, shouts, whispers, large or tiny).
2. All narration & thought boxes (square/rectangular caption panels).
3. All floating side-text (small handwritten mutterings or commentary outside bubbles next to characters).
4. All sound effects (SFX) and signs/labels.
Scan the entire page meticulously. Do not omit any dialogue or captions.

STRICT RULES:
1. SINGLE CONTEXT:
${contextGuidance || 'Translate in a natural, punchy, contemporary modern Thai comic scanlation tone.'}
2. NO DUPLICATION:
- Output exactly ONE concise, natural translation per bubble.
- NO dual versions, NO parentheses explanations.
3. SEAM & CUT-OFF TEXT CONTINUITY:
- If a dialogue balloon or text is sliced/cut off at the border, infer and complete the phrase naturally and cohesively.
4. CONCISE & CLEAN:
- Extract real comic text only.
5. PLAYLIST MEMORY EXTRACTION:
- Return only stable proper nouns or translation rules that appear clearly in this page: characters, organizations, universities, schools, pronouns/titles, power ranks, skills, character levels, locations (including countries and cities), or items.
- For each entry, preserve the exact source/English name and its Thai rendering used in the translation.
- Do not guess, invent, or add ordinary dialogue words. Return an empty list when there is no confident entry.`;

  if (memoryDirectives && memoryDirectives.trim().length > 0) {
    systemInstruction += `\n\nUSER GLOSSARY & CHARACTER MEMORY (AUTHORITATIVE):\n${memoryDirectives.trim()}\n\nGLOSSARY PRIORITY RULES:\n- When a source/original name matches a glossary entry, use its mapped Thai name EXACTLY in every translated_text and speaker field. Do not re-transliterate, shorten, alter, or replace it.\n- The glossary is higher priority than your preferred spelling or inferred context.\n- Do not repeat entries already present in this glossary inside memory_entries; return only confident NEW entries from this page.`;
  }

  systemInstruction += `\n\nCRITICAL COORDINATE & BOUNDING BOX RULES:
- "box_2d": [ymin, xmin, ymax, xmax] strictly normalized on a 0 to 1000 integer scale:
  * ymin: Top edge distance from image top (0 = top of image, 1000 = bottom of image)
  * xmin: Left edge distance from image left (0 = left of image, 1000 = right of image)
  * ymax: Bottom edge distance from image top (0 = top of image, 1000 = bottom of image)
  * xmax: Right edge distance from image left (0 = left of image, 1000 = right of image)
- ALWAYS follow the exact order: [TOP, LEFT, BOTTOM, RIGHT]. NEVER use [left, top, right, bottom] or [x, y, w, h].
- ymin < ymax and xmin < xmax.
- Bounding box MUST tightly and fully encompass the entire speech balloon or text block so that the translated overlay will cover the original text 100%.

Output strictly JSON:
{
  "bubbles": [
    {
      "box_2d": [ymin, xmin, ymax, xmax],
      "source_text": "Original text",
      "translated_text": "Single concise translated sentence",
      "speaker": "Protagonist / Hero / Villain / Narrator / SFX",
      "bubble_type": "speech" | "thought" | "shout" | "whisper" | "narration" | "sfx" | "physics_label",
      "text_orientation": "horizontal" | "vertical" | "slanted",
      "emotion": "neutral",
      "reading_order": 1
    }
  ],
  "memory_entries": [
    {
      "source_name": "Exact source or English name",
      "thai_name": "Thai name used in this translation",
      "category": "character" | "organization" | "university" | "school" | "pronoun" | "power_rank" | "skill" | "character_level" | "location" | "item" | "other",
      "notes": "Optional concise context"
    }
  ]
}`;

  const userPrompt = `Exhaustively detect EVERY text element, dialogue balloon, narration box, and floating side-text on this page with precise bounding boxes [ymin, xmin, ymax, xmax] (0-1000 scale, order: top, left, bottom, right). Translate all of them into ${targetLanguage}. Do not miss any text.`;

  const requestBody = {
    model: modelId,
    messages: [
      {
        role: 'system',
        content: systemInstruction
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          {
            type: 'image_url',
            image_url: {
              url: dataUrl
            }
          }
        ]
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 8192
  };

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`,
      'HTTP-Referer': 'http://localhost:3000/',
      'X-Title': 'Freebuff Manga OCR & Translation Studio'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsedErr = errorText;
    try {
      const jsonErr = JSON.parse(errorText);
      parsedErr = jsonErr.error?.message || errorText;
    } catch {}

    if (response.status === 429 || response.status === 402 || parsedErr.toLowerCase().includes('credit') || parsedErr.toLowerCase().includes('rate limit') || parsedErr.toLowerCase().includes('quota')) {
      throw new GeminiQuotaError(
        `โควตา / เครดิต OpenRouter สำหรับโมเดล "${modelId}" หมดหรือติด Rate Limit ชั่วคราว`,
        'custom',
        response.status,
        parsedErr
      );
    }

    throw new Error(`OpenRouter API Error (${response.status}): ${parsedErr}`);
  }

  const result = await response.json();
  const rawContent = result.choices?.[0]?.message?.content;
  if (!rawContent) return { bubbles: [], memoryEntries: [] };

  return safeParseOcrTranslationResult(rawContent);
}

/**
 * Process Manga OCR with OpenRouter Vision Models (with smart tall-image chunking)
 */
export async function processMangaOcrWithOpenRouter(
  imageUrlOrFile: string | File,
  apiKey: string,
  modelId: string,
  targetLanguage = 'Thai (ภาษาไทย สำนวนมังงะ/การ์ตูนธรรมชาติ อ่านสนุก ได้อารมณ์)',
  contextGuidance = '',
  memoryDirectives = ''
): Promise<MangaOcrTranslationResult> {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('กรุณากรอก OpenRouter API Key ในหน้าตั้งค่า (Settings)');
  }

  const img = await loadImageElement(imageUrlOrFile);
  const fullWidth = img.naturalWidth || 800;
  const fullHeight = img.naturalHeight || 1200;

  const rawBubblesWithOffset: Array<{
    bubble: OpenRouterOCRResponse['bubbles'][0];
    sliceStartY: number;
    sliceHeight: number;
  }> = [];
  const discoveredMemoryEntries: DiscoveredPlaylistMemoryEntry[] = [];

  const CHUNK_HEIGHT = 2800;
  const OVERLAP_PX = 400;

  if (fullHeight <= 4800) {
    const canvas = document.createElement('canvas');
    canvas.width = fullWidth;
    canvas.height = fullHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context error');
    ctx.drawImage(img, 0, 0);
    const { dataUrl } = canvasToBase64(canvas);

    const chunkResult = await callOpenRouterForChunk(
      dataUrl,
      apiKey,
      modelId,
      targetLanguage,
      contextGuidance,
      memoryDirectives
    );

    chunkResult.bubbles.forEach(b => {
      rawBubblesWithOffset.push({
        bubble: b,
        sliceStartY: 0,
        sliceHeight: fullHeight
      });
    });
    discoveredMemoryEntries.push(...chunkResult.memoryEntries);
  } else {
    // Slices for tall webtoon images
    const slices: Array<{ startY: number; height: number }> = [];
    let currentY = 0;

    while (currentY < fullHeight) {
      const sliceH = Math.min(CHUNK_HEIGHT, fullHeight - currentY);
      slices.push({ startY: currentY, height: sliceH });
      if (currentY + sliceH >= fullHeight) break;
      currentY += (sliceH - OVERLAP_PX);
    }

    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i];
      const canvas = document.createElement('canvas');
      canvas.width = fullWidth;
      canvas.height = slice.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      ctx.drawImage(
        img,
        0, slice.startY, fullWidth, slice.height,
        0, 0, fullWidth, slice.height
      );

      const { dataUrl } = canvasToBase64(canvas);

      const chunkResult = await callOpenRouterForChunk(
        dataUrl,
        apiKey,
        modelId,
        targetLanguage,
        contextGuidance,
        memoryDirectives
      );

      chunkResult.bubbles.forEach(b => {
        rawBubblesWithOffset.push({
          bubble: b,
          sliceStartY: slice.startY,
          sliceHeight: slice.height
        });
      });
      discoveredMemoryEntries.push(...chunkResult.memoryEntries);
    }
  }

  // Map coordinates and deduplicate
  const mappedBubbles: TextBubble[] = [];

  rawBubblesWithOffset.forEach((item, idx) => {
    const b = item.bubble;
    const [localYmin, localXmin, localYmax, localXmax] = sanitizeBox2d(b.box_2d);

    const globalYminPx = item.sliceStartY + (localYmin / 1000) * item.sliceHeight;
    const globalYmaxPx = item.sliceStartY + (localYmax / 1000) * item.sliceHeight;

    const globalYmin = Math.max(0, Math.min(1000, Math.round((globalYminPx / fullHeight) * 1000)));
    const globalYmax = Math.max(globalYmin + 10, Math.min(1000, Math.round((globalYmaxPx / fullHeight) * 1000)));
    const globalXmin = Math.max(0, Math.min(1000, Math.round(localXmin)));
    const globalXmax = Math.max(globalXmin + 10, Math.min(1000, Math.round(localXmax)));

    // Spatial overlap deduplication in overlap seam
    const duplicateIdx = mappedBubbles.findIndex(existing => {
      const eYmin = existing.box_2d[0];
      const eXmin = existing.box_2d[1];
      const eYmax = existing.box_2d[2];
      const eXmax = existing.box_2d[3];

      const yOverlap = Math.max(0, Math.min(eYmax, globalYmax) - Math.max(eYmin, globalYmin));
      const xOverlap = Math.max(0, Math.min(eXmax, globalXmax) - Math.max(eXmin, globalXmin));
      const intersectionArea = yOverlap * xOverlap;

      const areaNew = (globalYmax - globalYmin) * (globalXmax - globalXmin);
      const areaExisting = (eYmax - eYmin) * (eXmax - eXmin);
      const minArea = Math.min(areaNew, areaExisting);

      const spatialOverlap = minArea > 0 && (intersectionArea / minArea) > 0.35;
      const textMatch = existing.source_text.trim().toLowerCase() === (b.source_text || '').trim().toLowerCase() ||
        (existing.source_text.length > 3 && (b.source_text || '').includes(existing.source_text)) ||
        ((b.source_text || '').length > 3 && existing.source_text.includes(b.source_text || ''));

      return spatialOverlap || (Math.abs(eYmin - globalYmin) < 25 && textMatch);
    });

    if (duplicateIdx !== -1) {
      const existing = mappedBubbles[duplicateIdx];
      const useNewText = (b.source_text || '').length > (existing.source_text || '').length;
      mappedBubbles[duplicateIdx] = {
        ...existing,
        box_2d: [
          Math.min(existing.box_2d[0], globalYmin),
          Math.min(existing.box_2d[1], globalXmin),
          Math.max(existing.box_2d[2], globalYmax),
          Math.max(existing.box_2d[3], globalXmax)
        ],
        source_text: useNewText ? (b.source_text || '') : existing.source_text,
        translated_text: useNewText && b.translated_text ? b.translated_text : existing.translated_text
      };
    } else {
      mappedBubbles.push({
        id: `bubble_or_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        box_2d: [globalYmin, globalXmin, globalYmax, globalXmax],
        source_text: b.source_text || '',
        translated_text: b.translated_text || '',
        speaker: b.speaker || (b.bubble_type === 'sfx' ? 'SFX เสียงประกอบ' : `ตัวละคร`),
        bubble_type: b.bubble_type || 'speech',
        text_orientation: b.text_orientation || 'horizontal',
        emotion: b.emotion || 'neutral',
        bg_color: '#ffffff', // SOLID WHITE 100% OPAQUE
        text_color: '#000000',
        reading_order: mappedBubbles.length + 1,
        confidence: 0.95
      });
    }
  });

  mappedBubbles.sort((a, b) => a.box_2d[0] - b.box_2d[0]);
  mappedBubbles.forEach((b, idx) => { b.reading_order = idx + 1; });

  return {
    bubbles: mappedBubbles,
    memoryEntries: dedupeMemoryEntries(discoveredMemoryEntries),
  };
}
