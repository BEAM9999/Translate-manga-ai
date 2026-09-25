export type GeminiModelId =
  | 'gemini-2.5-flash'
  | 'gemini-2.5-flash-lite'
  | 'gemini-2.5-pro'
  | 'gemini-3-flash'
  | 'gemini-3-pro'
  | 'gemini-3.1-flash-lite'
  | 'gemini-3.5-flash'
  | 'gemini-3.5-flash-lite'
  | 'gemini-3.6-flash'
  | 'gemini-3.7-flash'
  | 'gemini-3.8-flash'
  | 'gemini-2.5-flash-lite-preview'
  | 'gemini-2-flash-exp'
  | 'gemini-2-pro-exp'
  | 'gemini-2.5-flash-preview'
  | 'gemini-2.5-pro-preview'
  | 'gemini-3-flash-preview'
  | 'gemini-3-pro-preview'
  | 'gemini-2.0-flash'
  | 'gemini-1.5-pro'
  | 'custom';

export type AiProvider = 'gemini' | 'openrouter';

export type ModelHealthStatus = 'idle' | 'checking' | 'active' | 'error';

export interface OpenRouterModelEntry {
  id: string; // e.g. "stepfun/step-3.5-flash:free"
  name: string; // e.g. "StepFun: Step 3.5 Flash (free)"
  key: string; // e.g. "sk-or-v1-541578bb..."
  provider: 'openrouter' | 'gemini';
  addedAt?: number;
  status?: ModelHealthStatus; // 'idle' | 'checking' | 'active' | 'error'
  statusMessage?: string;
  lastCheckedAt?: number;
}

export interface CustomModelItem {
  id: string;
  name: string;
  key?: string;
  isFree?: boolean;
}

export interface ModelOption {
  id: GeminiModelId;
  name: string;
  category: 'Recommended' | 'Pro / Deep Context' | 'Ultra Fast / Lite' | 'Preview / Experimental';
  description: string;
  badge?: string;
}

export type BubbleType = 'speech' | 'thought' | 'shout' | 'whisper' | 'narration' | 'sfx' | 'physics_label';
export type TextOrientation = 'horizontal' | 'vertical' | 'slanted';

export type BubbleShape =
  | 'rounded'          // สี่เหลี่ยมขอบมน (Standard Rounded Bubble)
  | 'oval'             // วงรี / ทรงไข่ (Oval / Ellipse Bubble)
  | 'square'           // สี่เหลี่ยมมุมฉาก / กล่องบรรยาย (Square Narration Box)
  | 'thought_cloud'    // ฟองความคิด / ก้อนเมฆหยักมน (Thought Cloud)
  | 'shout_spiky'      // ฟองตะโกน / หนามแหลมหอยเม่น / ระเบิดพลัง (Spiky Explosion Shout)
  | 'electric_shock'   // ประกายสายฟ้า / ช็อกตกใจสุดขีด (Shock / Jagged Lightning)
  | 'whisper_dashed'   // เส้นประ / กระซิบ / บรรยากาศหม่นหมอง (Whisper / Dashed Border)
  | 'transparent_sfx'; // โปร่งใส / เอฟเฟกต์ SFX ตัวหนังสือลอย (Transparent / SFX Bold)

export interface TextBubble {
  id: string;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000 normalized
  source_text: string;
  translated_text: string;
  speaker: string; // e.g. "Protagonist", "Villain", "Narrator", "Side Character", "SFX"
  bubble_type: BubbleType;
  bubble_shape?: BubbleShape; // Custom manga bubble shape style
  text_orientation?: TextOrientation;
  emotion?: string; // e.g. "angry", "shocked", "calm", "whisper", "shouting"
  bg_color?: string; // e.g. "#ffffff", "#000000", "transparent", etc.
  text_color?: string;
  reading_order: number;
  user_edited?: boolean;
  confidence?: number;
}

export interface MangaPage {
  id: string;
  file?: File;
  originalImageUrl: string;
  width: number;
  height: number;
  isTranslating: boolean;
  isTranslated: boolean;
  ocrResults: TextBubble[];
  errorMessage?: string;
  orderIndex: number;
  cachedAt?: number;
  // Set after the user saves manual cleanup following the latest OCR result.
  originalTextCleanupAt?: number;
  // OCR is retained for undo/editing, but its overlay must not be rendered or exported again.
  translationsEmbedded?: boolean;
}

export type ViewMode = 'original' | 'translated' | 'split' | 'hover';

export type TranslationContextId =
  | 'modern_era'          // ยุคปัจจุบัน / สมัยใหม่ (ภาษาพูดคนยุคปัจจุบัน 100% กระชับ เข้าใจง่าย ชื่อวิชาทับศัพท์เฉพาะ)
  | 'ancient_cultivation' // ยุคโบราณ / โลกเซียน / กำลังภายใน (ภาษาแนวยุทธภพ ข้า-เจ้า เข้าใจง่าย ไม่ลิเก)
  | 'game_system'         // ยุคเกม / ระบบดันเจี้ยน / Level Up (ศัพท์เกมเมอร์ เควสต์ สกิล ปาร์ตี้)
  | 'custom_context';     // กำหนดบริบทเฉพาะทางเอง

export interface TranslationContextOption {
  id: TranslationContextId;
  title: string;
  category: string;
  description: string;
  promptGuidance: string;
}

export interface AppSettings {
  provider: AiProvider; // 'gemini' | 'openrouter'
  apiKey: string; // Active Gemini API Key
  geminiApiKeysPool: string[]; // Backup pool of Gemini API keys
  openRouterApiKey: string; // Active OpenRouter API Key
  openRouterModel: string; // Active OpenRouter model ID
  openRouterModelEntries: OpenRouterModelEntry[]; // Individual model cards with their specific keys
  customOpenRouterModels: CustomModelItem[]; // User imported OpenRouter models
  rawSmartPasteText: string; // Persisted raw text pasted by user in LocalStorage
  selectedModel: GeminiModelId;
  customModelName: string;
  targetLanguage: string;
  translationContext: TranslationContextId;
  customContextPrompt: string;
  // AI Custom Memory & Glossary (Default disabled to save tokens)
  enableAiMemory: boolean;
  aiMemoryDirectives: string; // e.g. "Xiao Yan -> เซียวเหยียน", "Sect Master -> เจ้าสำนัก"
  sourceLanguage: 'auto' | 'en' | 'zh' | 'ja';
  fontFamily: 'Mali' | 'Itim' | 'Sarabun' | 'Comic Neue' | 'Bangers';
  fontSizeScale: number; // 0.8 to 1.5
  bubbleBackdropColor: 'auto' | 'white' | 'black' | 'transparent';
  bubbleOpacity: number; // 0.2 to 1.0 (default 0.85 semi-transparent)
  bubblePadding: number;
  readingDirection: 'ltr' | 'rtl' | 'vertical';
  autoTranslateNewPages: boolean;
  enableSeamStitching: boolean;
  selectedVoiceName?: string;
  voicePitch: number;
  voiceRate: number;
}

export interface MangaChapter {
  id: string;
  playlistId: string;
  chapterTitle: string; // e.g. "ตอนที่ 1: การกำเนิด", "Chapter 1"
  thumbnailUrl?: string; // Preview thumbnail of the first page
  pageCount: number;
  translatedBubbleCount: number;
  pages: MangaPage[]; // Complete pages data with translation overlays
  createdAt: number;
  updatedAt: number;
}

export type PlaylistMemoryCategory =
  | 'character'
  | 'organization'
  | 'university'
  | 'school'
  | 'pronoun'
  | 'power_rank'
  | 'skill'
  | 'character_level'
  | 'location'
  | 'item'
  | 'other';

export type PlaylistMemorySource = 'user' | 'ai' | 'shared';

export interface PlaylistMemoryEntry {
  id: string;
  sourceName: string;
  thaiName: string;
  category: PlaylistMemoryCategory;
  notes?: string;
  source: PlaylistMemorySource;
  createdAt: number;
  updatedAt: number;
}

export interface DiscoveredPlaylistMemoryEntry {
  sourceName: string;
  thaiName: string;
  category: PlaylistMemoryCategory;
  notes?: string;
}

export interface MangaOcrTranslationResult {
  bubbles: TextBubble[];
  memoryEntries: DiscoveredPlaylistMemoryEntry[];
}

export interface MangaPlaylist {
  id: string;
  name: string; // e.g. "Solo Leveling", "วันพีซ"
  description?: string;
  createdAt: number;
  updatedAt: number;
  chapters: MangaChapter[];
  // Optional so playlists saved before this feature continue to load unchanged.
  memoryEntries?: PlaylistMemoryEntry[];
  // Free-form story rules from AI Memory & Glossary, scoped to this playlist only.
  memoryInstructions?: string;
}
