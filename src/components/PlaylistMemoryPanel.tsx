import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Brain,
  Check,
  Edit3,
  FileText,
  FolderOpen,
  Plus,
  Save,
  Search,
  Share2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { MangaPlaylist, PlaylistMemoryCategory, PlaylistMemoryEntry } from '../types';
import {
  deletePlaylistMemoryEntry,
  getPlaylistById,
  PlaylistMemoryEntryInput,
  savePlaylistMemoryEntry,
  savePlaylistMemoryInstructions,
} from '../services/playlistStorageService';
import { SharePlaylistMemoryModal } from './SharePlaylistMemoryModal';

interface PlaylistMemoryPanelProps {
  playlist: MangaPlaylist | null;
  isPlaylistChapter: boolean;
  onOpenPlaylistContext: () => void;
  onPlaylistUpdated: (playlist: MangaPlaylist) => void;
  recentAiImport: PlaylistMemoryEntry[];
  onExtractFromInstructions: () => Promise<{
    addedCount: number;
    skippedCount: number;
    analyzedWithAi: boolean;
    warning?: string;
  }>;
  onExtractFromTranslations: () => Promise<{
    addedCount: number;
    skippedCount: number;
    analyzedWithAi: boolean;
    warning?: string;
  }>;
  hasTranslatedPages: boolean;
}

const CATEGORIES: Array<{ value: PlaylistMemoryCategory; label: string }> = [
  { value: 'character', label: 'ตัวละคร' },
  { value: 'organization', label: 'องค์กร' },
  { value: 'university', label: 'มหาวิทยาลัย' },
  { value: 'school', label: 'โรงเรียน' },
  { value: 'pronoun', label: 'สรรพนาม/ตำแหน่ง' },
  { value: 'power_rank', label: 'ระดับพลัง' },
  { value: 'skill', label: 'สกิล/วิชา' },
  { value: 'character_level', label: 'เลเวลตัวละคร' },
  { value: 'location', label: 'สถานที่ (ประเทศ/เมือง)' },
  { value: 'item', label: 'ไอเทม' },
  { value: 'other', label: 'อื่น ๆ' },
];

const EMPTY_DRAFT: PlaylistMemoryEntryInput = {
  sourceName: '',
  thaiName: '',
  category: 'character',
  notes: '',
  source: 'user',
};

interface InlineEditDraft {
  id: string;
  sourceName: string;
  thaiName: string;
  focusField: 'sourceName' | 'thaiName';
}

interface SelectionBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

function categoryLabel(category: PlaylistMemoryCategory): string {
  return CATEGORIES.find(item => item.value === category)?.label || 'อื่น ๆ';
}

function sourceLabel(source: PlaylistMemoryEntry['source']): string {
  if (source === 'ai') return 'AI';
  if (source === 'shared') return 'แชร์';
  return 'เพิ่มเอง';
}

function recentEntryClass(entry: PlaylistMemoryEntry, now: number): string {
  const age = now - entry.createdAt;
  if (age >= 0 && age < 30 * 60 * 1000) return 'is-recent-new';
  if (age < 90 * 60 * 1000) return 'is-recent-warm';
  return '';
}

export const PlaylistMemoryPanel: React.FC<PlaylistMemoryPanelProps> = ({
  playlist,
  isPlaylistChapter,
  onOpenPlaylistContext,
  onPlaylistUpdated,
  recentAiImport,
  onExtractFromInstructions,
  onExtractFromTranslations,
  hasTranslatedPages,
}) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | PlaylistMemoryCategory>('all');
  const [draft, setDraft] = useState<PlaylistMemoryEntryInput | null>(null);
  const [inlineEdit, setInlineEdit] = useState<InlineEditDraft | null>(null);
  const inlineEditorRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isCompactOpen, setIsCompactOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const handleMobileClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsCompactOpen(false);
      setIsClosing(false);
    }, 240);
  };
  const [isInstructionEditorOpen, setIsInstructionEditorOpen] = useState(false);
  const [instructionDraft, setInstructionDraft] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isExtractingTranslations, setIsExtractingTranslations] = useState(false);
  const [extractionMessage, setExtractionMessage] = useState('');
  const [translationExtractionMessage, setTranslationExtractionMessage] = useState('');
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<Set<string>>(new Set());
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const memoryPanelRef = useRef<HTMLElement>(null);
  const memoryListRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    additive: boolean;
    dragging: boolean;
  } | null>(null);
  const suppressEntryClickRef = useRef(false);
  const memoryPanelActiveRef = useRef(false);
  const memoryPointerInsideRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setSearch('');
    setCategory('all');
    setDraft(null);
    setInlineEdit(null);
    setError('');
    setIsInstructionEditorOpen(false);
    setInstructionDraft(playlist?.memoryInstructions || '');
    setExtractionMessage('');
    setTranslationExtractionMessage('');
    setSelectedMemoryIds(new Set());
    setSelectionBox(null);
    memoryPanelActiveRef.current = false;
    memoryPointerInsideRef.current = false;
  }, [playlist?.id]);

  const entries = [...(playlist?.memoryEntries || [])]
    .sort((left, right) => left.category.localeCompare(right.category) || left.sourceName.localeCompare(right.sourceName));
  const query = search.trim().toLocaleLowerCase();
  const visibleEntries = entries.filter((entry) => {
    const categoryMatches = category === 'all' || entry.category === category;
    const textMatches = !query || [entry.sourceName, entry.thaiName, entry.notes || '']
      .some(value => value.toLocaleLowerCase().includes(query));
    return categoryMatches && textMatches;
  });

  useEffect(() => {
    const validIds = new Set(entries.map(entry => entry.id));
    setSelectedMemoryIds(current => {
      const next = new Set([...current].filter(id => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [playlist?.memoryEntries]);

  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('.playlist-memory-entry') || target?.closest('.playlist-memory-selection-actions')) return;
      setSelectedMemoryIds(new Set());
      setSelectionBox(null);
      memoryPanelActiveRef.current = false;
    };

    window.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => window.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, []);

  useEffect(() => {
    const isTextInput = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA' || element?.tagName === 'SELECT' || element?.isContentEditable;
    };

    const handleKeyboardSelection = (event: KeyboardEvent) => {
      if (isTextInput(event.target) || (!memoryPanelActiveRef.current && !memoryPointerInsideRef.current)) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        event.stopPropagation();
        setSelectedMemoryIds(new Set(visibleEntries.map(entry => entry.id)));
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedMemoryIds.size > 0) {
        event.preventDefault();
        event.stopPropagation();
        void handleDeleteSelected();
      }
    };

    window.addEventListener('keydown', handleKeyboardSelection, true);
    return () => window.removeEventListener('keydown', handleKeyboardSelection, true);
  }, [selectedMemoryIds, visibleEntries]);

  const refreshPlaylist = async () => {
    if (!playlist) return;
    const updated = await getPlaylistById(playlist.id);
    if (updated) onPlaylistUpdated(updated);
  };

  const handleSave = async () => {
    if (!playlist || !draft) return;

    setIsSaving(true);
    setError('');
    try {
      await savePlaylistMemoryEntry(playlist.id, draft);
      await refreshPlaylist();
      setDraft(null);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถบันทึกข้อมูลได้');
    } finally {
      setIsSaving(false);
    }
  };

  const startInlineEdit = (entry: PlaylistMemoryEntry, focusField: InlineEditDraft['focusField']) => {
    setDraft(null);
    setError('');
    setInlineEdit({
      id: entry.id,
      sourceName: entry.sourceName,
      thaiName: entry.thaiName,
      focusField,
    });
  };

  const saveInlineEdit = useCallback(async () => {
    if (!playlist || !inlineEdit || isSaving) return;
    const entry = entries.find(item => item.id === inlineEdit.id);
    if (!entry) {
      setInlineEdit(null);
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      await savePlaylistMemoryEntry(playlist.id, {
        ...entry,
        sourceName: inlineEdit.sourceName,
        thaiName: inlineEdit.thaiName,
      });
      await refreshPlaylist();
      setInlineEdit(null);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถบันทึกชื่อคำศัพท์ได้');
    } finally {
      setIsSaving(false);
    }
  }, [entries, inlineEdit, isSaving, playlist]);

  const handleInlineEditKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setInlineEdit(null);
      return;
    }

    if (event.key !== 'Enter') return;
    event.preventDefault();
    await saveInlineEdit();
  };

  useEffect(() => {
    if (!inlineEdit) return;

    const handleClickAway = (event: MouseEvent) => {
      if (!inlineEditorRef.current?.contains(event.target as Node)) {
        void saveInlineEdit();
      }
    };

    window.addEventListener('mousedown', handleClickAway);
    return () => window.removeEventListener('mousedown', handleClickAway);
  }, [inlineEdit, saveInlineEdit]);

  const handleDelete = async (entry: PlaylistMemoryEntry) => {
    if (!playlist || !confirm(`ลบ "${entry.sourceName}" ออกจากความจำของ ${playlist.name} หรือไม่?`)) return;

    setError('');
    try {
      await deletePlaylistMemoryEntry(playlist.id, entry.id);
      await refreshPlaylist();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถลบข้อมูลได้');
    }
  };

  const handleDeleteSelected = async () => {
    if (!playlist || selectedMemoryIds.size === 0) return;
    const selectedEntries = entries.filter(entry => selectedMemoryIds.has(entry.id));
    if (selectedEntries.length === 0) return;
    if (!confirm(`ลบข้อมูลความจำที่เลือก ${selectedEntries.length} รายการออกจาก ${playlist.name} หรือไม่?`)) return;

    setIsSaving(true);
    setError('');
    try {
      for (const entry of selectedEntries) {
        await deletePlaylistMemoryEntry(playlist.id, entry.id);
      }
      setSelectedMemoryIds(new Set());
      await refreshPlaylist();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถลบข้อมูลที่เลือกได้');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMemoryListPointerDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    suppressEntryClickRef.current = false;
    memoryPanelActiveRef.current = true;
    memoryPointerInsideRef.current = true;
    const target = event.target as HTMLElement;
    const entry = target.closest('.playlist-memory-entry');
    if (target.closest('button, input, textarea, select')) return;
    if (!entry) setSelectedMemoryIds(new Set());

    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      additive: event.ctrlKey || event.metaKey,
      dragging: false,
    };
  };

  const updateDragPosition = (clientX: number, clientY: number) => {
    const drag = dragRef.current;
    const list = memoryListRef.current;
    if (!drag || !list) return;

    drag.currentX = clientX;
    drag.currentY = clientY;
    const moved = Math.hypot(clientX - drag.startX, clientY - drag.startY);
    if (moved < 4) return;
    drag.dragging = true;
    suppressEntryClickRef.current = true;
    const listRect = list.getBoundingClientRect();
    if (clientY < listRect.top + 24) list.scrollTop -= 20;
    if (clientY > listRect.bottom - 24) list.scrollTop += 20;
    setSelectionBox({
      left: Math.min(drag.startX, clientX) - listRect.left + list.scrollLeft,
      top: Math.min(drag.startY, clientY) - listRect.top + list.scrollTop,
      width: Math.abs(clientX - drag.startX),
      height: Math.abs(clientY - drag.startY),
    });
    updateSelectionFromDrag(drag, clientX, clientY);
  };

  const handleMemoryListPointerMove = (event: React.MouseEvent<HTMLDivElement>) => {
    updateDragPosition(event.clientX, event.clientY);
  };

  const updateSelectionFromDrag = (drag: NonNullable<typeof dragRef.current>, endX: number, endY: number) => {
    const list = memoryListRef.current;
    if (!list) return;
    const selectionRect = {
      left: Math.min(drag.startX, endX),
      right: Math.max(drag.startX, endX),
      top: Math.min(drag.startY, endY),
      bottom: Math.max(drag.startY, endY),
    };
    const selectedInBox = [...list.querySelectorAll<HTMLElement>('[data-memory-entry-id]')]
      .filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.right >= selectionRect.left && rect.left <= selectionRect.right
          && rect.bottom >= selectionRect.top && rect.top <= selectionRect.bottom;
      })
      .map(element => element.dataset.memoryEntryId)
      .filter((id): id is string => Boolean(id));
    setSelectedMemoryIds(current => {
      const next = drag.additive ? new Set(current) : new Set<string>();
      selectedInBox.forEach(id => next.add(id));
      return next;
    });
  };

  const finalizeMemoryDrag = (clientX: number, clientY: number) => {
    const drag = dragRef.current;
    const list = memoryListRef.current;
    if (!drag || !list) return;

    if (drag.dragging) {
      updateSelectionFromDrag(drag, clientX, clientY);
    }

    dragRef.current = null;
    setSelectionBox(null);
    suppressEntryClickRef.current = true;
  };

  const handleMemoryListPointerUp = (event: React.MouseEvent<HTMLDivElement>) => {
    finalizeMemoryDrag(event.clientX, event.clientY);
  };

  const handleMemoryListWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag?.dragging) return;
    event.preventDefault();
    drag.currentY = Math.max(0, Math.min(window.innerHeight, drag.currentY + event.deltaY));
    memoryListRef.current?.scrollBy({ top: event.deltaY, behavior: 'auto' });
    updateSelectionFromDrag(drag, drag.currentX, drag.currentY);
  };

  useEffect(() => {
    const handleWindowMouseMove = (event: MouseEvent) => {
      if (dragRef.current) updateDragPosition(event.clientX, event.clientY);
    };
    const handleWindowMouseUp = (event: MouseEvent) => {
      if (dragRef.current) finalizeMemoryDrag(event.clientX, event.clientY);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, []);

  const handleEntryClick = (event: React.MouseEvent, entryId: string) => {
    if (suppressEntryClickRef.current) return;
    memoryPanelActiveRef.current = true;
    (event.currentTarget as HTMLElement).focus();
    const additive = event.ctrlKey || event.metaKey;
    setSelectedMemoryIds(current => {
      if (!additive) return new Set([entryId]);
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  const handleSaveInstructions = async () => {
    if (!playlist) return;

    setIsSaving(true);
    setError('');
    try {
      await savePlaylistMemoryInstructions(playlist.id, instructionDraft);
      await refreshPlaylist();
      setIsInstructionEditorOpen(false);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถบันทึกบริบทของเรื่องได้');
    } finally {
      setIsSaving(false);
    }
  };

  const instructionText = playlist?.memoryInstructions?.trim() || '';
  const instructionLineCount = instructionText ? instructionText.split(/\r?\n/).filter(line => line.trim()).length : 0;
  const instructionWordCount = instructionText ? instructionText.split(/\s+/).filter(Boolean).length : 0;

  const handleExtractInstructions = async () => {
    setIsExtracting(true);
    setError('');
    setExtractionMessage('');
    try {
      const result = await onExtractFromInstructions();
      const aiStatus = result.analyzedWithAi ? 'AI วิเคราะห์แล้ว' : 'ดึง mapping ที่พิมพ์ไว้แล้ว';
      const warning = result.warning ? ` (${result.warning})` : '';
      setExtractionMessage(`${aiStatus}: เพิ่ม ${result.addedCount} · ข้ามชื่อซ้ำ ${result.skippedCount}${warning}`);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถดึงชื่อจากบริบทได้');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleExtractTranslations = async () => {
    setIsExtractingTranslations(true);
    setError('');
    setTranslationExtractionMessage('');
    try {
      const result = await onExtractFromTranslations();
      const warning = result.warning ? ` (${result.warning})` : '';
      setTranslationExtractionMessage(`AI วิเคราะห์คำแปลแล้ว: เพิ่ม ${result.addedCount} · ข้ามชื่อซ้ำ ${result.skippedCount}${warning}`);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถดึงชื่อจากคำแปลได้');
    } finally {
      setIsExtractingTranslations(false);
    }
  };

  return (
    <>
      {(isCompactOpen || isClosing) && (
        <div 
          className={`playlist-memory-backdrop ${isClosing ? 'is-closing' : ''}`}
          onClick={handleMobileClose}
        />
      )}
      <button
        type="button"
        className={`playlist-memory-mobile-launcher ${(isCompactOpen || isClosing) ? 'is-hidden' : ''}`}
        onClick={() => {
          setIsClosing(false);
          setIsCompactOpen(true);
        }}
        title="เปิดบริบทและชื่อเรื่อง"
      >
        <Brain size={18} />
      </button>

    <aside className={`playlist-memory-panel ${(isCompactOpen && !isClosing) ? 'mobile-open' : ''} ${isClosing ? 'is-closing' : ''}`}>
      <div className="playlist-memory-header">
        <div className="playlist-memory-title">
          <Brain size={18} color="var(--accent-pink)" />
          <span>บริบท & ชื่อเรื่อง</span>
          <span className="subtitle-count-badge">{entries.length}</span>
        </div>
        {!isPlaylistChapter && (
          <button className="btn-icon memory-header-icon" type="button" onClick={onOpenPlaylistContext} title="เลือก Playlist สำหรับบริบทการแปล">
            <FolderOpen size={15} />
          </button>
        )}
        <button className="btn-icon memory-mobile-close" type="button" onClick={handleMobileClose} title="ปิดแผงบริบท">
          <X size={15} />
        </button>
      </div>

      {!playlist ? (
        <div className="playlist-memory-empty">
          <BookOpen size={38} strokeWidth={1.4} />
          <strong>ยังไม่ได้เลือก Playlist</strong>
          <span>เลือกเรื่องก่อนเริ่มแปล เพื่อให้ AI ใช้ข้อมูลเฉพาะเรื่องนั้น</span>
          {!isPlaylistChapter && (
            <button type="button" className="btn-primary" onClick={onOpenPlaylistContext}>
              <FolderOpen size={15} /> เลือก Playlist
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="playlist-memory-context">
            <div style={{ minWidth: 0 }}>
              <span className="playlist-memory-context-label">กำลังใช้บริบท</span>
              <strong title={playlist.name}>{playlist.name}</strong>
            </div>
            {!isPlaylistChapter && (
              <button type="button" className="btn-secondary memory-change-context" onClick={onOpenPlaylistContext} title="เปลี่ยน Playlist สำหรับการแปลครั้งถัดไป">
                เปลี่ยน
              </button>
            )}
          </div>

          <div className="playlist-memory-instructions">
            <div className="playlist-memory-instructions-header">
              <span><FileText size={14} /> คำสั่งบริบทของเรื่อง</span>
              <button
                type="button"
                className="btn-icon"
                onClick={() => {
                  setInstructionDraft(playlist.memoryInstructions || '');
                  setIsInstructionEditorOpen(true);
                }}
                title="เปิดหน้าต่างเพื่อดูและแก้ไขคำสั่งบริบททั้งหมด"
              >
                <Edit3 size={14} />
              </button>
            </div>
            <div className={`playlist-memory-instruction-summary ${instructionText ? 'has-content' : ''}`}>
              {instructionText
                ? <><strong>บันทึกบริบทแล้ว</strong><span>{instructionLineCount} บรรทัด · {instructionWordCount} คำ · {instructionText.length.toLocaleString()} ตัวอักษร</span></>
                : <span>ยังไม่มีคำสั่งบริบทเพิ่มเติม</span>}
            </div>
          </div>

          <div className="playlist-memory-extract">
            <div className="playlist-memory-extract-buttons">
              <button
                type="button"
                className="btn-secondary memory-extract-button"
                onClick={handleExtractInstructions}
                disabled={isExtracting || isExtractingTranslations || !playlist.memoryInstructions?.trim()}
                title="ให้ AI คัดเฉพาะชื่อ ตัวละคร สกิล องค์กร และคำศัพท์ที่จำเป็นจากบริบท"
              >
                <Sparkles size={14} /> {isExtracting ? 'AI กำลังดึง...' : 'ดึงจากบริบท'}
              </button>
              <button
                type="button"
                className="btn-secondary memory-extract-button memory-extract-translations"
                onClick={handleExtractTranslations}
                disabled={isExtractingTranslations || isExtracting || !hasTranslatedPages}
                title="ให้ AI ดึงชื่อตัวละคร สถานที่ องค์กร นามสกุล และคำศัพท์จากคำแปลฝั่งขวา"
              >
                <BookOpen size={14} /> {isExtractingTranslations ? 'AI กำลังดึง...' : 'ดึงจากคำแปล'}
              </button>
            </div>
            {extractionMessage && <p>{extractionMessage}</p>}
            {translationExtractionMessage && <p>{translationExtractionMessage}</p>}
          </div>

          <div className="playlist-memory-controls">
            <label className="playlist-memory-search">
              <Search size={14} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อ..." />
            </label>
            <select value={category} onChange={(event) => setCategory(event.target.value as 'all' | PlaylistMemoryCategory)}>
              <option value="all">ทุกหมวด</option>
              {CATEGORIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>

          <div className="playlist-memory-actions">
            <button type="button" className="btn-primary memory-action-button" onClick={() => { setDraft(EMPTY_DRAFT); setError(''); }}>
              <Plus size={15} /> เพิ่มชื่อ/คำศัพท์
            </button>
            <button type="button" className="btn-secondary memory-share-button" onClick={() => setIsShareOpen(true)} title="แชร์ความจำของเรื่องนี้ไปยัง Playlist อื่น">
              <Share2 size={15} /> แชร์
            </button>
            {selectedMemoryIds.size > 0 && (
              <div className="playlist-memory-selection-actions">
                <span>{selectedMemoryIds.size} รายการที่เลือก</span>
                <button type="button" className="btn-icon delete-memory-button" onClick={() => void handleDeleteSelected()} title="ลบรายการที่เลือก">
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>

          {recentAiImport.length > 0 && (
            <div className="playlist-memory-import-notice" role="status">
              <Check size={15} />
              <span>AI นำเข้าความจำใหม่ {recentAiImport.length} รายการ: {recentAiImport.map(entry => entry.sourceName).join(', ')}</span>
            </div>
          )}

          {draft && (
            <div className="playlist-memory-editor">
              <div className="playlist-memory-editor-title">
                <strong>{draft.id ? 'แก้ไขข้อมูลความจำ' : 'เพิ่มข้อมูลความจำ'}</strong>
                <button type="button" className="btn-icon" onClick={() => setDraft(null)} title="ยกเลิก"><X size={14} /></button>
              </div>
              <label>ชื่ออังกฤษ / ชื่อต้นฉบับ
                <input value={draft.sourceName} onChange={(event) => setDraft(current => current ? { ...current, sourceName: event.target.value } : current)} placeholder="เช่น Sung Jinwoo" />
              </label>
              <label>ชื่อภาษาไทย
                <input value={draft.thaiName} onChange={(event) => setDraft(current => current ? { ...current, thaiName: event.target.value } : current)} placeholder="เช่น ซองจินอู" />
              </label>
              <label>หมวด
                <select value={draft.category} onChange={(event) => setDraft(current => current ? { ...current, category: event.target.value as PlaylistMemoryCategory } : current)}>
                  {CATEGORIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label>หมายเหตุ
                <textarea value={draft.notes || ''} onChange={(event) => setDraft(current => current ? { ...current, notes: event.target.value } : current)} placeholder="บริบทหรือคำอธิบายเพิ่มเติม" rows={2} />
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '7px', marginTop: '4px' }}>
                <button type="button" className="btn-secondary" onClick={() => setDraft(null)}>ยกเลิก</button>
                <button type="button" className="btn-primary" onClick={handleSave} disabled={isSaving}>
                  <Save size={14} /> {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </div>
          )}

          {error && <div className="playlist-memory-error">{error}</div>}

          <div
            ref={memoryListRef}
            className="playlist-memory-list"
            onMouseDown={handleMemoryListPointerDown}
            onMouseMove={handleMemoryListPointerMove}
            onMouseUp={handleMemoryListPointerUp}
            onMouseEnter={() => { memoryPointerInsideRef.current = true; }}
            onMouseLeave={() => { memoryPointerInsideRef.current = false; }}
            onWheel={handleMemoryListWheel}
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setSelectedMemoryIds(new Set());
                memoryPanelActiveRef.current = true;
              }
            }}
          >
            {selectionBox && (
              <div
                className="playlist-memory-selection-box"
                style={{
                  left: selectionBox.left,
                  top: selectionBox.top,
                  width: selectionBox.width,
                  height: selectionBox.height,
                }}
              />
            )}
            {visibleEntries.length === 0 ? (
              <div className="playlist-memory-empty-list">{entries.length === 0 ? 'ยังไม่มีชื่อหรือคำศัพท์ในเรื่องนี้' : 'ไม่พบข้อมูลที่ตรงกับตัวกรอง'}</div>
            ) : visibleEntries.map((entry) => (
              <article
                key={entry.id}
                data-memory-entry-id={entry.id}
                tabIndex={0}
                className={`playlist-memory-entry ${recentEntryClass(entry, currentTime)} ${selectedMemoryIds.has(entry.id) ? 'is-selected' : ''}`}
                onClick={(event) => handleEntryClick(event, entry.id)}
                onFocus={() => { memoryPanelActiveRef.current = true; }}
                onDoubleClick={() => startInlineEdit(entry, 'sourceName')}
                title="ดับเบิลคลิกที่แถวเพื่อแก้ไขชื่อ แล้วคลิกที่อื่นหรือกด Enter เพื่อบันทึก"
              >
                <div className="playlist-memory-entry-top">
                  <span className="playlist-memory-category">{categoryLabel(entry.category)}</span>
                  <span className="playlist-memory-source">{sourceLabel(entry.source)}</span>
                </div>
                {inlineEdit?.id === entry.id ? (
                  <div className="playlist-memory-inline-editor" ref={inlineEditorRef}>
                    <input
                      autoFocus={inlineEdit.focusField === 'sourceName'}
                      aria-label="ชื่ออังกฤษหรือชื่อต้นฉบับ"
                      value={inlineEdit.sourceName}
                      onChange={(event) => setInlineEdit(current => current ? { ...current, sourceName: event.target.value } : current)}
                      onKeyDown={handleInlineEditKeyDown}
                    />
                    <span>→</span>
                    <input
                      autoFocus={inlineEdit.focusField === 'thaiName'}
                      aria-label="ชื่อภาษาไทย"
                      value={inlineEdit.thaiName}
                      onChange={(event) => setInlineEdit(current => current ? { ...current, thaiName: event.target.value } : current)}
                      onKeyDown={handleInlineEditKeyDown}
                    />
                  </div>
                ) : (
                  <div className="playlist-memory-names">
                    <strong>{entry.sourceName}</strong>
                    <span>→</span>
                    <strong>{entry.thaiName}</strong>
                  </div>
                )}
                {entry.notes && <p>{entry.notes}</p>}
                <div className="playlist-memory-entry-actions">
                  <button type="button" className="btn-icon" onClick={() => { setDraft({ ...entry }); setError(''); }} title="แก้ไขข้อมูล"><Edit3 size={14} /></button>
                  <button type="button" className="btn-icon delete-memory-button" onClick={() => handleDelete(entry)} title="ลบข้อมูล"><Trash2 size={14} /></button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <SharePlaylistMemoryModal
        isOpen={isShareOpen}
        sourcePlaylist={playlist}
        onClose={() => setIsShareOpen(false)}
        onShared={refreshPlaylist}
      />

      {playlist && isInstructionEditorOpen && (
        <div className="modal-backdrop memory-editor-backdrop" onMouseDown={() => setIsInstructionEditorOpen(false)}>
          <section className="memory-editor-expanded" onMouseDown={(event) => event.stopPropagation()}>
            <div className="memory-editor-expanded-header">
              <div>
                <h2>คำสั่งบริบทของเรื่อง</h2>
                <p>{playlist.name} · ข้อความยาวจะแสดงและเลื่อนในหน้าต่างนี้เท่านั้น</p>
              </div>
              <button type="button" className="btn-icon" onClick={() => setIsInstructionEditorOpen(false)} title="ปิดหน้าต่างแก้ไข"><X size={17} /></button>
            </div>
            <textarea
              autoFocus
              value={instructionDraft}
              onChange={(event) => setInstructionDraft(event.target.value)}
              placeholder="พิมพ์บริบทของเรื่อง ชื่อตัวละคร สกิล องค์กร หรือรูปแบบ ชื่อเดิม -> ชื่อไทย"
            />
            <div className="memory-editor-expanded-footer">
              <span>{instructionDraft.split(/\r?\n/).filter(line => line.trim()).length} บรรทัด · {instructionDraft.length.toLocaleString()} ตัวอักษร</span>
              <div className="playlist-memory-instruction-actions">
                <button type="button" className="btn-secondary" onClick={() => setIsInstructionEditorOpen(false)}>ยกเลิก</button>
                <button type="button" className="btn-primary" onClick={handleSaveInstructions} disabled={isSaving}>
                  <Save size={14} /> {isSaving ? 'กำลังบันทึก...' : 'บันทึกบริบท'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </aside>
    </>
  );
};
