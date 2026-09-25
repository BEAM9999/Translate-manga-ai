import React, { useRef, useState, useEffect } from 'react';
import { MangaPage, ViewMode, AppSettings, TextBubble } from '../types';
import { BubbleOverlay } from './BubbleOverlay';
import { CropOverlay } from './CropOverlay';
import { ScissorsOverlay } from './ScissorsOverlay';
import { EraserOverlay } from './EraserOverlay';
import { EmbedTranslationModal } from './EmbedTranslationModal';
import { ContextMenu } from './ContextMenu';
import { ManualBubbleModal, ManualBubbleValues } from './ManualBubbleModal';
import { isTextEditingTarget } from '../utils/keyboardTarget';
import { 
  Plus, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  RotateCw, 
  Sparkles, 
  Image as ImageIcon,
  CheckCircle,
  AlertTriangle,
  UploadCloud,
  Scissors,
  Crop,
  MessageSquarePlus
} from 'lucide-react';

const INTERNAL_MANGA_PAGE_DRAG_TYPE = 'application/x-c2-sub-auto-ai-page';

interface MangaCanvasProps {
  pages: MangaPage[];
  viewMode: ViewMode;
  settings: AppSettings;
  activeBubbleId: string | null;
  onSelectBubble: (pageId: string, bubbleId: string) => void;
  onUpdateBubble: (pageId: string, updatedBubble: TextBubble) => void;
  onDeleteBubble?: (pageId: string, bubbleId: string) => void;
  onAddBubble?: (pageId: string, bubble: TextBubble) => void;
  onAddBubbleLive?: (pageId: string, bubble: TextBubble) => void;
  onTranslatePage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onMovePage: (pageId: string, direction: 'up' | 'down') => void;
  onAddPages: (newPages: MangaPage[], insertIndex: number) => void;
  onApplyCrop: (pageId: string, cropRect: { top: number; left: number; width: number; height: number }) => void;
  onSplitPage: (pageId: string, cutYPx: number) => void;
  onApplyDrawing?: (pageId: string, newImageUrl: string, mode: 'eraser' | 'paint') => void;
  onInpaintPage?: (pageId: string) => void;
  onAutoCleanAndEmbed?: (pageId: string) => void;
  onBridgeAdjacentSeam?: (topPageId: string, bottomPageId: string) => void;
  onDeselectAll?: () => void;
  onCommitBubble?: (pageId: string, updatedBubble: TextBubble) => void;
  canvasTool: 'pointer' | 'eraser' | 'paint';
  onSetCanvasTool: (tool: 'pointer' | 'eraser' | 'paint') => void;
  zoomScale: number;
}

export const MangaCanvas: React.FC<MangaCanvasProps> = ({
  pages,
  viewMode,
  settings,
  activeBubbleId,
  onSelectBubble,
  onUpdateBubble,
  onCommitBubble,
  onDeleteBubble,
  onAddBubble,
  onAddBubbleLive,
  onTranslatePage,
  onDeletePage,
  onMovePage,
  onAddPages,
  onApplyCrop,
  onSplitPage,
  onApplyDrawing,
  onInpaintPage,
  onAutoCleanAndEmbed,
  onBridgeAdjacentSeam,
  onDeselectAll,
  canvasTool,
  onSetCanvasTool,
  zoomScale,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetInsertIndexRef = useRef<number>(pages.length);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const touchContextMenuTimerRef = useRef<number | null>(null);
  const touchContextMenuStartRef = useRef<{ x: number; y: number; pageId: string; pageIndex: number } | null>(null);
  const suppressLongPressClickRef = useRef(false);

  // Active Tool state
  const [croppingPageId, setCroppingPageId] = useState<string | null>(null);
  const [scissorsPageId, setScissorsPageId] = useState<string | null>(null);
  const [drawingMode, setDrawingMode] = useState<{ pageId: string; mode: 'eraser' | 'paint' } | null>(null);
  const [embedTargetPageId, setEmbedTargetPageId] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(pages[0]?.id || null);
  const [manualBubbleTarget, setManualBubbleTarget] = useState<{
    pageId: string;
    box: [number, number, number, number];
  } | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    pageId: string;
    pageIndex: number;
  } | null>(null);

  // Keyboard Delete listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (isTextEditingTarget(e.target)) {
          return;
        }
        if (selectedPageId && !croppingPageId && !scissorsPageId) {
          onDeletePage(selectedPageId);
        }
      }
      if (e.key === 'Escape') {
        setCroppingPageId(null);
        setScissorsPageId(null);
        setDrawingMode(null);
        setContextMenu(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPageId, croppingPageId, scissorsPageId, drawingMode, onDeletePage]);

  const handleTriggerAddPage = (insertIndex: number) => {
    targetInsertIndexRef.current = insertIndex;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const processFiles = (files: FileList | File[], insertIndex: number) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|avif|bmp|gif|svg)$/i.test(f.name));
    if (fileArray.length === 0) {
      alert('กรุณาเลือกไฟล์รูปภาพ เช่น .webp, .png, .jpg, .jpeg');
      return;
    }

    let loadedCount = 0;
    const newPages: MangaPage[] = [];

    fileArray.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const imageUrl = event.target?.result as string;
        const img = new Image();
        img.onload = () => {
          newPages[index] = {
            id: `page_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
            file,
            originalImageUrl: imageUrl,
            width: img.naturalWidth || 800,
            height: img.naturalHeight || 1200,
            isTranslating: false,
            isTranslated: false,
            ocrResults: [],
            orderIndex: insertIndex + index + 1,
          };

          loadedCount++;
          if (loadedCount === fileArray.length) {
            const validPages = newPages.filter(Boolean);
            onAddPages(validPages, insertIndex);
          }
        };
        img.onerror = () => {
          loadedCount++;
          if (loadedCount === fileArray.length) {
            const validPages = newPages.filter(Boolean);
            if (validPages.length > 0) onAddPages(validPages, insertIndex);
          }
        };
        img.src = imageUrl;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files, targetInsertIndexRef.current);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (Array.from(e.dataTransfer.types).includes(INTERNAL_MANGA_PAGE_DRAG_TYPE)) {
      e.dataTransfer.dropEffect = 'none';
      setIsDraggingOver(false);
      return;
    }

    e.dataTransfer.dropEffect = 'copy';
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (Array.from(e.dataTransfer.types).includes(INTERNAL_MANGA_PAGE_DRAG_TYPE)) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files, pages.length);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, pageId: string, pageIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (touchContextMenuStartRef.current) {
      suppressLongPressClickRef.current = true;
      clearTouchContextMenuTimer();
    }
    setSelectedPageId(pageId);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      pageId,
      pageIndex: pageIdx,
    });
  };

  const clearTouchContextMenuTimer = () => {
    if (touchContextMenuTimerRef.current !== null) {
      window.clearTimeout(touchContextMenuTimerRef.current);
      touchContextMenuTimerRef.current = null;
    }
  };

  const handleTouchPointerDown = (event: React.PointerEvent<HTMLImageElement>, pageId: string, pageIndex: number) => {
    if (event.pointerType !== 'touch') return;

    suppressLongPressClickRef.current = false;
    touchContextMenuStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      pageId,
      pageIndex,
    };
    clearTouchContextMenuTimer();
    touchContextMenuTimerRef.current = window.setTimeout(() => {
      const start = touchContextMenuStartRef.current;
      touchContextMenuTimerRef.current = null;
      if (!start) return;

      suppressLongPressClickRef.current = true;
      setSelectedPageId(start.pageId);
      setContextMenu({ ...start });
    }, 550);
  };

  const handleTouchPointerMove = (event: React.PointerEvent<HTMLImageElement>) => {
    const start = touchContextMenuStartRef.current;
    if (!start) return;

    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) {
      clearTouchContextMenuTimer();
      touchContextMenuStartRef.current = null;
    }
  };

  const handleTouchPointerEnd = () => {
    clearTouchContextMenuTimer();
    touchContextMenuStartRef.current = null;
  };

  const handleCopyText = (pageId: string) => {
    const targetPage = pages.find(p => p.id === pageId);
    if (!targetPage) return;
    const text = targetPage.ocrResults.map(b => `[${b.speaker}] ${b.translated_text}`).join('\n');
    navigator.clipboard.writeText(text);
    alert('คัดลอกบทแปลของหน้านี้เรียบร้อยแล้ว');
  };

  const getManualBubbleBox = (pageId: string, clientX?: number, clientY?: number): [number, number, number, number] => {
    const imageElem = document.getElementById(`manga-page-${pageId}`)?.querySelector('img.manga-image-elem');
    const imageRect = imageElem?.getBoundingClientRect();
    const defaultCenterX = 500;
    const defaultCenterY = 500;
    const centerX = imageRect && clientX !== undefined
      ? ((clientX - imageRect.left) / imageRect.width) * 1000
      : defaultCenterX;
    const centerY = imageRect && clientY !== undefined
      ? ((clientY - imageRect.top) / imageRect.height) * 1000
      : defaultCenterY;
    const width = 300;
    const height = 210;
    const xmin = Math.round(Math.max(0, Math.min(1000 - width, centerX - width / 2)));
    const ymin = Math.round(Math.max(0, Math.min(1000 - height, centerY - height / 2)));

    return [ymin, xmin, ymin + height, xmin + width];
  };

  const openManualBubbleEditor = (pageId: string, clientX?: number, clientY?: number) => {
    if (!onAddBubble) return;
    setManualBubbleTarget({
      pageId,
      box: getManualBubbleBox(pageId, clientX, clientY),
    });
  };

  const handleSaveManualBubble = (values: ManualBubbleValues) => {
    if (!manualBubbleTarget || !onAddBubble) return;

    const page = pages.find(item => item.id === manualBubbleTarget.pageId);
    const bubble: TextBubble = {
      id: `custom_bubble_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      box_2d: manualBubbleTarget.box,
      source_text: values.sourceText,
      translated_text: values.translatedText,
      speaker: values.speaker,
      bubble_type: 'speech',
      bg_color: '#ffffff',
      text_color: '#000000',
      reading_order: (page?.ocrResults.length || 0) + 1,
      user_edited: true,
    };

    onAddBubble(manualBubbleTarget.pageId, bubble);
    setManualBubbleTarget(null);
  };

  const handleDuplicateBubble = (
    pageId: string,
    bubble: TextBubble,
    mode: 'drag' | 'offset'
  ): TextBubble | null => {
    const addBubble = mode === 'drag' ? onAddBubbleLive || onAddBubble : onAddBubble;
    if (!addBubble) return null;

    const [ymin, xmin, ymax, xmax] = bubble.box_2d;
    const width = xmax - xmin;
    const height = ymax - ymin;
    const offset = mode === 'drag' ? 16 : 28;
    const nextXmin = Math.max(0, Math.min(1000 - width, xmin + offset));
    const nextYmin = Math.max(0, Math.min(1000 - height, ymin + offset));
    const page = pages.find(item => item.id === pageId);
    const duplicate: TextBubble = {
      ...bubble,
      id: `copy_bubble_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      box_2d: [nextYmin, nextXmin, nextYmin + height, nextXmin + width],
      reading_order: (page?.ocrResults.length || 0) + 1,
      user_edited: true,
    };

    addBubble(pageId, duplicate);
    return duplicate;
  };

  const handleCopyBubbleText = async (bubble: TextBubble) => {
    const text = [
      `ผู้พูด: ${bubble.speaker}`,
      bubble.source_text ? `ต้นฉบับ: ${bubble.source_text}` : '',
      `คำแปลไทย: ${bubble.translated_text}`,
    ].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(text);
      alert('คัดลอกข้อความในกล่องไป Clipboard แล้ว');
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textArea);
      alert(copied ? 'คัดลอกข้อความในกล่องไป Clipboard แล้ว' : 'ไม่สามารถคัดลอกข้อความได้');
    }
  };

  return (
    <main 
      className="manga-canvas-container" 
      id="manga-canvas-scroll-root"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={(e) => {
        setContextMenu(null);
        if (
          (e.target as HTMLElement).closest('.manga-bubble-overlay') === null &&
          (e.target as HTMLElement).closest('.page-action-btn') === null &&
          (e.target as HTMLElement).closest('.add-divider-btn') === null
        ) {
          onDeselectAll?.();
        }
      }}
    >
      {/* Hidden File Input for Page Insertion */}
      <input
        type="file"
        id="global-manga-file-input"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*,.png,.jpg,.jpeg,.webp,.avif,.bmp,.gif,.tif,.tiff,.svg"
        multiple
        style={{ display: 'none' }}
      />

      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(6, 182, 212, 0.25)',
            backdropFilter: 'blur(8px)',
            border: '4px dashed var(--accent-cyan)',
            zIndex: 999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            pointerEvents: 'none',
          }}
        >
          <UploadCloud size={64} color="var(--accent-cyan)" />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '16px' }}>
            ปล่อยไฟล์รูปภาพที่นี่ (รองรับ .webp, .png, .jpg ฯลฯ)
          </h2>
          <p style={{ color: '#e0f2fe', marginTop: '6px' }}>
            รูปภาพจะถูกเพิ่มต่อท้ายตอนให้อัตโนมัติโดยคงความชัด 100%
          </p>
        </div>
      )}

      <div 
        className="chapter-strip"
        style={{ 
          maxWidth: `${Math.round(820 * (zoomScale / 100))}px`,
          width: '100%' 
        }}
      >
        {/* Top Add Page Button */}
        {pages.length > 0 && (
          <div className="page-divider-add">
            <button 
              className="add-divider-btn"
              onClick={() => handleTriggerAddPage(0)}
              title="แทรกหน้าใหม่ด้านบนสุด"
            >
              <Plus size={14} /> แทรกหน้าที่ 1 (ด้านบน)
            </button>
          </div>
        )}

        {/* Empty Canvas State */}
        {pages.length === 0 && (
          <div
            style={{
              width: '100%',
              minHeight: '420px',
              border: '2px dashed rgba(6, 182, 212, 0.4)',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 20px',
              textAlign: 'center',
              background: 'rgba(15, 20, 34, 0.4)',
              backdropFilter: 'blur(10px)',
              cursor: 'pointer',
              marginTop: '40px',
            }}
            onClick={() => handleTriggerAddPage(0)}
          >
            <div 
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(168, 85, 247, 0.2))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                color: 'var(--accent-cyan)'
              }}
            >
              <Plus size={32} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
              อัปโหลดหน้ามังงะ / การ์ตูนเพื่อเริ่มต้น
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: '440px', marginBottom: '20px' }}>
              รองรับรูปภาพทุกนามสกุลไฟล์ เช่น <b>.webp</b>, <b>.png</b>, <b>.jpg</b>, <b>.jpeg</b>, <b>.avif</b> โดยคงคุณภาพความละเอียดภาพต้นฉบับ 100% สามารถเพิ่มรูปภาพต่อลงไปเรื่อยๆ จนจบตอนได้เลย
            </p>
            <button className="btn-primary" onClick={(e) => { e.stopPropagation(); handleTriggerAddPage(0); }}>
              <Plus size={16} /> เลือกรูปภาพมังงะ (หน้า 1, 2, 3...)
            </button>
          </div>
        )}

        {/* Render Continuous Pages */}
        {pages.map((page, pageIdx) => {
          const isSelected = selectedPageId === page.id;
          const isCropping = croppingPageId === page.id;
          const isScissors = scissorsPageId === page.id;

          return (
            <React.Fragment key={page.id}>
              <div 
                className={`manga-page-wrapper ${isSelected ? 'highlight-page' : ''}`}
                id={`manga-page-${page.id}`}
                onClick={(event) => {
                  if (suppressLongPressClickRef.current) {
                    suppressLongPressClickRef.current = false;
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                  }
                  setSelectedPageId(page.id);
                  if (canvasTool !== 'pointer' && !isCropping && !isScissors) {
                    setDrawingMode({ pageId: page.id, mode: canvasTool });
                  }
                }}
                onContextMenu={(e) => handleContextMenu(e, page.id, pageIdx)}
              >
                {/* Floating Page Controls Header */}
                <div className="manga-page-header">
                  <div className="page-badge">
                    <ImageIcon size={12} />
                    <span>หน้า {pageIdx + 1}</span>
                    {page.isTranslated && (
                      <span style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        • <CheckCircle size={11} /> {page.ocrResults.length} ข้อความ
                      </span>
                    )}
                  </div>

                  <div className="page-actions-group">
                    {/* Add Custom Bubble */}
                    <button
                      className="page-action-btn"
                      onClick={() => openManualBubbleEditor(page.id)}
                      title="เพิ่มข้อความแปลเอง (วางกล่องคำพูดใหม่)"
                    >
                      <MessageSquarePlus size={12} color="var(--accent-cyan)" />
                      <span>เพิ่มกล่องข้อความ</span>
                    </button>

                    {/* Scissors Tool */}
                    <button
                      className={`page-action-btn ${isScissors ? 'active' : ''}`}
                      onClick={() => {
                        setCroppingPageId(null);
                        setScissorsPageId(isScissors ? null : page.id);
                      }}
                      title="ใช้กรรไกรตัดแบ่งท่อนภาพเป็น 2 รูปภาพทันที"
                      style={{ color: isScissors ? '#f59e0b' : undefined }}
                    >
                      <Scissors size={12} color={isScissors ? '#f59e0b' : undefined} />
                      <span>{isScissors ? 'กำลังตัด' : 'กรรไกร'}</span>
                    </button>

                    {/* Crop Tool */}
                    <button
                      className={`page-action-btn ${isCropping ? 'active' : ''}`}
                      onClick={() => {
                        setScissorsPageId(null);
                        setCroppingPageId(isCropping ? null : page.id);
                      }}
                      title="ครอบตัดภาพ ดึงขยายตัดหัว-ท้ายที่ไม่ต้องการออก (กด Enter เพื่อตัด)"
                      style={{ color: isCropping ? 'var(--accent-cyan)' : undefined }}
                    >
                      <Crop size={12} color={isCropping ? 'var(--accent-cyan)' : undefined} />
                      <span>{isCropping ? 'กำลังครอบตัด' : 'ครอบตัด'}</span>
                    </button>

                    {/* Re-translate Single Page */}
                    <button
                      className="page-action-btn"
                      onClick={() => onTranslatePage(page.id)}
                      disabled={page.isTranslating}
                      title="แปลหน้านี้ด้วย AI อีกครั้ง"
                    >
                      {page.isTranslating ? (
                        <div className="spinner" style={{ width: '12px', height: '12px' }} />
                      ) : (
                        <RotateCw size={12} />
                      )}
                      <span>{page.isTranslated ? 'แปลซ้ำ' : 'แปลหน้านี้'}</span>
                    </button>

                    {/* Move Up */}
                    {pageIdx > 0 && (
                      <button
                        className="page-action-btn"
                        onClick={() => onMovePage(page.id, 'up')}
                        title="เลื่อนหน้านี้ขึ้น"
                      >
                        <ArrowUp size={12} />
                      </button>
                    )}

                    {/* Move Down */}
                    {pageIdx < pages.length - 1 && (
                      <button
                        className="page-action-btn"
                        onClick={() => onMovePage(page.id, 'down')}
                        title="เลื่อนหน้านี้ลง"
                      >
                        <ArrowDown size={12} />
                      </button>
                    )}

                    {/* Delete Page */}
                    <button
                      className="page-action-btn"
                      onClick={() => onDeletePage(page.id)}
                      title="ลบหน้านี้ออก (หรือกดปุ่ม Delete บนคีย์บอร์ด)"
                      style={{ color: '#f87171' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Main High-Res Manga Image */}
                <img
                  src={page.originalImageUrl}
                  alt={`Manga Page ${pageIdx + 1}`}
                  className="manga-image-elem"
                  draggable
                  onPointerDown={(event) => handleTouchPointerDown(event, page.id, pageIdx)}
                  onPointerMove={handleTouchPointerMove}
                  onPointerUp={handleTouchPointerEnd}
                  onPointerCancel={handleTouchPointerEnd}
                  onDragStart={(event) => {
                    if (touchContextMenuStartRef.current) {
                      event.preventDefault();
                      return;
                    }
                    event.dataTransfer.setData(INTERNAL_MANGA_PAGE_DRAG_TYPE, page.id);
                  }}
                  loading="lazy"
                />

                {/* Crop Overlay if active */}
                {isCropping && (
                  <CropOverlay
                    page={page}
                    onApplyCrop={(pId, rect) => {
                      onApplyCrop(pId, rect);
                      setCroppingPageId(null);
                    }}
                    onCancel={() => setCroppingPageId(null)}
                  />
                )}

                {/* Scissors Overlay if active */}
                {isScissors && (
                  <ScissorsOverlay
                    page={page}
                    onSplitPage={(pId, cutY) => {
                      onSplitPage(pId, cutY);
                      setScissorsPageId(null);
                    }}
                    onCancel={() => setScissorsPageId(null)}
                  />
                )}

                {/* Eraser / Paintbrush Overlay if active */}
                {drawingMode && drawingMode.pageId === page.id && (
                  <EraserOverlay
                    page={page}
                    initialMode={drawingMode.mode}
                    commitOnExit={canvasTool === 'pointer'}
                    onApply={(pId, newImageUrl, mode) => {
                      if (onApplyDrawing) onApplyDrawing(pId, newImageUrl, mode);
                      setDrawingMode(null);
                      onSetCanvasTool('pointer');
                    }}
                    onCancel={() => {
                      setDrawingMode(null);
                      onSetCanvasTool('pointer');
                    }}
                  />
                )}

                {/* Translation Loading Overlay */}
                {page.isTranslating && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(6, 12, 24, 0.82)',
                      backdropFilter: 'blur(6px)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 20,
                      gap: '12px',
                    }}
                  >
                    <div className="spinner" style={{ width: '36px', height: '36px', borderWidth: '3px' }} />
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontWeight: 700, color: '#ffffff', fontSize: '1rem', marginBottom: '4px' }}>
                        Gemini AI กำลังวิเคราะห์ & แปลภาษา...
                      </p>
                      <p style={{ color: 'var(--accent-cyan)', fontSize: '0.8rem' }}>
                        สแกนทีละท่อนอย่างแม่นยำเพื่อพิกัดตรงจุด 100%
                      </p>
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {page.errorMessage && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '12px',
                      left: '12px',
                      right: '12px',
                      background: 'rgba(239, 68, 68, 0.9)',
                      color: '#ffffff',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '0.82rem',
                      zIndex: 22,
                    }}
                  >
                    <AlertTriangle size={16} />
                    <span>{page.errorMessage}</span>
                  </div>
                )}

                {/* In-situ Speech Bubble Overlay Layer */}
                {!isCropping && !isScissors && !page.translationsEmbedded && (
                  <div className="bubble-overlay-layer">
                    {page.ocrResults.map((bubble) => (
                      <BubbleOverlay
                        key={bubble.id}
                        pageId={page.id}
                        bubble={bubble}
                        viewMode={viewMode}
                        settings={settings}
                        isActive={activeBubbleId === bubble.id}
                        onSelect={() => onSelectBubble(page.id, bubble.id)}
                        onDeselect={() => onDeselectAll?.()}
                        onUpdateBubble={(updated) => onUpdateBubble(page.id, updated)}
                        onCommitBubble={(updated) => onCommitBubble?.(page.id, updated)}
                        onDeleteBubble={(bubbleId) => onDeleteBubble && onDeleteBubble(page.id, bubbleId)}
                        onDuplicateBubble={(sourceBubble, mode) => handleDuplicateBubble(page.id, sourceBubble, mode)}
                        onCopyBubbleText={handleCopyBubbleText}
                        pageWidth={page.width}
                        pageHeight={page.height}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Seamless Insert & Seam Bridge Between Pages */}
              <div className="page-divider-add" style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  className="add-divider-btn"
                  onClick={() => handleTriggerAddPage(pageIdx + 1)}
                  title={`แทรกหน้าระหว่างหน้า ${pageIdx + 1} และ ${pageIdx + 2}`}
                >
                  <Plus size={14} /> เพิ่มรูปภาพแทรกตรงนี้ (หน้าที่ {pageIdx + 2})
                </button>

                {onBridgeAdjacentSeam && pageIdx < pages.length - 1 && (
                  <button
                    className="add-divider-btn"
                    onClick={() => onBridgeAdjacentSeam(page.id, pages[pageIdx + 1].id)}
                    style={{
                      background: 'rgba(168, 85, 247, 0.15)',
                      borderColor: 'rgba(168, 85, 247, 0.4)',
                      color: '#c084fc',
                    }}
                    title={`วิเคราะห์และแก้ปัญหาตัวหนังสือขาดครึ่งระหว่างหน้า ${pageIdx + 1} และหน้า ${pageIdx + 2}`}
                  >
                    <Sparkles size={13} color="#a855f7" /> 🔗 แปลรอยต่อภาพ {pageIdx + 1} ⇕ {pageIdx + 2} (แก้คำขาดครึ่ง)
                  </button>
                )}
              </div>
            </React.Fragment>
          );
        })}

        {/* Bottom Big Add Next Page Button */}
        {pages.length > 0 && (
          <div
            style={{
              width: '100%',
              padding: '24px',
              borderRadius: '12px',
              border: '2px dashed rgba(6, 182, 212, 0.4)',
              background: 'rgba(15, 20, 34, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              cursor: 'pointer',
              marginTop: '12px',
              transition: 'all 0.2s',
            }}
            onClick={() => handleTriggerAddPage(pages.length)}
          >
            <div 
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'rgba(6, 182, 212, 0.15)',
                color: 'var(--accent-cyan)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Plus size={24} />
            </div>
            <p style={{ fontWeight: 600, color: '#ffffff', fontSize: '0.92rem' }}>
              บวกเพิ่มรูปภาพถัดไป (หน้าที่ {pages.length + 1})
            </p>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              กดเพื่อต่อรูปภาพ (.webp, .png, .jpg) ลงไปเรื่อยๆ จนจบตอน
            </span>
          </div>
        )}
      </div>

      {/* Right Click Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          pageId={contextMenu.pageId}
          pageIndex={contextMenu.pageIndex}
          onClose={() => setContextMenu(null)}
          onStartCrop={(pId) => { setCroppingPageId(pId); setScissorsPageId(null); setDrawingMode(null); }}
          onStartScissors={(pId) => { setScissorsPageId(pId); setCroppingPageId(null); setDrawingMode(null); }}
          onStartEraser={(pId) => { onSetCanvasTool('eraser'); setDrawingMode({ pageId: pId, mode: 'eraser' }); setCroppingPageId(null); setScissorsPageId(null); }}
          onStartPaint={(pId) => { onSetCanvasTool('paint'); setDrawingMode({ pageId: pId, mode: 'paint' }); setCroppingPageId(null); setScissorsPageId(null); }}
          onInpaintPage={setEmbedTargetPageId}
          onTranslatePage={onTranslatePage}
          onDeletePage={onDeletePage}
          onCopyText={handleCopyText}
          onAddBubble={(pageId) => openManualBubbleEditor(pageId, contextMenu.x, contextMenu.y)}
        />
      )}

      <ManualBubbleModal
        isOpen={Boolean(manualBubbleTarget)}
        onClose={() => setManualBubbleTarget(null)}
        onSave={handleSaveManualBubble}
      />

      <EmbedTranslationModal
        isOpen={Boolean(embedTargetPageId)}
        onClose={() => setEmbedTargetPageId(null)}
        onConfirmEmbed={() => {
          if (embedTargetPageId && onInpaintPage) onInpaintPage(embedTargetPageId);
          setEmbedTargetPageId(null);
        }}
        onAutoCleanAndEmbed={() => {
          if (embedTargetPageId && onAutoCleanAndEmbed) onAutoCleanAndEmbed(embedTargetPageId);
          setEmbedTargetPageId(null);
        }}
      />
    </main>
  );
};
