import React, { useState, useEffect } from 'react';
import { TextBubble, MangaPage, PlaylistMemoryEntry } from '../types';
import { 
  Volume2, 
  VolumeX, 
  AlignVerticalSpaceAround, 
  List, 
  User, 
  Sparkles, 
  Flame, 
  Radio, 
  Zap, 
  BookOpen, 
  ChevronLeft, 
  ChevronRight, 
  Compass, 
  Edit3, 
  Check, 
  X,
  Brain,
  Plus
} from 'lucide-react';
import { tts } from '../services/ttsService';

interface SubtitleStreamProps {
  pages: MangaPage[];
  activeBubbleId: string | null;
  onSelectBubble: (pageId: string, bubbleId: string) => void;
  onScrollToPage: (pageId: string) => void;
  onUpdateBubble?: (pageId: string, updatedBubble: TextBubble) => void;
  onAddBubble?: (pageId: string, newBubble: TextBubble) => void;
  onSaveToMemory?: (sourceName: string, thaiName: string) => void;
  memoryEntries?: PlaylistMemoryEntry[];
  onUpdateMemoryEntry?: (entryId: string, newThaiName: string) => void;
  preferredVoiceName?: string;
}

export const SubtitleStream: React.FC<SubtitleStreamProps> = ({
  pages,
  activeBubbleId,
  onSelectBubble,
  onScrollToPage,
  onUpdateBubble,
  onAddBubble,
  onSaveToMemory,
  memoryEntries,
  onUpdateMemoryEntry,
  preferredVoiceName,
}) => {
  const [viewLayout, setViewLayout] = useState<'aligned' | 'stream'>('stream');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [speakingBubbleId, setSpeakingBubbleId] = useState<string | null>(null);
  const [editingBubbleId, setEditingBubbleId] = useState<string | null>(null);
  const [editTranslatedText, setEditTranslatedText] = useState('');
  const [editSourceText, setEditSourceText] = useState('');
  const [editSpeaker, setEditSpeaker] = useState('');
  const [memorySavedNotice, setMemorySavedNotice] = useState<string | null>(null);
  // B→A sync: track if current edit matches a memory entry
  const [memoryUpdateSuggestion, setMemoryUpdateSuggestion] = useState<{ entryId: string; oldThaiName: string } | null>(null);

  // Flatten all bubbles across all pages with their page references
  const allBubbles = pages.flatMap((page) =>
    page.ocrResults.map((bubble) => ({
      ...bubble,
      pageId: page.id,
      pageOrder: page.orderIndex,
    }))
  );

  // Auto-scroll active subtitle card into view
  useEffect(() => {
    if (activeBubbleId) {
      const cardElem = document.getElementById(`sub-card-${activeBubbleId}`);
      if (cardElem) {
        cardElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeBubbleId]);

  useEffect(() => {
    if (!memorySavedNotice) return;
    const timer = window.setTimeout(() => setMemorySavedNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [memorySavedNotice]);

  const handleTTS = (e: React.MouseEvent, bubble: TextBubble) => {
    e.stopPropagation();
    if (speakingBubbleId === bubble.id) {
      tts.stop();
      setSpeakingBubbleId(null);
    } else {
      setSpeakingBubbleId(bubble.id);
      tts.speak(bubble.translated_text, 'th-TH', bubble.speaker, preferredVoiceName, () => {
        setSpeakingBubbleId(null);
      });
    }
  };

  const handleStartEdit = (e: React.MouseEvent | undefined, bubble: TextBubble) => {
    if (e) e.stopPropagation();
    setEditingBubbleId(bubble.id);
    setEditTranslatedText(bubble.translated_text || '');
    setEditSourceText(bubble.source_text || '');
    setEditSpeaker(bubble.speaker || '');
  };

  const handleSaveEdit = (pageId: string, bubble: TextBubble) => {
    const newSpeaker = editSpeaker.trim() || bubble.speaker;
    if (onUpdateBubble) {
      onUpdateBubble(pageId, {
        ...bubble,
        speaker: newSpeaker,
        source_text: editSourceText,
        translated_text: editTranslatedText,
        user_edited: true,
      });
    }

    // B→A: Check if the old speaker matched a memory entry and the new one differs
    if (memoryEntries && onUpdateMemoryEntry && newSpeaker !== bubble.speaker) {
      const matchingEntry = memoryEntries.find(e => e.thaiName === bubble.speaker);
      if (matchingEntry) {
        setMemoryUpdateSuggestion({ entryId: matchingEntry.id, oldThaiName: bubble.speaker });
        setMemorySavedNotice(`ชื่อ "${bubble.speaker}" ตรงกับความจำ — ต้องการอัปเดตเป็น "${newSpeaker}" ในความจำด้วยหรือไม่?`);
      }
    }

    setEditingBubbleId(null);
  };

  const handleCancelEdit = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingBubbleId(null);
  };

  const handleQuickSaveToMemory = (e: React.MouseEvent, bubble: TextBubble) => {
    e.stopPropagation();
    if (!onSaveToMemory) return;

    const source = (editSourceText || bubble.source_text || editSpeaker || bubble.speaker).trim();
    const thai = (editSpeaker || bubble.speaker || editTranslatedText || bubble.translated_text).trim();

    if (source && thai) {
      onSaveToMemory(source, thai);
      setMemorySavedNotice(`บันทึก "${source} → ${thai}" ลงความจำบริบทแล้ว`);
    }
  };

  const getSpeakerIcon = (speaker: string, bubbleType: string) => {
    const s = speaker.toLowerCase();
    if (bubbleType === 'sfx' || s.includes('sfx') || s.includes('เสียง')) {
      return <Flame size={14} color="#f472b6" />;
    }
    if (s.includes('villain') || s.includes('demon') || s.includes('ปีศาจ') || s.includes('วายร้าย')) {
      return <Zap size={14} color="#f87171" />;
    }
    if (s.includes('narrator') || s.includes('บรรยาย') || bubbleType === 'narration') {
      return <BookOpen size={14} color="#fbbf24" />;
    }
    if (s.includes('physics') || s.includes('วิเคราะห์') || bubbleType === 'physics_label') {
      return <Radio size={14} color="#38bdf8" />;
    }
    return <User size={14} color="#38bdf8" />;
  };

  const getSpeakerClass = (speaker: string, bubbleType: string) => {
    const s = speaker.toLowerCase();
    if (bubbleType === 'sfx' || s.includes('sfx')) return 'sfx';
    if (s.includes('villain') || s.includes('demon') || s.includes('ปีศาจ')) return 'villain';
    if (s.includes('narrator') || bubbleType === 'narration') return 'narrator';
    return 'normal';
  };

  if (isCollapsed) {
    return (
      <div 
        className="subtitle-collapsed-bar"
        onClick={() => setIsCollapsed(false)}
        title="คลิกเพื่อขยายแถบซับไตเติ้ล & บทสนทนา"
      >
        <ChevronLeft size={16} />
        <Sparkles size={16} color="var(--accent-cyan)" />
        <span className="vertical-panel-label">บทสนทนา & ซับไตเติ้ล</span>
        <span className="subtitle-count-badge">{allBubbles.length}</span>
      </div>
    );
  }

  return (
    <aside className="subtitle-timeline-panel">
      {/* Header */}
      <div className="subtitle-panel-header">
        <div className="subtitle-header-title">
          <Sparkles size={18} color="var(--accent-cyan)" />
          <span>บทสนทนา & ซับไตเติ้ล</span>
          <span className="subtitle-count-badge">{allBubbles.length} ไดอะล็อก</span>
        </div>

        {/* Actions in Subtitle Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            className={`view-mode-btn ${viewLayout === 'stream' ? 'active' : ''}`}
            onClick={() => setViewLayout('stream')}
            title="เรียงตามลำดับบทพูด (Chronological Stream)"
            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
          >
            <List size={13} />
            ไทม์ไลน์
          </button>
          <button
            className={`view-mode-btn ${viewLayout === 'aligned' ? 'active' : ''}`}
            onClick={() => setViewLayout('aligned')}
            title="ระดับความสูงตรงตามพิกัดภาพ (Coordinate Aligned)"
            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
          >
            <AlignVerticalSpaceAround size={13} />
            พิกัด Y
          </button>
          <button
            className="btn-icon subtitle-collapse-btn"
            onClick={() => setIsCollapsed(true)}
            title="ย่อแถบซับไตเติ้ล เพื่อขยายพื้นที่หน้าการ์ตูน"
            style={{ marginLeft: '4px' }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {memorySavedNotice && (
        <div style={{
          margin: '8px 12px 0',
          padding: '6px 10px',
          background: 'rgba(16, 185, 129, 0.18)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          borderRadius: '6px',
          color: '#a7f3d0',
          fontSize: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <Check size={13} /> {memorySavedNotice}
        </div>
      )}

      {/* Empty State */}
      {allBubbles.length === 0 && (
        <div 
          style={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            padding: '30px',
            textAlign: 'center',
            color: 'var(--text-dim)'
          }}
        >
          <Compass size={42} strokeWidth={1.5} style={{ marginBottom: '12px', opacity: 0.5 }} />
          <p style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>ยังไม่มีข้อมูลคำแปล</p>
          <p style={{ fontSize: '0.8rem' }}>
            กดปุ่ม <b style={{ color: 'var(--accent-cyan)' }}>"แปลทั้งตอน"</b> หรือคลิกหน้ามังงะเพื่อเริ่มดึงตัวหนังสือและแปลภาษา
          </p>
        </div>
      )}

      {/* Subtitle Stream Content */}
      {allBubbles.length > 0 && (
        <div className="subtitle-stream-scrollable">
          {pages.map((page) => (
            <div key={page.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Page Section Indicator */}
              <div 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  borderLeft: '2px solid var(--accent-cyan)'
                }}
              >
                <div
                  onClick={() => onScrollToPage(page.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1 }}
                  title="คลิกเพื่อเลื่อนไปยังหน้านี้"
                >
                  <BookOpen size={12} color="var(--accent-cyan)" />
                  <span style={{ fontWeight: 700, color: '#ffffff' }}>หน้า {page.orderIndex}</span>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>({page.ocrResults.length} ข้อความ)</span>
                </div>

                {onAddBubble && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const newId = `bubble_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                      const newBubble: TextBubble = {
                        id: newId,
                        box_2d: [400, 300, 600, 700],
                        source_text: '',
                        translated_text: 'ข้อความใหม่',
                        speaker: 'ตัวละคร',
                        bubble_type: 'speech',
                        reading_order: page.ocrResults.length + 1,
                        user_edited: true,
                      };
                      onAddBubble(page.id, newBubble);
                      setEditingBubbleId(newId);
                      setEditSpeaker('ตัวละคร');
                      setEditSourceText('');
                      setEditTranslatedText('ข้อความใหม่');
                    }}
                    style={{
                      background: 'rgba(6, 182, 212, 0.15)',
                      border: '1px solid rgba(6, 182, 212, 0.35)',
                      color: 'var(--accent-cyan)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                    }}
                    title="เพิ่มกล่องข้อความใหม่ในหน้านี้"
                  >
                    <Plus size={11} /> เพิ่มข้อความ
                  </button>
                )}
              </div>

              {/* Bubbles in this page */}
              {page.ocrResults.map((bubble, idx) => {
                const isActive = activeBubbleId === bubble.id;
                const isSpeaking = speakingBubbleId === bubble.id;
                const isEditing = editingBubbleId === bubble.id;
                const yCoordPct = Math.round((bubble.box_2d[0] / 1000) * 100);

                return (
                  <div
                    key={bubble.id}
                    id={`sub-card-${bubble.id}`}
                    className={`subtitle-card ${isActive ? 'card-active' : ''}`}
                    onClick={() => onSelectBubble(page.id, bubble.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit(e, bubble);
                    }}
                    title="ดับเบิ้ลคลิกเพื่อแก้ไขชื่อตัวละคร ภาษาอังกฤษ และภาษาไทย"
                    style={
                      viewLayout === 'aligned'
                        ? {
                            marginTop: idx === 0 ? `${Math.min(30, yCoordPct * 0.4)}px` : '4px',
                            borderLeft: isActive ? '3px solid var(--accent-cyan)' : undefined,
                            cursor: 'pointer',
                          }
                        : { cursor: 'pointer' }
                    }
                  >
                    {/* Top Row: Speaker & Sequence & Edit Button */}
                    <div className="card-top-row">
                      <div className={`speaker-pill ${getSpeakerClass(isEditing ? editSpeaker : bubble.speaker, bubble.bubble_type)}`}>
                        {getSpeakerIcon(isEditing ? editSpeaker : bubble.speaker, bubble.bubble_type)}
                        <span>{isEditing ? (editSpeaker || 'ตัวละคร') : bubble.speaker}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div className="card-order-badge">
                          #{bubble.reading_order || idx + 1}
                        </div>
                        {!isEditing && (
                          <button
                            onClick={(e) => handleStartEdit(e, bubble)}
                            title="แก้ไขบทแปลนี้ (หรือดับเบิ้ลคลิกที่กล่องข้อความ)"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-dim)',
                              cursor: 'pointer',
                              padding: '2px',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                          >
                            <Edit3 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline Editor or Display Card */}
                    {isEditing ? (
                      <div
                        className="subtitle-card-editor"
                        style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Speaker Name Input */}
                        <div>
                          <label style={{ fontSize: '0.71rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                            ชื่อตัวละคร / ผู้พูด:
                          </label>
                          <input
                            type="text"
                            value={editSpeaker}
                            onChange={(e) => setEditSpeaker(e.target.value)}
                            placeholder="ชื่อตัวละคร (เช่น ซองจินอู, พระเอก)"
                            style={{
                              width: '100%',
                              background: 'rgba(0, 0, 0, 0.4)',
                              border: '1px solid var(--accent-cyan)',
                              borderRadius: '4px',
                              color: '#ffffff',
                              padding: '4px 8px',
                              fontSize: '0.8rem',
                              outline: 'none',
                            }}
                          />
                        </div>

                        {/* Original Source Text (English / Chinese) Input */}
                        <div>
                          <label style={{ fontSize: '0.71rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                            ภาษาอังกฤษ / ข้อความต้นฉบับ:
                          </label>
                          <textarea
                            value={editSourceText}
                            onChange={(e) => setEditSourceText(e.target.value)}
                            placeholder="ภาษาอังกฤษ หรือข้อความต้นฉบับ"
                            rows={2}
                            style={{
                              width: '100%',
                              background: 'rgba(0, 0, 0, 0.4)',
                              border: '1px solid rgba(255, 255, 255, 0.18)',
                              borderRadius: '4px',
                              color: '#e2e8f0',
                              padding: '4px 8px',
                              fontSize: '0.78rem',
                              resize: 'vertical',
                              outline: 'none',
                            }}
                          />
                        </div>

                        {/* Translated Thai Text Input */}
                        <div>
                          <label style={{ fontSize: '0.71rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                            ภาษาไทย:
                          </label>
                          <textarea
                            autoFocus
                            value={editTranslatedText}
                            onChange={(e) => setEditTranslatedText(e.target.value)}
                            placeholder="ข้อความภาษาไทย"
                            rows={3}
                            style={{
                              width: '100%',
                              background: 'rgba(0, 0, 0, 0.4)',
                              border: '1px solid var(--accent-cyan)',
                              borderRadius: '4px',
                              color: '#ffffff',
                              padding: '5px 8px',
                              fontSize: '0.86rem',
                              fontFamily: 'var(--font-thai-comic)',
                              resize: 'vertical',
                              outline: 'none',
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSaveEdit(page.id, bubble);
                              }
                            }}
                          />
                        </div>

                        {/* Action Buttons in Edit Mode */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                          {onSaveToMemory && (
                            <button
                              type="button"
                              onClick={(e) => handleQuickSaveToMemory(e, bubble)}
                              style={{
                                background: 'rgba(168, 85, 247, 0.18)',
                                border: '1px solid rgba(168, 85, 247, 0.4)',
                                color: '#c084fc',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '0.72rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                              title="เพิ่มชื่อตัวละครนี้เข้าความจำบริบทด้านซ้าย"
                            >
                              <Brain size={12} /> + บันทึกลงความจำ
                            </button>
                          )}
                          {/* B→A: Show update-memory button if speaker matches a memory entry */}
                          {memoryEntries && onUpdateMemoryEntry && (() => {
                            const currentSpeaker = editSpeaker.trim();
                            const matchingEntry = memoryEntries.find(e => e.thaiName === bubble.speaker && currentSpeaker && currentSpeaker !== bubble.speaker);
                            if (!matchingEntry) return null;
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateMemoryEntry(matchingEntry.id, currentSpeaker);
                                  setMemorySavedNotice(`อัปเดตความจำ "${matchingEntry.sourceName}" เป็น "${currentSpeaker}" แล้ว`);
                                }}
                                className="subtitle-update-memory-btn"
                                title={`อัปเดตชื่อ "${matchingEntry.sourceName}" ในความจำเป็น "${currentSpeaker}"`}
                              >
                                <Brain size={12} /> 🔄 อัปเดตความจำ
                              </button>
                            );
                          })()}
                          <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              style={{
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: 'none',
                                color: 'var(--text-muted)',
                                borderRadius: '4px',
                                padding: '4px 10px',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                              }}
                            >
                              <X size={12} /> ยกเลิก
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(page.id, bubble)}
                              style={{
                                background: '#10b981',
                                border: 'none',
                                color: '#ffffff',
                                borderRadius: '4px',
                                padding: '4px 12px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                              }}
                            >
                              <Check size={12} /> บันทึก
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Original Source Text (English / Chinese) */}
                        {bubble.source_text && (
                          <div
                            className="card-original-text"
                            title="ดับเบิ้ลคลิกเพื่อแก้ไข"
                          >
                            "{bubble.source_text}"
                          </div>
                        )}

                        {/* Translated Thai Text */}
                        <div 
                          className="card-translated-text"
                          title="ดับเบิ้ลคลิกเพื่อแก้ไข"
                        >
                          {bubble.translated_text}
                        </div>
                      </>
                    )}

                    {/* Bottom Row: Audio Voice Playback & Coordinate Indicator */}
                    <div className="card-actions-bottom" style={{ marginTop: '8px' }}>
                      <button
                        className={`tts-btn ${isSpeaking ? 'speaking' : ''}`}
                        onClick={(e) => handleTTS(e, bubble)}
                        title="ฟังเสียงพากย์ด้วย AI Neural Voice"
                      >
                        {isSpeaking ? <VolumeX size={12} /> : <Volume2 size={12} />}
                        {isSpeaking ? 'กำลังเล่นเสียง...' : 'ฟังเสียง (Neural TTS)'}
                      </button>

                      <div className="coord-indicator" title="พิกัดแกน Y บนหน้ามังงะ">
                        <span>Y: {yCoordPct}%</span>
                        {bubble.bubble_type === 'sfx' && (
                          <span style={{ color: '#f472b6', fontWeight: 600 }}>• SFX</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
};
