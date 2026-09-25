import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AppSettings,
  DiscoveredPlaylistMemoryEntry,
  GeminiModelId,
  MangaPage,
  MangaPlaylist,
  PlaylistMemoryEntry,
  TextBubble,
  ViewMode,
} from './types';
import { SAMPLE_PAGES } from './data/sampleManga';
import { TRANSLATION_CONTEXTS } from './data/translationContexts';
import { Header } from './components/Header';
import { SidebarControls } from './components/SidebarControls';
import { MangaCanvas } from './components/MangaCanvas';
import { SubtitleStream } from './components/SubtitleStream';
import { SettingsModal } from './components/SettingsModal';
import { ExportModal } from './components/ExportModal';
import { QuotaFallbackModal } from './components/QuotaFallbackModal';
import { PlaylistModal } from './components/PlaylistModal';
import { SaveToPlaylistModal } from './components/SaveToPlaylistModal';
import { PlaylistContextModal } from './components/PlaylistContextModal';
import { PlaylistMemoryPanel } from './components/PlaylistMemoryPanel';
import { BackupModal } from './components/BackupModal';
import { extractPlaylistMemoryFromTextWithGemini, extractPlaylistMemoryFromTranslationsWithGemini, processMangaOcrWithGemini, GeminiQuotaError } from './services/geminiService';
import { extractPlaylistMemoryFromTextWithOpenRouter, extractPlaylistMemoryFromTranslationsWithOpenRouter, processMangaOcrWithOpenRouter } from './services/openrouterService';
import { buildOcrCacheContextKey, calculateImageHash, getOcrFromCache, saveOcrToCache } from './services/cacheService';
import { loadPagesFromLocalStorage, savePagesToLocalStorage, clearSavedPagesStorage } from './services/storageService';
import {
  formatPlaylistMemoryDirectives,
  extractPlaylistMemoryEntriesFromInstructions,
  getAllPlaylists,
  getPlaylistById,
  getPlaylistMemoryFingerprint,
  mergePlaylistMemoryEntries,
  savePlaylistMemoryInstructions,
  updateChapterPages,
} from './services/playlistStorageService';
import { cropImage, splitImageAtY } from './utils/imageCropper';
import { parseSmartKeysAndModels } from './utils/smartKeyParser';
import { stitchAdjacentPageSeam, remapSeamOcrBubbles } from './utils/seamStitcher';
import { inpaintAndEmbedText, removeDetectedTextFromImage } from './utils/imageInpainter';
import { isTextEditingTarget } from './utils/keyboardTarget';
import { mergeMissingOcrBubbles } from './utils/ocrMerge';
import confetti from 'canvas-confetti';

const SETTINGS_STORAGE_KEY = 'freebuff_manga_app_settings_v1';
const HOME_PLAYLIST_CONTEXT_STORAGE_KEY = 'c2_sub_auto_ai_home_playlist_context_v1';

type PendingPlaylistAction =
  | {
      type: 'add_pages';
      pages: MangaPage[];
      insertIndex: number;
    }
  | {
      type: 'translate_pages';
      pageIds: string[];
      forceRefresh?: boolean;
    }
  | {
      type: 'translate_all';
    }
  | {
      type: 'bridge_seam';
      topPageId: string;
      bottomPageId: string;
    }
  | {
      type: 'bridge_all';
    }
  | null;

function normalizeBubbleReadingOrder(bubbles: TextBubble[]): TextBubble[] {
  return [...bubbles]
    .sort((left, right) => left.box_2d[0] - right.box_2d[0] || left.box_2d[1] - right.box_2d[1])
    .map((bubble, index) => ({ ...bubble, reading_order: index + 1 }));
}

interface PlaylistMemoryExtractionResult {
  addedCount: number;
  skippedCount: number;
  analyzedWithAi: boolean;
  warning?: string;
}

interface RecentMemoryImport {
  playlistId: string;
  entries: PlaylistMemoryEntry[];
}

const DEFAULT_SETTINGS: AppSettings = {
  provider: 'gemini',
  apiKey: '',
  geminiApiKeysPool: [],
  openRouterApiKey: '',
  openRouterModel: '',
  openRouterModelEntries: [],
  customOpenRouterModels: [],
  rawSmartPasteText: '',
  selectedModel: 'gemini-2.5-flash',
  customModelName: '',
  targetLanguage: 'Thai (ภาษาไทย สำนวนมังงะ/การ์ตูนธรรมชาติ อ่านสนุก ได้อารมณ์)',
  translationContext: 'modern_era',
  customContextPrompt: '',
  enableAiMemory: false,
  aiMemoryDirectives: '',
  sourceLanguage: 'auto',
  fontFamily: 'Mali',
  fontSizeScale: 1.0,
  bubbleBackdropColor: 'auto',
  bubbleOpacity: 0.85,
  bubblePadding: 4,
  readingDirection: 'ltr',
  autoTranslateNewPages: false,
  enableSeamStitching: true,
  voicePitch: 1.0,
  voiceRate: 1.05,
};

export const App: React.FC = () => {
  // Load settings (Strictly synchronized with Smart Importer text box)
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!stored) return DEFAULT_SETTINGS;
      const parsed: AppSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };

      // Ensure openRouterModelEntries strictly reflects rawSmartPasteText
      if (parsed.rawSmartPasteText && parsed.rawSmartPasteText.trim()) {
        const smart = parseSmartKeysAndModels(parsed.rawSmartPasteText);
        parsed.openRouterModelEntries = smart.openRouterEntries;
        if (smart.openRouterEntries.length > 0 && (!parsed.openRouterModel || !smart.openRouterEntries.some(e => e.id === parsed.openRouterModel))) {
          parsed.openRouterModel = smart.openRouterEntries[0].id;
          parsed.openRouterApiKey = smart.openRouterEntries[0].key;
        }
      } else {
        parsed.openRouterModelEntries = [];
        parsed.openRouterModel = '';
      }

      return parsed;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Pages state
  const [pages, setPages] = useState<MangaPage[]>([]);
  const pagesRef = useRef<MangaPage[]>([]);
  pagesRef.current = pages;

  // Undo / Redo History Stack
  const historyRef = useRef<MangaPage[][]>([[]]);
  const historyIndexRef = useRef<number>(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>('translated');
  const [activeBubbleId, setActiveBubbleId] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(100);
  const [canvasTool, setCanvasTool] = useState<'pointer' | 'eraser' | 'paint'>('pointer');
  const [isTranslatingAny, setIsTranslatingAny] = useState(false);

  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [isSaveToPlaylistModalOpen, setIsSaveToPlaylistModalOpen] = useState(false);
  const [isPlaylistContextModalOpen, setIsPlaylistContextModalOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [pendingPlaylistAction, setPendingPlaylistAction] = useState<PendingPlaylistAction>(null);
  const [activeChapterTitle, setActiveChapterTitle] = useState<string>('');
  const [playlistCount, setPlaylistCount] = useState<number>(0);
  const [homePlaylistContextId, setHomePlaylistContextId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(HOME_PLAYLIST_CONTEXT_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });
  const [activeContextPlaylist, setActiveContextPlaylist] = useState<MangaPlaylist | null>(null);
  const [recentMemoryImport, setRecentMemoryImport] = useState<RecentMemoryImport | null>(null);
  
  // Track whether user is editing a specific playlist chapter or in the Home Studio draft
  const [activePlaylistContext, setActivePlaylistContext] = useState<{
    playlistId: string;
    chapterId: string;
    chapterTitle: string;
  } | null>(null);
  const activeContextPlaylistId = activePlaylistContext?.playlistId || homePlaylistContextId;
  const activeContextPlaylistIdRef = useRef<string | null>(activeContextPlaylistId);
  const activeContextPlaylistRef = useRef<MangaPlaylist | null>(activeContextPlaylist);
  activeContextPlaylistIdRef.current = activeContextPlaylistId;
  activeContextPlaylistRef.current = activeContextPlaylist;

  const refreshPlaylistCount = useCallback(async () => {
    try {
      const list = await getAllPlaylists();
      setPlaylistCount(list.length);
    } catch {}
  }, []);

  useEffect(() => {
    refreshPlaylistCount();
  }, [refreshPlaylistCount]);

  useEffect(() => {
    let active = true;

    if (!activeContextPlaylistId) {
      setActiveContextPlaylist(null);
      return () => {
        active = false;
      };
    }

    getPlaylistById(activeContextPlaylistId).then((playlist) => {
      if (!active) return;
      setActiveContextPlaylist(playlist);

      if (!playlist && !activePlaylistContext) {
        setHomePlaylistContextId(null);
        try {
          localStorage.removeItem(HOME_PLAYLIST_CONTEXT_STORAGE_KEY);
        } catch {
          // Keep the current session usable if browser storage is unavailable.
        }
      }
    }).catch(() => {
      if (active) setActiveContextPlaylist(null);
    });

    return () => {
      active = false;
    };
  }, [activeContextPlaylistId, activePlaylistContext]);

  const handleActivePlaylistUpdated = useCallback((playlist: MangaPlaylist) => {
    if (activeContextPlaylistIdRef.current === playlist.id) {
      activeContextPlaylistRef.current = playlist;
      setActiveContextPlaylist(playlist);
    }
  }, []);

  const selectHomePlaylistContext = useCallback((playlist: MangaPlaylist) => {
    setHomePlaylistContextId(playlist.id);
    activeContextPlaylistIdRef.current = playlist.id;
    activeContextPlaylistRef.current = playlist;
    setActiveContextPlaylist(playlist);
    try {
      localStorage.setItem(HOME_PLAYLIST_CONTEXT_STORAGE_KEY, playlist.id);
    } catch {
      // Context still works during this session when storage is unavailable.
    }
  }, []);

  const requestPlaylistContext = useCallback((action: PendingPlaylistAction) => {
    setPendingPlaylistAction(action);
    setIsPlaylistContextModalOpen(true);
  }, []);

  const resolveActivePlaylistForTranslation = useCallback(async (): Promise<MangaPlaylist | null> => {
    const playlistId = activeContextPlaylistIdRef.current;
    const currentPlaylist = activeContextPlaylistRef.current;
    if (!playlistId) return null;
    if (currentPlaylist?.id === playlistId) return currentPlaylist;

    try {
      const playlist = await getPlaylistById(playlistId);
      if (playlist) {
        activeContextPlaylistRef.current = playlist;
        setActiveContextPlaylist(playlist);
      }
      return playlist;
    } catch {
      return null;
    }
  }, []);

  // Load a chapter from Playlist (enters Playlist Chapter editing mode)
  const handleLoadChapter = (
    playlistId: string,
    chapterId: string,
    loadedPages: MangaPage[],
    chapterTitle: string
  ) => {
    // If we were previously in Home Studio and had draft pages, save them first
    if (!activePlaylistContext && pages.length > 0) {
      savePagesToLocalStorage(pages);
    }

    setActivePlaylistContext({ playlistId, chapterId, chapterTitle });
    setActiveChapterTitle(chapterTitle);
    setPages(loadedPages);
    historyRef.current = [loadedPages];
    historyIndexRef.current = 0;
    setCanUndo(false);
    setCanRedo(false);
    const firstBubble = loadedPages[0]?.ocrResults?.[0]?.id || null;
    if (firstBubble) setActiveBubbleId(firstBubble);
  };

  // Return to Home / Main Studio (triggered by clicking top-left Logo/Brand)
  const handleGoToHome = async () => {
    if (!activePlaylistContext) return; // Already at home

    // Auto-save playlist chapter changes before switching back to home
    if (pages.length > 0) {
      await updateChapterPages(
        activePlaylistContext.playlistId,
        activePlaylistContext.chapterId,
        pages
      );
    }

    setActivePlaylistContext(null);
    setActiveChapterTitle('');

    // Restore Home Studio draft pages from storage
    const homePages = await loadPagesFromLocalStorage();
    const restored = homePages && homePages.length > 0 ? homePages : [];
    setPages(restored);
    historyRef.current = [restored];
    historyIndexRef.current = 0;
    setCanUndo(false);
    setCanRedo(false);
    const firstBubble = restored[0]?.ocrResults?.[0]?.id || null;
    setActiveBubbleId(firstBubble);
  };

  // Quota Exceeded / Fallback Model Switcher Modal
  const [quotaModalState, setQuotaModalState] = useState<{
    isOpen: boolean;
    exhaustedModelId: GeminiModelId;
    errorMessage?: string;
    failedPageIndex: number;
    failedPageId: string;
    isTranslatingAll: boolean;
  }>({
    isOpen: false,
    exhaustedModelId: 'gemini-2.5-flash',
    failedPageIndex: 0,
    failedPageId: '',
    isTranslatingAll: false,
  });

  const isLoadedFromStorageRef = useRef(false);

  // Automatically restore saved work on browser reload / crash recovery
  useEffect(() => {
    loadPagesFromLocalStorage().then(savedPages => {
      isLoadedFromStorageRef.current = true;
      if (savedPages && savedPages.length > 0) {
        setPages(savedPages);
        historyRef.current = [savedPages];
        historyIndexRef.current = 0;
        setCanUndo(false);
        setCanRedo(false);
        const firstBubble = savedPages[0]?.ocrResults?.[0]?.id || null;
        if (firstBubble) setActiveBubbleId(firstBubble);
      }
    });
  }, []);

  // Auto-save pages to appropriate storage (Main Studio vs Playlist Chapter)
  useEffect(() => {
    if (!isLoadedFromStorageRef.current) return;

    if (activePlaylistContext) {
      // Editing inside a playlist chapter -> auto-save strictly to that playlist chapter
      updateChapterPages(
        activePlaylistContext.playlistId,
        activePlaylistContext.chapterId,
        pages
      );
    } else {
      // In Main Studio -> auto-save to Main Studio storage
      if (pages.length > 0) {
        savePagesToLocalStorage(pages);
      } else {
        clearSavedPagesStorage();
      }
    }
  }, [pages, activePlaylistContext]);

  // Push state to history
  const updatePagesWithHistory = useCallback((newPages: MangaPage[] | ((prev: MangaPage[]) => MangaPage[])) => {
    setPages((currentPages) => {
      const resolved = typeof newPages === 'function' ? newPages(currentPages) : newPages;
      
      // Cut off redo branch
      const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
      newHistory.push(resolved);
      if (newHistory.length > 40) newHistory.shift(); // keep max 40 states

      historyRef.current = newHistory;
      historyIndexRef.current = newHistory.length - 1;

      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(false);
      pagesRef.current = resolved;

      return resolved;
    });
  }, []);

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const prevPages = historyRef.current[historyIndexRef.current];
      pagesRef.current = prevPages;
      setPages(prevPages);
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
    }
  }, []);

  // Redo
  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const nextPages = historyRef.current[historyIndexRef.current];
      pagesRef.current = nextPages;
      setPages(nextPages);
      setCanUndo(true);
      setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
    }
  }, []);

  // Keyboard shortcuts for Undo / Redo (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTextEditingTarget(e.target)) return;

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Save settings on update
  const handleSaveSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));

    const legacyInstructions = newSettings.enableAiMemory
      ? newSettings.aiMemoryDirectives?.trim()
      : '';
    if (!legacyInstructions) return;

    const playlist = await resolveActivePlaylistForTranslation();
    if (!playlist) return;

    const importedEntries = extractPlaylistMemoryEntriesFromInstructions(legacyInstructions);
    if (importedEntries.length > 0) {
      await mergePlaylistMemoryEntries(playlist.id, importedEntries, 'user');
    }
    await savePlaylistMemoryInstructions(playlist.id, legacyInstructions);
    const updatedPlaylist = await getPlaylistById(playlist.id);
    if (updatedPlaylist) handleActivePlaylistUpdated(updatedPlaylist);
  };

  const handleExtractPlaylistMemoryFromInstructions = async (): Promise<PlaylistMemoryExtractionResult> => {
    const playlist = await resolveActivePlaylistForTranslation();
    const instructions = playlist?.memoryInstructions?.trim() || '';
    if (!playlist || !instructions) {
      throw new Error('ยังไม่มีคำสั่งบริบทให้ดึงรายการชื่อ');
    }

    const typedMappings = extractPlaylistMemoryEntriesFromInstructions(instructions);
    let addedCount = 0;
    let skippedCount = 0;
    let analyzedWithAi = false;
    let warning: string | undefined;

    if (typedMappings.length > 0) {
      const typedResult = await mergePlaylistMemoryEntries(playlist.id, typedMappings, 'user');
      addedCount += typedResult.addedEntries.length;
      skippedCount += typedResult.skippedCount;
    }

    try {
      let detectedEntries: DiscoveredPlaylistMemoryEntry[] = [];
      if (settings.provider === 'openrouter') {
        const modelId = settings.openRouterModel || settings.openRouterModelEntries?.[0]?.id || '';
        const matchedEntry = settings.openRouterModelEntries?.find(entry => entry.id === modelId);
        const apiKey = matchedEntry?.key || settings.openRouterApiKey;
        if (!modelId || !apiKey?.trim()) throw new Error('กรุณาเลือกโมเดลและกรอก OpenRouter API Key ก่อนวิเคราะห์บริบท');
        detectedEntries = await extractPlaylistMemoryFromTextWithOpenRouter(instructions, apiKey, modelId);
      } else {
        if (!settings.apiKey?.trim()) throw new Error('กรุณากรอก Gemini API Key ก่อนวิเคราะห์บริบท');
        detectedEntries = await extractPlaylistMemoryFromTextWithGemini(
          instructions,
          settings.apiKey,
          settings.selectedModel,
          settings.customModelName
        );
      }

      analyzedWithAi = true;
      if (detectedEntries.length > 0) {
        const aiResult = await mergePlaylistMemoryEntries(playlist.id, detectedEntries, 'ai');
        addedCount += aiResult.addedEntries.length;
        skippedCount += aiResult.skippedCount;
      }
    } catch (error: any) {
      warning = error.message || 'AI ไม่สามารถวิเคราะห์บริบทได้';
      if (typedMappings.length === 0) throw error;
    }

    const updatedPlaylist = await getPlaylistById(playlist.id);
    if (updatedPlaylist) handleActivePlaylistUpdated(updatedPlaylist);
    return { addedCount, skippedCount, analyzedWithAi, warning };
  };

  const handleExtractPlaylistMemoryFromTranslations = async (): Promise<PlaylistMemoryExtractionResult> => {
    const playlist = await resolveActivePlaylistForTranslation();
    if (!playlist) {
      throw new Error('ยังไม่ได้เลือก Playlist สำหรับบันทึกบริบท');
    }

    // Collect all translated text pairs from current pages
    const currentPages = pagesRef.current;
    const translatedPages = currentPages.filter(p => p.isTranslated && p.ocrResults.length > 0);
    if (translatedPages.length === 0) {
      throw new Error('ยังไม่มีหน้าที่แปลแล้ว กรุณาแปลอย่างน้อย 1 หน้าก่อนดึงบริบทจากคำแปล');
    }

    // Build text pairs string for AI analysis
    const pairs = translatedPages.flatMap((page, pageIndex) =>
      page.ocrResults.map(bubble => {
        const speaker = bubble.speaker ? ` [${bubble.speaker}]` : '';
        return `[หน้า ${pageIndex + 1}]${speaker} "${bubble.source_text}" → "${bubble.translated_text}"`;
      })
    ).join('\n');

    let addedCount = 0;
    let skippedCount = 0;
    let analyzedWithAi = false;
    let warning: string | undefined;

    try {
      let detectedEntries: DiscoveredPlaylistMemoryEntry[] = [];
      if (settings.provider === 'openrouter') {
        const modelId = settings.openRouterModel || settings.openRouterModelEntries?.[0]?.id || '';
        const matchedEntry = settings.openRouterModelEntries?.find(entry => entry.id === modelId);
        const apiKey = matchedEntry?.key || settings.openRouterApiKey;
        if (!modelId || !apiKey?.trim()) throw new Error('กรุณาเลือกโมเดลและกรอก OpenRouter API Key ก่อนวิเคราะห์คำแปล');
        detectedEntries = await extractPlaylistMemoryFromTranslationsWithOpenRouter(pairs, apiKey, modelId);
      } else {
        if (!settings.apiKey?.trim()) throw new Error('กรุณากรอก Gemini API Key ก่อนวิเคราะห์คำแปล');
        detectedEntries = await extractPlaylistMemoryFromTranslationsWithGemini(
          pairs,
          settings.apiKey,
          settings.selectedModel,
          settings.customModelName
        );
      }

      analyzedWithAi = true;
      if (detectedEntries.length > 0) {
        const aiResult = await mergePlaylistMemoryEntries(playlist.id, detectedEntries, 'ai');
        addedCount += aiResult.addedEntries.length;
        skippedCount += aiResult.skippedCount;
      }
    } catch (error: any) {
      throw error;
    }

    const updatedPlaylist = await getPlaylistById(playlist.id);
    if (updatedPlaylist) handleActivePlaylistUpdated(updatedPlaylist);
    return { addedCount, skippedCount, analyzedWithAi, warning };
  };

  const handleSelectModel = (model: GeminiModelId) => {
    handleSaveSettings({ ...settings, selectedModel: model });
  };

  // Translate a single page
  const handleTranslatePage = useCallback(async (
    pageId: string,
    modelOverride?: GeminiModelId,
    apiKeyOverride?: string,
    forceRefresh = false
  ): Promise<boolean> => {
    const currentPages = pagesRef.current;
    const pageIndex = currentPages.findIndex(p => p.id === pageId);
    if (pageIndex === -1) return false;

    const targetPage = currentPages[pageIndex];
    const activeModel = modelOverride || settings.selectedModel;
    const activeApiKey = apiKeyOverride || settings.apiKey;
    const contextPlaylist = await resolveActivePlaylistForTranslation();

    if (!contextPlaylist) {
      requestPlaylistContext({
        type: 'translate_pages',
        pageIds: [pageId],
        forceRefresh,
      });
      return false;
    }

    // Set page as translating
    setPages(prev => prev.map(p => p.id === pageId ? { ...p, isTranslating: true, errorMessage: undefined } : p));

    try {
      // 1. Calculate image hash to check local cache
      const imgHash = await calculateImageHash(targetPage.originalImageUrl);
      const cacheContextKey = buildOcrCacheContextKey(
        settings.targetLanguage,
        settings.translationContext || 'default',
        contextPlaylist.id,
        getPlaylistMemoryFingerprint(
          contextPlaylist.memoryEntries || [],
          contextPlaylist.memoryInstructions
        )
      );
      const cached = getOcrFromCache(imgHash, cacheContextKey);

      // When user clicks "แปลซ้ำ" (Re-translate), targetPage.isTranslated is true or forceRefresh is true -> bypass cache for a fresh AI scan!
      const shouldBypassCache = forceRefresh || targetPage.isTranslated;

      if (!shouldBypassCache && cached && cached.length > 0) {
        // Cache hit! Zero tokens used
        updatePagesWithHistory(prev => prev.map(p => p.id === pageId ? {
          ...p,
          isTranslating: false,
          isTranslated: true,
          ocrResults: cached,
          cachedAt: Date.now()
        } : p));
        return true;
      }

      // 2. Check API key based on Provider
      if (settings.provider === 'openrouter') {
        const modelToUse = settings.openRouterModel || settings.openRouterModelEntries?.[0]?.id || 'stepfun/step-3.5-flash:free';
        const matchedEntry = settings.openRouterModelEntries?.find(e => e.id === modelToUse);
        const keyToUse = matchedEntry?.key || settings.openRouterApiKey;

        if (!keyToUse || keyToUse.trim() === '') {
          setIsSettingsOpen(true);
          throw new Error('กรุณากรอก OpenRouter API Key หรือเลือกโมเดลที่มีคีย์ในหน้าตั้งค่า (Settings)');
        }
      } else {
        if (!activeApiKey || activeApiKey.trim() === '') {
          const sampleMatch = SAMPLE_PAGES.find(sp => sp.id === targetPage.id);
          if (sampleMatch) {
            setTimeout(() => {
              updatePagesWithHistory(prev => prev.map(p => p.id === pageId ? {
                ...p,
                isTranslating: false,
                isTranslated: true,
                ocrResults: sampleMatch.ocrResults
              } : p));
            }, 600);
            return true;
          } else {
            setIsSettingsOpen(true);
            throw new Error('กรุณากรอก Gemini API Key ในการตั้งค่าเพื่อแปลภาพของคุณ');
          }
        }
      }

      // 3. Resolve genre translation context guidance & optional memory
      const selectedContext = TRANSLATION_CONTEXTS.find(c => c.id === settings.translationContext);
      const contextGuidance = settings.translationContext === 'custom_context'
        ? settings.customContextPrompt
        : selectedContext?.promptGuidance || '';

      const memoryDirectives = formatPlaylistMemoryDirectives(
        contextPlaylist.memoryEntries || [],
        contextPlaylist.memoryInstructions
      );

      // 4. Perform live Vision OCR & Localization based on active Provider
      let ocrResults: TextBubble[] = [];
      let discoveredMemoryEntries: DiscoveredPlaylistMemoryEntry[] = [];

      if (settings.provider === 'openrouter') {
        const modelToUse = settings.openRouterModel || settings.openRouterModelEntries?.[0]?.id || 'stepfun/step-3.5-flash:free';
        const matchedEntry = settings.openRouterModelEntries?.find(e => e.id === modelToUse);
        const keyToUse = matchedEntry?.key || settings.openRouterApiKey;

        const translationResult = await processMangaOcrWithOpenRouter(
          targetPage.originalImageUrl,
          keyToUse,
          modelToUse,
          settings.targetLanguage,
          contextGuidance,
          memoryDirectives
        );
        ocrResults = translationResult.bubbles;
        discoveredMemoryEntries = translationResult.memoryEntries;
      } else {
        const translationResult = await processMangaOcrWithGemini(
          targetPage.originalImageUrl,
          activeApiKey,
          activeModel,
          settings.targetLanguage,
          contextGuidance,
          memoryDirectives,
          settings.customModelName
        );
        ocrResults = translationResult.bubbles;
        discoveredMemoryEntries = translationResult.memoryEntries;
      }

      if (discoveredMemoryEntries.length > 0) {
        try {
          const memoryMerge = await mergePlaylistMemoryEntries(
            contextPlaylist.id,
            discoveredMemoryEntries,
            'ai'
          );
          handleActivePlaylistUpdated({
            ...contextPlaylist,
            memoryEntries: memoryMerge.entries,
            updatedAt: Date.now(),
          });
          if (memoryMerge.addedEntries.length > 0) {
            setRecentMemoryImport({
              playlistId: contextPlaylist.id,
              entries: memoryMerge.addedEntries,
            });
          }
        } catch (memoryError) {
          console.warn('Unable to save discovered playlist memory:', memoryError);
        }
      }

      // 5. Recheck the full page, but retain every existing translation and append only missed text.
      const existingBubbles = targetPage.ocrResults || [];
      const finalBubbles = existingBubbles.length > 0
        ? mergeMissingOcrBubbles(existingBubbles, ocrResults)
        : ocrResults;

      // Save updated result to local cache
      saveOcrToCache(imgHash, finalBubbles, activeModel, cacheContextKey);

      updatePagesWithHistory(prev => prev.map(p => p.id === pageId ? {
        ...p,
        isTranslating: false,
        isTranslated: true,
        ocrResults: finalBubbles,
        originalTextCleanupAt: undefined,
        translationsEmbedded: false,
      } : p));

      // Trigger celebratory confetti
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.8 }
      });

      return true;
    } catch (err: any) {
      console.error('Translation error:', err);
      
      const isQuota = err instanceof GeminiQuotaError || err.isQuotaError || err.status === 503 || err.status === 429 || err.message?.includes('โควตา') || err.message?.includes('429') || err.message?.includes('503') || err.message?.includes('high demand') || err.message?.includes('หนาแน่น');

      setPages(prev => prev.map(p => p.id === pageId ? {
        ...p,
        isTranslating: false,
        errorMessage: err.message || 'การแปลล้มเหลว'
      } : p));

      if (isQuota) {
        setQuotaModalState({
          isOpen: true,
          exhaustedModelId: activeModel,
          errorMessage: err.message || `โมเดล ${activeModel} ถึงขีดจำกัดหรือเซิร์ฟเวอร์หนาแน่นชั่วคราว`,
          failedPageIndex: pageIndex,
          failedPageId: pageId,
          isTranslatingAll: false,
        });
      }

      return false;
    }
  }, [
    settings,
    updatePagesWithHistory,
    resolveActivePlaylistForTranslation,
    requestPlaylistContext,
    handleActivePlaylistUpdated,
  ]);

  // Translate all pages in the chapter sequentially
  const handleTranslateAll = async (modelOverride?: GeminiModelId, apiKeyOverride?: string) => {
    const pagesToTranslate = pagesRef.current;
    if (pagesToTranslate.length === 0) return;

    const contextPlaylist = await resolveActivePlaylistForTranslation();
    if (!contextPlaylist) {
      requestPlaylistContext({ type: 'translate_all' });
      return;
    }

    setIsTranslatingAny(true);

    const activeModel = modelOverride || settings.selectedModel;
    const activeApiKey = apiKeyOverride || settings.apiKey;

    for (let i = 0; i < pagesToTranslate.length; i++) {
      const page = pagesToTranslate[i];
      if (!page.isTranslated) {
        const success = await handleTranslatePage(page.id, activeModel, activeApiKey);
        if (!success) {
          setIsTranslatingAny(false);
          setQuotaModalState(prev => ({
            ...prev,
            isOpen: true,
            exhaustedModelId: activeModel,
            errorMessage: prev.errorMessage || `ระบบหยุดชั่วคราวระหว่างกำลังแปลหน้าที่ ${i + 1}`,
            failedPageIndex: i,
            failedPageId: page.id,
            isTranslatingAll: true,
          }));
          return;
        }
      }
    }

    setIsTranslatingAny(false);
    confetti({
      particleCount: 100,
      spread: 80,
      origin: { y: 0.6 }
    });
  };

  // Resume translation seamlessly after switching model
  const handleResumeAfterQuota = (newModelId: GeminiModelId, newApiKey?: string) => {
    const updatedSettings = {
      ...settings,
      selectedModel: newModelId,
      ...(newApiKey ? { apiKey: newApiKey } : {})
    };
    handleSaveSettings(updatedSettings);

    if (quotaModalState.isTranslatingAll) {
      setTimeout(() => {
        handleTranslateAll(newModelId, newApiKey || settings.apiKey);
      }, 300);
    } else if (quotaModalState.failedPageId) {
      setTimeout(() => {
        handleTranslatePage(quotaModalState.failedPageId, newModelId, newApiKey || settings.apiKey);
      }, 300);
    }
  };

  const insertPages = (newPages: MangaPage[], insertIndex: number) => {
    if (!newPages || newPages.length === 0) return;

    updatePagesWithHistory(prev => {
      const updated = [...prev];
      const safeIndex = Math.max(0, Math.min(updated.length, insertIndex));
      updated.splice(safeIndex, 0, ...newPages);
      return updated.map((p, idx) => ({ ...p, orderIndex: idx + 1 }));
    });
  };

  const runPageTranslationQueue = async (pageIds: string[], forceRefresh = false) => {
    setIsTranslatingAny(true);
    for (const pageId of pageIds) {
      const success = await handleTranslatePage(pageId, undefined, undefined, forceRefresh);
      if (!success) break;
    }
    setIsTranslatingAny(false);
  };

  // Home uploads require an explicit story context; playlist chapter uploads keep their chapter context.
  const handleAddPages = (newPages: MangaPage[], insertIndex: number) => {
    if (!newPages || newPages.length === 0) return;

    if (!activePlaylistContext && !activeContextPlaylistIdRef.current) {
      requestPlaylistContext({ type: 'add_pages', pages: newPages, insertIndex });
      return;
    }

    insertPages(newPages, insertIndex);
  };

  // Apply Crop to a Page
  const handleApplyCrop = async (pageId: string, cropRect: { top: number; left: number; width: number; height: number }) => {
    const pageIndex = pages.findIndex(p => p.id === pageId);
    if (pageIndex === -1) return;

    const targetPage = pages[pageIndex];

    // Save scroll position before state update
    const scrollRoot = document.getElementById('manga-canvas-scroll-root');
    const savedScrollTop = scrollRoot?.scrollTop ?? 0;

    try {
      const cropped = await cropImage(targetPage.originalImageUrl, cropRect);

      updatePagesWithHistory(prev => prev.map(p => {
        if (p.id === pageId) {
          return {
            ...p,
            originalImageUrl: cropped.dataUrl,
            width: cropped.width,
            height: cropped.height,
            isTranslated: false,
            ocrResults: [],
            originalTextCleanupAt: undefined,
            translationsEmbedded: false,
          };
        }
        return p;
      }));

      // Restore scroll position after React re-render
      requestAnimationFrame(() => {
        if (scrollRoot) scrollRoot.scrollTop = savedScrollTop;
      });

    } catch (err) {
      console.error('Failed to crop image:', err);
      alert('เกิดข้อผิดพลาดในการครอบตัดภาพ');
    }
  };

  // Split Image at Cut Line (Scissors Tool)
  const handleSplitPage = async (pageId: string, cutYPx: number) => {
    const pageIndex = pages.findIndex(p => p.id === pageId);
    if (pageIndex === -1) return;

    const targetPage = pages[pageIndex];

    // Save scroll position before state update
    const scrollRoot = document.getElementById('manga-canvas-scroll-root');
    const savedScrollTop = scrollRoot?.scrollTop ?? 0;

    try {
      const { topDataUrl, bottomDataUrl, topHeight, bottomHeight } = await splitImageAtY(
        targetPage.originalImageUrl,
        cutYPx,
        targetPage.width,
        targetPage.height
      );

      const topPageObj: MangaPage = {
        id: `page_${Date.now()}_part1`,
        originalImageUrl: topDataUrl,
        width: targetPage.width,
        height: topHeight,
        isTranslating: false,
        isTranslated: false,
        ocrResults: [],
        orderIndex: targetPage.orderIndex,
      };

      const bottomPageObj: MangaPage = {
        id: `page_${Date.now()}_part2`,
        originalImageUrl: bottomDataUrl,
        width: targetPage.width,
        height: bottomHeight,
        isTranslating: false,
        isTranslated: false,
        ocrResults: [],
        orderIndex: targetPage.orderIndex + 1,
      };

      updatePagesWithHistory(prev => {
        const updated = [...prev];
        updated.splice(pageIndex, 1, topPageObj, bottomPageObj);
        return updated.map((p, idx) => ({ ...p, orderIndex: idx + 1 }));
      });

      // Restore scroll position after React re-render
      requestAnimationFrame(() => {
        if (scrollRoot) scrollRoot.scrollTop = savedScrollTop;
      });
    } catch (err) {
      console.error('Failed to split page:', err);
      alert('เกิดข้อผิดพลาดในการตัดแบ่งท่อนภาพ');
    }
  };

  // Apply Drawing (Eraser / Paintbrush) to a Page
  const handleApplyDrawing = (pageId: string, newImageUrl: string, mode: 'eraser' | 'paint') => {
    const scrollRoot = document.getElementById('manga-canvas-scroll-root');
    const savedScrollTop = scrollRoot?.scrollTop ?? 0;

    updatePagesWithHistory(prev => prev.map(p => {
      if (p.id === pageId) {
        return {
          ...p,
          originalImageUrl: newImageUrl,
          originalTextCleanupAt: Date.now(),
        };
      }
      return p;
    }));

    requestAnimationFrame(() => {
      if (scrollRoot) scrollRoot.scrollTop = savedScrollTop;
    });
  };

  // Inpaint & Embed Translated Text directly into image
  const handleInpaintPage = async (pageId: string) => {
    const targetPage = pages.find(p => p.id === pageId);
    if (!targetPage) return;

    if (!targetPage.ocrResults || targetPage.ocrResults.length === 0) {
      alert('หน้านี้ยังไม่มีข้อความแปล กรุณาแปลหน้านี้ก่อนเพื่อฝังคำแปลลงรูปภาพ');
      return;
    }

    const scrollRoot = document.getElementById('manga-canvas-scroll-root');
    const savedScrollTop = scrollRoot?.scrollTop ?? 0;

    // Set translating loading state
    setPages(prev => prev.map(p => p.id === pageId ? { ...p, isTranslating: true } : p));

    try {
      const inpaintedDataUrl = await inpaintAndEmbedText(targetPage);

      updatePagesWithHistory(prev => prev.map(p => {
        if (p.id === pageId) {
          return {
            ...p,
            originalImageUrl: inpaintedDataUrl,
            isTranslating: false,
            isTranslated: true,
            translationsEmbedded: true,
          };
        }
        return p;
      }));

      requestAnimationFrame(() => {
        if (scrollRoot) scrollRoot.scrollTop = savedScrollTop;
      });
    } catch (err) {
      console.error('Failed to inpaint page:', err);
      alert('เกิดข้อผิดพลาดในการฝังคำแปลลงรูปภาพ');
      setPages(prev => prev.map(p => p.id === pageId ? { ...p, isTranslating: false } : p));
    }
  };

  const handleAutoCleanAndEmbed = async (pageId: string) => {
    const targetPage = pages.find(page => page.id === pageId);
    if (!targetPage) return;
    if (!targetPage.ocrResults.length) {
      alert('หน้านี้ยังไม่มีข้อความแปล กรุณาแปลหน้านี้ก่อน');
      return;
    }
    setPages(prev => prev.map(page => page.id === pageId ? { ...page, isTranslating: true } : page));
    try {
      const cleanedImageUrl = await removeDetectedTextFromImage(targetPage);
      const embeddedImageUrl = await inpaintAndEmbedText({ ...targetPage, originalImageUrl: cleanedImageUrl });
      updatePagesWithHistory(prev => prev.map(page => page.id === pageId ? {
        ...page,
        originalImageUrl: embeddedImageUrl,
        isTranslating: false,
        isTranslated: true,
        translationsEmbedded: true,
      } : page));
    } catch (err) {
      console.error('Failed to remove detected text and embed translation:', err);
      alert(err instanceof Error ? err.message : 'ไม่สามารถลบข้อความตาม OCR และฝังคำแปลได้');
      setPages(prev => prev.map(page => page.id === pageId ? { ...page, isTranslating: false } : page));
    }
  };

  // Cross-Page Seam Bridge & Cut-off Text Resolution
  const handleBridgeAdjacentSeam = async (topPageId: string, bottomPageId: string) => {
    const currentPages = pagesRef.current;
    const topPage = currentPages.find(p => p.id === topPageId);
    const bottomPage = currentPages.find(p => p.id === bottomPageId);
    if (!topPage || !bottomPage) return;

    const contextPlaylist = await resolveActivePlaylistForTranslation();
    if (!contextPlaylist) {
      requestPlaylistContext({ type: 'bridge_seam', topPageId, bottomPageId });
      return;
    }

    setIsTranslatingAny(true);
    try {
      // 1. Stitch vertical boundary slices
      const seamResult = await stitchAdjacentPageSeam(topPage, bottomPage, 420);

      // 2. Resolve genre context & memory directives
      const selectedContext = TRANSLATION_CONTEXTS.find(c => c.id === settings.translationContext);
      const contextGuidance = settings.translationContext === 'custom_context'
        ? settings.customContextPrompt
        : selectedContext?.promptGuidance || '';

      const memoryDirectives = formatPlaylistMemoryDirectives(
        contextPlaylist.memoryEntries || [],
        contextPlaylist.memoryInstructions
      );

      // 3. Run OCR on continuous seam slice
      let seamBubbles: TextBubble[] = [];
      let discoveredMemoryEntries: DiscoveredPlaylistMemoryEntry[] = [];
      if (settings.provider === 'openrouter') {
        const modelToUse = settings.openRouterModel || settings.openRouterModelEntries?.[0]?.id || 'stepfun/step-3.5-flash:free';
        const matchedEntry = settings.openRouterModelEntries?.find(e => e.id === modelToUse);
        const keyToUse = matchedEntry?.key || settings.openRouterApiKey;
        const seamOcrResult = await processMangaOcrWithOpenRouter(
          seamResult.compositeImageUrl,
          keyToUse,
          modelToUse,
          settings.targetLanguage,
          contextGuidance,
          memoryDirectives
        );
        seamBubbles = seamOcrResult.bubbles;
        discoveredMemoryEntries = seamOcrResult.memoryEntries;
      } else {
        const seamOcrResult = await processMangaOcrWithGemini(
          seamResult.compositeImageUrl,
          settings.apiKey,
          settings.selectedModel,
          settings.targetLanguage,
          contextGuidance,
          memoryDirectives,
          settings.customModelName
        );
        seamBubbles = seamOcrResult.bubbles;
        discoveredMemoryEntries = seamOcrResult.memoryEntries;
      }

      if (discoveredMemoryEntries.length > 0) {
        try {
          const memoryMerge = await mergePlaylistMemoryEntries(
            contextPlaylist.id,
            discoveredMemoryEntries,
            'ai'
          );
          handleActivePlaylistUpdated({
            ...contextPlaylist,
            memoryEntries: memoryMerge.entries,
            updatedAt: Date.now(),
          });
        } catch (memoryError) {
          console.warn('Unable to save discovered seam memory:', memoryError);
        }
      }

      // 4. Remap bubbles to both pages & clean split fragments
      const { updatedTopBubbles, updatedBottomBubbles } = remapSeamOcrBubbles(
        seamBubbles,
        topPage,
        bottomPage,
        seamResult
      );

      updatePagesWithHistory(prev => prev.map(p => {
        if (p.id === topPageId) return { ...p, ocrResults: updatedTopBubbles, isTranslated: true };
        if (p.id === bottomPageId) return { ...p, ocrResults: updatedBottomBubbles, isTranslated: true };
        return p;
      }));

      confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
    } catch (err: any) {
      console.error('Seam bridge error:', err);
      alert(`ไม่สามารถแปลรอยต่อภาพได้: ${err.message || err}`);
    } finally {
      setIsTranslatingAny(false);
    }
  };

  // Bridge all consecutive seams in the chapter
  const handleBridgeAllSeams = async () => {
    const currentPages = pagesRef.current;
    if (currentPages.length < 2) return;

    const contextPlaylist = await resolveActivePlaylistForTranslation();
    if (!contextPlaylist) {
      requestPlaylistContext({ type: 'bridge_all' });
      return;
    }

    for (let i = 0; i < currentPages.length - 1; i++) {
      await handleBridgeAdjacentSeam(currentPages[i].id, currentPages[i + 1].id);
    }
  };

  const handleConfirmPlaylistContext = async (playlist: MangaPlaylist) => {
    selectHomePlaylistContext(playlist);
    refreshPlaylistCount();

    const action = pendingPlaylistAction;
    setPendingPlaylistAction(null);
    if (!action) return;

    if (action.type === 'add_pages') {
      insertPages(action.pages, action.insertIndex);
      return;
    }

    window.setTimeout(() => {
      if (action.type === 'translate_pages') {
        void runPageTranslationQueue(action.pageIds, action.forceRefresh);
      } else if (action.type === 'translate_all') {
        void handleTranslateAll();
      } else if (action.type === 'bridge_seam') {
        void handleBridgeAdjacentSeam(action.topPageId, action.bottomPageId);
      } else if (action.type === 'bridge_all') {
        void handleBridgeAllSeams();
      }
    }, 0);
  };

  // Live update bubble during dragging/resizing (No history spam)
  const handleUpdateBubbleLive = (pageId: string, updatedBubble: TextBubble) => {
    setPages(prev => {
      const nextPages = prev.map(p => {
      if (p.id === pageId) {
        return {
          ...p,
          ocrResults: p.ocrResults.map(b => b.id === updatedBubble.id ? updatedBubble : b)
        };
      }
      return p;
      });
      pagesRef.current = nextPages;
      return nextPages;
    });
  };

  // Commit bubble changes to History (Undo/Redo snapshot)
  const handleCommitBubble = (pageId: string, updatedBubble: TextBubble) => {
    updatePagesWithHistory(prev => prev.map(p => {
      if (p.id === pageId) {
        return {
          ...p,
          ocrResults: p.ocrResults.map(b => b.id === updatedBubble.id ? updatedBubble : b)
        };
      }
      return p;
    }));
  };

  // Delete a page immediately (undoable with Ctrl+Z)
  const handleDeletePage = (pageId: string) => {
    updatePagesWithHistory(prev => {
      const filtered = prev.filter(p => p.id !== pageId);
      return filtered.map((p, idx) => ({ ...p, orderIndex: idx + 1 }));
    });
  };

  // Move page up or down
  const handleMovePage = (pageId: string, direction: 'up' | 'down') => {
    updatePagesWithHistory(prev => {
      const idx = prev.findIndex(p => p.id === pageId);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;

      const newPages = [...prev];
      const temp = newPages[idx];
      newPages[idx] = newPages[targetIdx];
      newPages[targetIdx] = temp;

      return newPages.map((p, i) => ({ ...p, orderIndex: i + 1 }));
    });
  };

  // Select bubble (Keep scroll position 100% steady without forced scrolling)
  const handleSelectBubble = (pageId: string, bubbleId: string) => {
    setActiveBubbleId(bubbleId || null);
  };

  // Scroll to page
  const handleScrollToPage = (pageId: string) => {
    const elem = document.getElementById(`manga-page-${pageId}`);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Load demo pages (only if user explicitly clicks load demo button)
  const handleLoadDemo = () => {
    updatePagesWithHistory(SAMPLE_PAGES);
    setActiveBubbleId('p1_b3');
  };

  // Clear all pages and wipe IndexedDB storage
  const handleClearAll = () => {
    updatePagesWithHistory([]);
    clearSavedPagesStorage();
    setActiveBubbleId(null);
    setActiveChapterTitle('');
  };

  const translatedCount = pages.filter(p => p.isTranslated).length;

  return (
    <div className="app-container">
      {/* Top Navigation Bar */}
      <Header
        provider={settings.provider || 'gemini'}
        onSelectProvider={(p) => {
          setSettings(prev => {
            const next = { ...prev, provider: p };
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
            return next;
          });
        }}
        selectedModel={settings.selectedModel}
        customModelName={settings.customModelName}
        onSelectModel={handleSelectModel}
        openRouterModel={settings.openRouterModel}
        openRouterModelEntries={settings.openRouterModelEntries || []}
        onSelectOpenRouterModel={(mId) => {
          setSettings(prev => {
            const matched = prev.openRouterModelEntries?.find(e => e.id === mId);
            const next = {
              ...prev,
              openRouterModel: mId,
              openRouterApiKey: matched?.key || prev.openRouterApiKey
            };
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
            return next;
          });
        }}
        openRouterApiKey={settings.openRouterApiKey}
        viewMode={viewMode}
        onSetViewMode={setViewMode}
        onTranslateAll={() => handleTranslateAll()}
        isTranslatingAny={isTranslatingAny}
        apiKey={settings.apiKey}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenPlaylist={() => setIsPlaylistModalOpen(true)}
        onOpenSaveToPlaylist={() => setIsSaveToPlaylistModalOpen(true)}
        onGoToHome={handleGoToHome}
        isInPlaylistMode={Boolean(activePlaylistContext)}
        activeChapterTitle={activePlaylistContext?.chapterTitle || activeChapterTitle}
        playlistCount={playlistCount}
        totalPages={pages.length}
        translatedCount={translatedCount}
      />

      {/* Main Workspace */}
      <div className="main-workspace">
        {/* Left Toolbar */}
        <SidebarControls
          onAddPage={() => {
            const input = document.getElementById('global-manga-file-input') as HTMLInputElement;
            if (input) {
              input.value = '';
              input.click();
            }
          }}
          zoomScale={zoomScale}
          onSetZoomScale={setZoomScale}
          totalPages={pages.length}
          onLoadDemo={handleLoadDemo}
          onClearAll={handleClearAll}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onBridgeAllSeams={handleBridgeAllSeams}
          canvasTool={canvasTool}
          onSetCanvasTool={setCanvasTool}
        />

        <PlaylistMemoryPanel
          playlist={activeContextPlaylist}
          isPlaylistChapter={Boolean(activePlaylistContext)}
          onOpenPlaylistContext={() => requestPlaylistContext(null)}
          onPlaylistUpdated={handleActivePlaylistUpdated}
          onExtractFromInstructions={handleExtractPlaylistMemoryFromInstructions}
          onExtractFromTranslations={handleExtractPlaylistMemoryFromTranslations}
          hasTranslatedPages={pages.some(p => p.isTranslated && p.ocrResults.length > 0)}
          recentAiImport={recentMemoryImport && recentMemoryImport.playlistId === activeContextPlaylist?.id ? recentMemoryImport.entries : []}
        />

        {/* Center Continuous Manga Canvas */}
        <MangaCanvas
          pages={pages}
          viewMode={viewMode}
          settings={settings}
          activeBubbleId={activeBubbleId}
          onSelectBubble={handleSelectBubble}
          onDeselectAll={() => setActiveBubbleId(null)}
          onUpdateBubble={handleUpdateBubbleLive}
          onCommitBubble={handleCommitBubble}
          onDeleteBubble={(pageId, bubbleId) => {
            updatePagesWithHistory(prev => prev.map(p => {
              if (p.id === pageId) {
                return {
                  ...p,
                  ocrResults: normalizeBubbleReadingOrder(p.ocrResults.filter(b => b.id !== bubbleId))
                };
              }
              return p;
            }));
          }}
          onAddBubble={(pageId, newBubble) => {
            updatePagesWithHistory(prev => prev.map(p => {
              if (p.id === pageId) {
                return {
                  ...p,
                  ocrResults: normalizeBubbleReadingOrder([...p.ocrResults, newBubble])
                };
              }
              return p;
            }));
            setActiveBubbleId(newBubble.id);
          }}
          onAddBubbleLive={(pageId, newBubble) => {
            setPages(prev => {
              const nextPages = prev.map(p => {
                if (p.id !== pageId) return p;
                return {
                  ...p,
                  ocrResults: normalizeBubbleReadingOrder([...p.ocrResults, newBubble])
                };
              });
              pagesRef.current = nextPages;
              return nextPages;
            });
            setActiveBubbleId(newBubble.id);
          }}
          onTranslatePage={handleTranslatePage}
          onDeletePage={handleDeletePage}
          onMovePage={handleMovePage}
          onAddPages={handleAddPages}
          onApplyCrop={handleApplyCrop}
          onSplitPage={handleSplitPage}
          onApplyDrawing={handleApplyDrawing}
          onInpaintPage={handleInpaintPage}
          onAutoCleanAndEmbed={handleAutoCleanAndEmbed}
          onBridgeAdjacentSeam={handleBridgeAdjacentSeam}
          canvasTool={canvasTool}
          onSetCanvasTool={setCanvasTool}
          zoomScale={zoomScale}
        />

        {/* Right Synchronized Subtitle Timeline Stream */}
        <SubtitleStream
          pages={pages}
          activeBubbleId={activeBubbleId}
          onSelectBubble={handleSelectBubble}
          onScrollToPage={handleScrollToPage}
          onUpdateBubble={handleCommitBubble}
          preferredVoiceName={settings.selectedVoiceName}
        />
      </div>

      {/* Playlist Library Modal */}
      <PlaylistModal
        isOpen={isPlaylistModalOpen}
        onClose={() => {
          setIsPlaylistModalOpen(false);
          refreshPlaylistCount();
        }}
        onLoadChapter={handleLoadChapter}
      />

      <PlaylistContextModal
        isOpen={isPlaylistContextModalOpen}
        selectedPlaylistId={activeContextPlaylistId}
        onClose={() => {
          setIsPlaylistContextModalOpen(false);
          setPendingPlaylistAction(null);
        }}
        onConfirm={handleConfirmPlaylistContext}
      />

      {/* Save to Playlist Modal */}
      <SaveToPlaylistModal
        isOpen={isSaveToPlaylistModalOpen}
        onClose={() => {
          setIsSaveToPlaylistModalOpen(false);
          refreshPlaylistCount();
        }}
        pages={pages}
        onPlaylistSaved={() => {
          refreshPlaylistCount();
        }}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        activePlaylistName={activeContextPlaylist?.name}
        onSaveSettings={handleSaveSettings}
        onOpenBackup={() => setIsBackupOpen(true)}
      />

      {/* Full Backup & Restore Modal */}
      <BackupModal
        isOpen={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
        currentSettings={settings}
        onSettingsRestored={(newSettings) => {
          setSettings(newSettings);
          localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
        }}
        onDataRestored={() => {
          refreshPlaylistCount();
        }}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        pages={pages}
      />

      {/* Smart Quota Fallback & Model Switcher Modal */}
      <QuotaFallbackModal
        isOpen={quotaModalState.isOpen}
        onClose={() => setQuotaModalState(prev => ({ ...prev, isOpen: false }))}
        exhaustedModelId={quotaModalState.exhaustedModelId}
        errorMessage={quotaModalState.errorMessage}
        failedPageIndex={quotaModalState.failedPageIndex}
        totalPages={pages.length}
        currentApiKey={settings.apiKey}
        onResumeTranslation={handleResumeAfterQuota}
      />
    </div>
  );
};
