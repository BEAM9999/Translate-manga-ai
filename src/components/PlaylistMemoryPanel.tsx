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
  const [isInstructionEditorOpen, setIsInstructionEditorOpen] = useState(false);
  const [instructionDraft, setInstructionDraft] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isExtractingTranslations, setIsExtractingTranslations] = useState(false);
  const [extractionMessage, setExtractionMessage] = useState('');
  const [translationExtractionMessage, setTranslationExtractionMessage] = useState('');
  const [currentTime, setCurrentTime] = useState(() => Date.now());

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
      <button
        type="button"
        className={`playlist-memory-mobile-launcher ${isCompactOpen ? 'is-hidden' : ''}`}
        onClick={() => setIsCompactOpen(true)}
        title="เปิดบริบทและชื่อเรื่อง"
      >
        <Brain size={18} />
      </button>

    <aside className={`playlist-memory-panel ${isCompactOpen ? 'mobile-open' : ''}`}>
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
        <button className="btn-icon memory-mobile-close" type="button" onClick={() => setIsCompactOpen(false)} title="ปิดแผงบริบท">
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

          <div className="playlist-memory-list">
            {visibleEntries.length === 0 ? (
              <div className="playlist-memory-empty-list">{entries.length === 0 ? 'ยังไม่มีชื่อหรือคำศัพท์ในเรื่องนี้' : 'ไม่พบข้อมูลที่ตรงกับตัวกรอง'}</div>
            ) : visibleEntries.map((entry) => (
              <article
                key={entry.id}
                className={`playlist-memory-entry ${recentEntryClass(entry, currentTime)} `}
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
