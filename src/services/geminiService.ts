import {
  DiscoveredPlaylistMemoryEntry,
  GeminiModelId,
  MangaOcrTranslationResult,
  TextBubble,
} from '../types';
import {
  RawOcrBubble,
  safeParseOcrTranslationResult,
  sanitizeBox2d,
} from '../utils/safeJsonParser';

export class GeminiQuotaError extends Error {
  public isQuotaError = true;
  public status: number;
  public modelId: GeminiModelId;
  public originalMessage: string;

  constructor(message: string, modelId: GeminiModelId, status = 429, originalMessage = '') {
    super(message);
    this.name = 'GeminiQuotaError';
    this.status = status;
    this.modelId = modelId;
    this.originalMessage = originalMessage || message;
  }
}

interface GeminiOCRResponse {
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

// Helper delay for backoff retries
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

// Convert canvas or blob to base64
function canvasToBase64(canvas: HTMLCanvasElement): { base64Data: string; mimeType: string } {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) throw new Error('Failed to convert canvas to base64');
  return { mimeType: match[1], base64Data: match[2] };
}

/** Requests an image-capable Gemini model to remove source-language text while preserving the artwork. */
export async function removeSourceTextWithGemini(
  imageUrl: string,
  apiKey: string
): Promise<string> {
  if (!apiKey.trim()) throw new Error('กรุณาตั้งค่า Gemini API Key ก่อนใช้ AI ลบข้อความ');

  const image = await loadImageElement(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('ไม่สามารถเตรียมภาพสำหรับ AI ได้');
  context.drawImage(image, 0, 0);
  const { base64Data, mimeType } = canvasToBase64(canvas);

  const imageModels = [
    'gemini-2.5-flash-image',
    'gemini-3-pro-image-preview',
    'gemini-2.0-flash-preview-image-generation',
  ];
  let lastError = '';

  for (const model of imageModels) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: 'Remove every source-language letter, speech-bubble text, caption text, and sound-effect text from this manga page. Preserve the artwork, panel lines, characters, speech balloons, composition, resolution, and all non-text visual details exactly. Return a cleaned image with no text and no added translation.' },
              { inline_data: { mime_type: mimeType, data: base64Data } },
            ],
          }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
      }
    );

    if (!response.ok) {
      lastError = `${model}: ${response.status}`;
      continue;
    }

    const result = await response.json();
    const imagePart = result.candidates?.[0]?.content?.parts?.find((part: any) => part.inlineData?.data || part.inline_data?.data);
    const inlineData = imagePart?.inlineData || imagePart?.inline_data;
    if (inlineData?.data) {
      return `data:${inlineData.mimeType || inlineData.mime_type || 'image/png'};base64,${inlineData.data}`;
    }
    lastError = `${model}: ไม่ส่งภาพกลับมา`;
  }

  throw new Error(`Gemini ไม่สามารถใช้โมเดลลบข้อความจากภาพได้ (${lastError || 'ไม่มีโมเดลภาพที่พร้อมใช้'})`);
}

// Helper to map model names to Gemini API endpoints
export function getApiModelName(modelId: GeminiModelId, customModel?: string): string {
  if (modelId === 'custom' && customModel && customModel.trim().length > 0) {
    return customModel.trim();
  }

  const map: Record<string, string> = {
    'gemini-2.5-flash': 'gemini-2.5-flash',
    'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
    'gemini-2.5-pro': 'gemini-2.5-pro',
    'gemini-3-flash': 'gemini-3-flash',
    'gemini-3-pro': 'gemini-3-pro',
    'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite',
    'gemini-3.5-flash': 'gemini-3.5-flash',
    'gemini-3.5-flash-lite': 'gemini-3.5-flash-lite',
    'gemini-3.6-flash': 'gemini-3.6-flash',
    'gemini-3.7-flash': 'gemini-3.7-flash',
    'gemini-3.8-flash': 'gemini-3.8-flash',
    'gemini-2.5-flash-lite-preview': 'gemini-2.5-flash-lite-preview',
    'gemini-2-flash-exp': 'gemini-2.0-flash-exp',
    'gemini-2-pro-exp': 'gemini-2.0-pro-exp-02-05',
    'gemini-2.5-flash-preview': 'gemini-2.5-flash-preview',
    'gemini-2.5-pro-preview': 'gemini-2.5-pro-preview',
    'gemini-3-flash-preview': 'gemini-3-flash-preview',
    'gemini-3-pro-preview': 'gemini-3-pro-preview',
    'gemini-2.0-flash': 'gemini-2.0-flash',
    'gemini-1.5-pro': 'gemini-1.5-pro'
  };

  return map[modelId] || modelId;
}

/** Extracts only reusable story glossary entries from user-written context. */
export async function extractPlaylistMemoryFromTextWithGemini(
  text: string,
  apiKey: string,
  modelId: GeminiModelId,
  customModelName = ''
): Promise<DiscoveredPlaylistMemoryEntry[]> {
  if (!apiKey.trim()) throw new Error('กรุณากรอก Gemini API Key ก่อนให้ AI วิเคราะห์บริบท');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${getApiModelName(modelId, customModelName)}:generateContent?key=${apiKey.trim()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Extract only reusable manga glossary entries from the following user story context. Keep only explicit or highly confident character names, organizations, universities, schools, pronouns/titles, power ranks, skills, character levels, locations (including countries and cities), and items. Ignore ordinary prose and style instructions. Preserve exact original/source spelling in source_name and the Thai spelling supplied or clearly intended by the user in thai_name. Do not invent translations. Output JSON only: {"memory_entries":[{"source_name":"","thai_name":"","category":"character|organization|university|school|pronoun|power_rank|skill|character_level|location|item|other","notes":""}]}\n\nUSER STORY CONTEXT:\n${text}` }] }],
        generationConfig: { response_mime_type: 'application/json', temperature: 0, max_output_tokens: 2048 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini ไม่สามารถวิเคราะห์บริบทได้ (${response.status})`);
  const result = await response.json();
  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return dedupeMemoryEntries(safeParseOcrTranslationResult(rawText).memoryEntries);
}

/** Extracts glossary entries from translated OCR dialogue text (source_text → translated_text pairs). */
export async function extractPlaylistMemoryFromTranslationsWithGemini(
  translationPairs: string,
  apiKey: string,
  modelId: GeminiModelId,
  customModelName = ''
): Promise<DiscoveredPlaylistMemoryEntry[]> {
  if (!apiKey.trim()) throw new Error('กรุณากรอก Gemini API Key ก่อนให้ AI วิเคราะห์คำแปล');

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

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${getApiModelName(modelId, customModelName)}:generateContent?key=${apiKey.trim()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { response_mime_type: 'application/json', temperature: 0, max_output_tokens: 4096 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini ไม่สามารถวิเคราะห์คำแปลได้ (${response.status})`);
  const result = await response.json();
  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return dedupeMemoryEntries(safeParseOcrTranslationResult(rawText).memoryEntries);
}

// Process a single image chunk with Gemini API
async function callGeminiForImageChunk(
  base64Data: string,
  mimeType: string,
  apiKey: string,
  modelId: GeminiModelId,
  targetLanguage: string,
  contextGuidance = '',
  memoryDirectives = '',
  customModelName = ''
): Promise<GeminiOCRResponse> {
  let selectedApiModel = getApiModelName(modelId, customModelName);

  // Build minimal, token-efficient system instruction
  let systemInstruction = `You are an exhaustive, ultra-thorough Manga/Comic OCR & Translation AI.
PRIMARY DIRECTIVE:
Detect and translate EVERY single piece of text on this page with ZERO omissions.

COMPREHENSIVE DETECTION CHECKLIST (DO NOT SKIP ANY):
1. All speech balloons (round, oval, jagged, shouts, whispers, large or tiny).
2. All narration & thought boxes (square/rectangular caption panels).
3. All floating side-text (small handwritten mutterings or commentary outside bubbles next to characters).
4. All sound effects (SFX) and signs/labels.
Scan the entire page meticulously. Do not omit any dialogue or captions.

TRANSLATION RULES:
1. CONTEXT:
${contextGuidance || 'Translate in a natural, punchy, contemporary modern Thai comic scanlation tone.'}
2. NO DUPLICATION:
- Output exactly ONE concise, natural translation per text element.
- NEVER output multiple versions (no modern/ancient mix) and NO parenthetical explanations.
3. SEAM & CUT-OFF TEXT CONTINUITY:
- If a dialogue balloon or word is sliced/cut off at the border, infer and complete the phrase naturally and cohesively.
4. CONCISE & CLEAN:
- Extract real comic text only. Keep Thai dialogue punchy.
5. PLAYLIST MEMORY EXTRACTION:
- Return only stable proper nouns or translation rules that appear clearly in this page: characters, organizations, universities, schools, pronouns/titles, power ranks, skills, character levels, locations (including countries and cities), or items.
- For each entry, preserve the exact source/English name and its Thai rendering used in the translation.
- Do not guess, invent, or add ordinary dialogue words. Return an empty list when there is no confident entry.`;

  // A playlist glossary is isolated per story and takes priority over fresh transliteration.
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

Output strictly valid JSON:
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

  const prompt = `Exhaustively detect EVERY text element, dialogue balloon, narration box, and floating side-text on this page with precise bounding boxes [ymin, xmin, ymax, xmax] (0-1000 scale, order: top, left, bottom, right). Translate all of them into ${targetLanguage}. Do not miss any text.`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      response_mime_type: 'application/json',
      temperature: 0.1,
      max_output_tokens: 8192
    }
  };

  let url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedApiModel}:generateContent?key=${apiKey.trim()}`;

  let response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  // If 404 (model endpoint not found in specific account/region), attempt automatic fallback to latest stable endpoint
  if (response.status === 404 && selectedApiModel !== 'gemini-2.5-flash' && !customModelName) {
    const fallbackModel = 'gemini-2.5-flash';
    const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:generateContent?key=${apiKey.trim()}`;
    const fallbackRes = await fetch(fallbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    if (fallbackRes.ok) {
      response = fallbackRes;
      selectedApiModel = fallbackModel;
    }
  }

  // If 503 (High Demand / Overloaded Server), retry with exponential backoff
  if (response.status === 503) {
    const retryDelays = [1500, 3000, 4500];
    for (let attempt = 0; attempt < retryDelays.length; attempt++) {
      console.warn(`[Gemini API] Server reported 503 (High Demand) for "${selectedApiModel}". Retrying in ${retryDelays[attempt]}ms (Attempt ${attempt + 1}/${retryDelays.length})...`);
      await sleep(retryDelays[attempt]);

      const retryRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (retryRes.ok) {
        response = retryRes;
        break;
      }
      response = retryRes;
    }

    // If 503 still persists after retries, attempt automatic failover to a lighter model with separate cluster capacity
    if (response.status === 503 && !customModelName) {
      const altModel = selectedApiModel.includes('flash-lite') ? 'gemini-2.5-flash' : 'gemini-2.5-flash-lite';
      console.warn(`[Gemini API] 503 High Demand persisted on "${selectedApiModel}". Attempting automatic failover to "${altModel}"...`);
      const altUrl = `https://generativelanguage.googleapis.com/v1beta/models/${altModel}:generateContent?key=${apiKey.trim()}`;
      const altRes = await fetch(altUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      if (altRes.ok) {
        response = altRes;
        selectedApiModel = altModel;
      }
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    let parsedErr = errorText;
    try {
      const jsonErr = JSON.parse(errorText);
      parsedErr = jsonErr.error?.message || errorText;
    } catch { }

    if (response.status === 503 || parsedErr.toLowerCase().includes('high demand') || parsedErr.toLowerCase().includes('temporarily unavailable') || parsedErr.toLowerCase().includes('overloaded')) {
      throw new GeminiQuotaError(
        `เซิร์ฟเวอร์ Google สำหรับโมเดล "${selectedApiModel}" กำลังมีผู้ใช้งานหนาแน่นชั่วคราว (Google 503 High Demand) กรุณากดเลือกโมเดลอื่นเพื่อแปลต่อ หรือลองใหม่อีกครั้งในอีกสักครู่`,
        modelId,
        503,
        parsedErr
      );
    }

    if (response.status === 429 || parsedErr.toLowerCase().includes('quota') || parsedErr.toLowerCase().includes('resource_exhausted') || parsedErr.toLowerCase().includes('rate limit')) {
      throw new GeminiQuotaError(
        `โควตา Token สำหรับโมเดล "${selectedApiModel}" เต็มหรือติด Rate Limit ชั่วคราว`,
        modelId,
        429,
        parsedErr
      );
    }

    if (response.status === 404 || parsedErr.includes('not found')) {
      throw new GeminiQuotaError(
        `โมเดล "${selectedApiModel}" ยังไม่เปิดใช้งานในบัญชีของคุณ หรือชื่อโมเดลไม่ถูกต้อง`,
        modelId,
        404,
        parsedErr
      );
    }

    throw new Error(`Gemini API Error (${response.status}): ${parsedErr}`);
  }

  const result = await response.json();
  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) return { bubbles: [], memoryEntries: [] };

  return safeParseOcrTranslationResult(rawText);
}

/**
 * High Precision Multimodal Manga OCR with Intelligent Webtoon Slicing
 * Slices tall images to eliminate vertical coordinate drift and maps coordinates accurately.
 */
export async function processMangaOcrWithGemini(
  imageUrlOrFile: string | File,
  apiKey: string,
  modelId: GeminiModelId,
  targetLanguage = 'Thai (ภาษาไทย สำนวนมังงะ/การ์ตูนธรรมชาติ อ่านสนุก ได้อารมณ์)',
  contextGuidance = '',
  memoryDirectives = '',
  customModelName = ''
): Promise<MangaOcrTranslationResult> {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('กรุณากรอก Gemini API Key ในการตั้งค่า (Settings) หรือกดใช้โหมดสาธิต (Demo)');
  }

  const img = await loadImageElement(imageUrlOrFile);
  const fullWidth = img.naturalWidth || 800;
  const fullHeight = img.naturalHeight || 1200;

  const rawBubblesWithOffset: Array<{
    bubble: GeminiOCRResponse['bubbles'][0];
    sliceStartY: number;
    sliceHeight: number;
  }> = [];
  const discoveredMemoryEntries: DiscoveredPlaylistMemoryEntry[] = [];

  // Decide if chunking is needed for ultra-tall images (> 4800px)
  // Gemini vision natively handles images up to 4800px with zero slice cuts
  const CHUNK_HEIGHT = 2800;
  const OVERLAP_PX = 400;

  if (fullHeight <= 4800) {
    // Process as single image
    const canvas = document.createElement('canvas');
    canvas.width = fullWidth;
    canvas.height = fullHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context error');
    ctx.drawImage(img, 0, 0);
    const { base64Data, mimeType } = canvasToBase64(canvas);

    const chunkResult = await callGeminiForImageChunk(
      base64Data,
      mimeType,
      apiKey,
      modelId,
      targetLanguage,
      contextGuidance,
      memoryDirectives,
      customModelName
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
    // Slice into overlapping chunks only for ultra-long continuous webtoon strips
    const slices: Array<{ startY: number; height: number }> = [];
    let currentY = 0;

    while (currentY < fullHeight) {
      const sliceH = Math.min(CHUNK_HEIGHT, fullHeight - currentY);
      slices.push({ startY: currentY, height: sliceH });
      if (currentY + sliceH >= fullHeight) break;
      currentY += (sliceH - OVERLAP_PX);
    }

    // Process chunks sequentially
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

      const { base64Data, mimeType } = canvasToBase64(canvas);

      const chunkResult = await callGeminiForImageChunk(
        base64Data,
        mimeType,
        apiKey,
        modelId,
        targetLanguage,
        contextGuidance,
        memoryDirectives,
        customModelName
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

  // Map chunk coordinates back to full image 0-1000 scale and de-duplicate
  const mappedBubbles: TextBubble[] = [];

  rawBubblesWithOffset.forEach((item, idx) => {
    const b = item.bubble;
    const [localYmin, localXmin, localYmax, localXmax] = sanitizeBox2d(b.box_2d);

    // Calculate exact global pixel Y
    const globalYminPx = item.sliceStartY + (localYmin / 1000) * item.sliceHeight;
    const globalYmaxPx = item.sliceStartY + (localYmax / 1000) * item.sliceHeight;

    // Convert to normalized 0-1000 on the full image
    const globalYmin = Math.max(0, Math.min(1000, Math.round((globalYminPx / fullHeight) * 1000)));
    const globalYmax = Math.max(globalYmin + 10, Math.min(1000, Math.round((globalYmaxPx / fullHeight) * 1000)));
    const globalXmin = Math.max(0, Math.min(1000, Math.round(localXmin)));
    const globalXmax = Math.max(globalXmin + 10, Math.min(1000, Math.round(localXmax)));

    // Check for 2D spatial overlap in the overlap seam
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
      const textMatch = existing.source_text.trim().toLowerCase() === b.source_text.trim().toLowerCase() ||
        (existing.source_text.length > 3 && b.source_text.includes(existing.source_text)) ||
        (b.source_text.length > 3 && existing.source_text.includes(b.source_text));

      return spatialOverlap || (Math.abs(eYmin - globalYmin) < 25 && textMatch);
    });

    if (duplicateIdx !== -1) {
      // Merge: retain the one with longer/more complete text and combine bounding boxes
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
        source_text: useNewText ? b.source_text : existing.source_text,
        translated_text: useNewText && b.translated_text ? b.translated_text : existing.translated_text
      };
    } else {
      mappedBubbles.push({
        id: `bubble_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        box_2d: [globalYmin, globalXmin, globalYmax, globalXmax],
        source_text: b.source_text || '',
        translated_text: b.translated_text || '',
        speaker: b.speaker || (b.bubble_type === 'sfx' ? 'SFX เสียงประกอบ' : `ตัวละคร`),
        bubble_type: b.bubble_type || 'speech',
        text_orientation: b.text_orientation || 'horizontal',
        emotion: b.emotion || 'neutral',
        bg_color: '#ffffff', // SOLID WHITE 100% OPAQUE BY DEFAULT
        text_color: '#000000',
        reading_order: mappedBubbles.length + 1,
        confidence: 0.95
      });
    }
  });

  // Sort bubbles strictly from top to bottom
  mappedBubbles.sort((a, b) => a.box_2d[0] - b.box_2d[0]);
  mappedBubbles.forEach((b, idx) => { b.reading_order = idx + 1; });

  return {
    bubbles: mappedBubbles,
    memoryEntries: dedupeMemoryEntries(discoveredMemoryEntries),
  };
}
