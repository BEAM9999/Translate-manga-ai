import { DiscoveredPlaylistMemoryEntry, PlaylistMemoryCategory } from '../types';

export interface RawOcrBubble {
  box_2d: [number, number, number, number];
  source_text: string;
  translated_text: string;
  speaker: string;
  bubble_type: 'speech' | 'thought' | 'shout' | 'whisper' | 'narration' | 'sfx' | 'physics_label';
  text_orientation?: 'horizontal' | 'vertical' | 'slanted';
  emotion?: string;
  bg_color?: string;
  reading_order?: number;
}

/**
 * Normalizes and validates bounding box coordinates [ymin, xmin, ymax, xmax] on a 0-1000 scale.
 * Recovers from:
 * - 0.0 - 1.0 floating point normalization
 * - [ymin, xmin, height, width] offset errors
 * - Inverted ymin > ymax or xmin > xmax
 * - Negative or > 1000 values
 */
export function sanitizeBox2d(rawBox: any): [number, number, number, number] {
  if (!Array.isArray(rawBox) || rawBox.length < 4) {
    return [0, 0, 100, 100];
  }

  let [b0, b1, b2, b3] = rawBox.map(val => {
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  });

  // 1. Check if model returned 0.0 - 1.0 floating point numbers
  if (b0 <= 1.0 && b1 <= 1.0 && b2 <= 1.0 && b3 <= 1.0 && (b2 > 0 || b3 > 0)) {
    b0 *= 1000;
    b1 *= 1000;
    b2 *= 1000;
    b3 *= 1000;
  }

  // 2. Check if 3rd and 4th values are [height, width] rather than [ymax, xmax]
  // (e.g. ymin=400, xmin=300, height=80, width=120 -> where 80 < 400 and 120 < 300)
  if (b2 < b0 && (b0 + b2 <= 1050) && b3 < b1 && (b1 + b3 <= 1050)) {
    b2 = b0 + b2;
    b3 = b1 + b3;
  }

  // 3. Ensure proper min/max ordering: [ymin, xmin, ymax, xmax]
  let ymin = Math.min(b0, b2);
  let ymax = Math.max(b0, b2);
  let xmin = Math.min(b1, b3);
  let xmax = Math.max(b1, b3);

  // 4. Enforce minimum dimensions so speech bubble isn't a collapsed 0-pixel sliver
  if (ymax - ymin < 12) ymax = Math.min(1000, ymin + 25);
  if (xmax - xmin < 15) xmax = Math.min(1000, xmin + 35);

  // 5. Clamp strictly within 0 - 1000 image boundaries
  ymin = Math.max(0, Math.min(995, Math.round(ymin)));
  xmin = Math.max(0, Math.min(995, Math.round(xmin)));
  ymax = Math.max(ymin + 10, Math.min(1000, Math.round(ymax)));
  xmax = Math.max(xmin + 10, Math.min(1000, Math.round(xmax)));

  return [ymin, xmin, ymax, xmax];
}

function normalizeBubbles(list: any[]): RawOcrBubble[] {
  if (!Array.isArray(list)) return [];
  return list.map((b, idx) => ({
    box_2d: sanitizeBox2d(b.box_2d),
    source_text: String(b.source_text || ''),
    translated_text: String(b.translated_text || b.source_text || ''),
    speaker: String(b.speaker || 'Narrator'),
    bubble_type: (b.bubble_type || 'speech') as RawOcrBubble['bubble_type'],
    text_orientation: (b.text_orientation || 'horizontal') as RawOcrBubble['text_orientation'],
    emotion: b.emotion || 'neutral',
    bg_color: b.bg_color || undefined,
    reading_order: typeof b.reading_order === 'number' ? b.reading_order : idx + 1
  }));
}

/**
 * Resilient JSON Parser specifically engineered for AI Manga OCR responses.
 * Recovers seamlessly from:
 * 1. Markdown code fences and surrounding text
 * 2. Unescaped quotes inside comic dialogue (e.g. "Expected double-quoted property name in JSON at position...")
 * 3. Truncated JSON when model output reaches token limit (auto-closes JSON brackets)
 * 4. Trailing commas and unquoted key syntax errors
 */
export function safeParseOcrBubbles(rawText: string): RawOcrBubble[] {
  if (!rawText || !rawText.trim()) return [];

  // 1. Initial cleanup of markdown code fences
  let clean = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

  // 2. Try standard JSON.parse first
  try {
    const parsed = JSON.parse(clean);
    if (parsed && Array.isArray(parsed.bubbles) && parsed.bubbles.length > 0) {
      return normalizeBubbles(parsed.bubbles);
    }
    if (Array.isArray(parsed) && parsed.length > 0) {
      return normalizeBubbles(parsed);
    }
  } catch {
    // Standard parse failed, proceed to automated repairs
  }

  // 3. Extract JSON object boundary { ... }
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.substring(firstBrace, lastBrace + 1);
  }

  // 4. Try parsing after fixing trailing commas
  try {
    const fixedCommas = clean.replace(/,\s*([\]}])/g, '$1');
    const parsed = JSON.parse(fixedCommas);
    if (parsed && Array.isArray(parsed.bubbles) && parsed.bubbles.length > 0) {
      return normalizeBubbles(parsed.bubbles);
    }
  } catch {
    // Continue to repair truncated JSON
  }

  // 5. Repair truncated JSON (when output hits token limit and is cut off mid-stream)
  try {
    const bubblesIdx = clean.indexOf('"bubbles"');
    if (bubblesIdx !== -1) {
      const lastObjClose = clean.lastIndexOf('}');
      if (lastObjClose > bubblesIdx) {
        // Cut off up to the last complete object and close array and object
        const truncatedRepaired = clean.substring(0, lastObjClose + 1) + ']}';
        const fixedCommas = truncatedRepaired.replace(/,\s*([\]}])/g, '$1');
        const parsed = JSON.parse(fixedCommas);
        if (parsed && Array.isArray(parsed.bubbles) && parsed.bubbles.length > 0) {
          console.warn(`[SafeJsonParser] Recovered ${parsed.bubbles.length} bubbles from truncated AI output.`);
          return normalizeBubbles(parsed.bubbles);
        }
      }
    }
  } catch {
    // Continue to regex block extraction
  }

  // 6. Resilient Regex Block Extraction:
  // Extracts all individual { ... "box_2d" ... } blocks even if unescaped quotes broke the global JSON
  const regexExtracted = extractBubblesWithRegex(rawText);
  if (regexExtracted.length > 0) {
    console.warn(`[SafeJsonParser] Resiliently extracted ${regexExtracted.length} bubbles despite JSON syntax damage.`);
    return normalizeBubbles(regexExtracted);
  }

  return [];
}

const MEMORY_CATEGORIES: PlaylistMemoryCategory[] = [
  'character',
  'organization',
  'university',
  'school',
  'pronoun',
  'power_rank',
  'skill',
  'character_level',
  'location',
  'item',
  'other',
];

function parseOcrPayload(rawText: string): Record<string, unknown> | null {
  let clean = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  const candidates = [clean];
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.substring(firstBrace, lastBrace + 1);
    candidates.push(clean, clean.replace(/,\s*([\]}])/g, '$1'));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Continue to the next recovery strategy.
    }
  }

  return null;
}

function cleanMemoryText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function getMemoryField(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = cleanMemoryText(record[key]);
    if (value) return value;
  }
  return '';
}

function isMemoryCategory(value: unknown): value is PlaylistMemoryCategory {
  return MEMORY_CATEGORIES.includes(value as PlaylistMemoryCategory);
}

function normalizeMemoryEntries(rawEntries: unknown): DiscoveredPlaylistMemoryEntry[] {
  if (!Array.isArray(rawEntries)) return [];

  const knownNames = new Set<string>();
  const entries: DiscoveredPlaylistMemoryEntry[] = [];

  rawEntries.forEach((rawEntry) => {
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry) || entries.length >= 25) {
      return;
    }

    const record = rawEntry as Record<string, unknown>;
    const sourceName = getMemoryField(record, ['source_name', 'sourceName', 'original_name', 'english_name']);
    const thaiName = getMemoryField(record, ['thai_name', 'thaiName']);
    const key = sourceName.toLocaleLowerCase();

    if (!sourceName || !thaiName || knownNames.has(key)) return;

    knownNames.add(key);
    entries.push({
      sourceName,
      thaiName,
      category: isMemoryCategory(record.category) ? record.category : 'other',
      notes: getMemoryField(record, ['notes', 'note']) || undefined,
    });
  });

  return entries;
}

function unescapeJsonField(value: string): string {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value.replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();
  }
}

function extractMemoryEntriesWithRegex(rawText: string): DiscoveredPlaylistMemoryEntry[] {
  const rawEntries: Record<string, unknown>[] = [];
  const blockRegex = /\{[^{}]*\}/gs;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(rawText)) !== null) {
    const block = match[0];
    const sourceMatch = block.match(/"(?:source_name|sourceName|original_name|english_name)"\s*:\s*"((?:\\.|[^"\\])*)"/);
    const thaiMatch = block.match(/"(?:thai_name|thaiName)"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (!sourceMatch || !thaiMatch) continue;

    const categoryMatch = block.match(/"category"\s*:\s*"((?:\\.|[^"\\])*)"/);
    const notesMatch = block.match(/"(?:notes|note)"\s*:\s*"((?:\\.|[^"\\])*)"/);
    rawEntries.push({
      source_name: unescapeJsonField(sourceMatch[1]),
      thai_name: unescapeJsonField(thaiMatch[1]),
      category: categoryMatch ? unescapeJsonField(categoryMatch[1]) : 'other',
      notes: notesMatch ? unescapeJsonField(notesMatch[1]) : '',
    });
  }

  return normalizeMemoryEntries(rawEntries);
}

export function safeParseOcrMemoryEntries(rawText: string): DiscoveredPlaylistMemoryEntry[] {
  const payload = parseOcrPayload(rawText);
  if (payload) {
    const parsedEntries = normalizeMemoryEntries(payload.memory_entries || payload.memoryEntries);
    if (parsedEntries.length > 0) return parsedEntries;
  }

  return extractMemoryEntriesWithRegex(rawText);
}

export function safeParseOcrTranslationResult(rawText: string): {
  bubbles: RawOcrBubble[];
  memoryEntries: DiscoveredPlaylistMemoryEntry[];
} {
  return {
    bubbles: safeParseOcrBubbles(rawText),
    memoryEntries: safeParseOcrMemoryEntries(rawText),
  };
}

function extractBubblesWithRegex(text: string): RawOcrBubble[] {
  const bubbles: RawOcrBubble[] = [];

  // Match { ... "box_2d" ... } blocks
  const blockRegex = /\{[^{}]*?"box_2d"\s*:\s*\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\][^{}]*?\}/gs;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(text)) !== null) {
    const block = match[0];
    try {
      const parsedBlock = JSON.parse(block);
      if (parsedBlock.box_2d && Array.isArray(parsedBlock.box_2d)) {
        bubbles.push({
          box_2d: parsedBlock.box_2d,
          source_text: parsedBlock.source_text || '',
          translated_text: parsedBlock.translated_text || parsedBlock.source_text || '',
          speaker: parsedBlock.speaker || 'Narrator',
          bubble_type: parsedBlock.bubble_type || 'speech',
          text_orientation: parsedBlock.text_orientation || 'horizontal',
          emotion: parsedBlock.emotion || 'neutral',
          reading_order: parsedBlock.reading_order || (bubbles.length + 1)
        });
        continue;
      }
    } catch {
      // Individual block JSON.parse failed due to unescaped internal quotes, parse fields via regex
    }

    // Extract fields manually with robust regular expressions
    const boxMatch = block.match(/"box_2d"\s*:\s*\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/);
    if (!boxMatch) continue;

    const ymin = parseInt(boxMatch[1], 10);
    const xmin = parseInt(boxMatch[2], 10);
    const ymax = parseInt(boxMatch[3], 10);
    const xmax = parseInt(boxMatch[4], 10);

    const sourceMatch = block.match(/"source_text"\s*:\s*"((?:\\.|[^"\\])*)"/) || block.match(/"source_text"\s*:\s*"(.*?)(?:",\s*"|"\s*\})/s);
    const transMatch = block.match(/"translated_text"\s*:\s*"((?:\\.|[^"\\])*)"/) || block.match(/"translated_text"\s*:\s*"(.*?)(?:",\s*"|"\s*\})/s);
    const speakerMatch = block.match(/"speaker"\s*:\s*"([^"]*)"/);
    const typeMatch = block.match(/"bubble_type"\s*:\s*"([^"]*)"/);
    const orientationMatch = block.match(/"text_orientation"\s*:\s*"([^"]*)"/);

    const sourceText = sourceMatch ? sourceMatch[1].replace(/\\"/g, '"') : '';
    const transText = transMatch ? transMatch[1].replace(/\\"/g, '"') : sourceText;

    bubbles.push({
      box_2d: [ymin, xmin, ymax, xmax],
      source_text: sourceText,
      translated_text: transText,
      speaker: speakerMatch ? speakerMatch[1] : 'Narrator',
      bubble_type: (typeMatch ? typeMatch[1] : 'speech') as any,
      text_orientation: (orientationMatch ? orientationMatch[1] : 'horizontal') as any,
      reading_order: bubbles.length + 1
    });
  }

  return bubbles;
}
