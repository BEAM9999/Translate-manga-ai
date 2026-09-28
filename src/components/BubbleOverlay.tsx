import React, { useState, useRef, useEffect } from 'react';
import { TextBubble, ViewMode, AppSettings, BubbleShape } from '../types';
import {
  Edit2,
  Check,
  Volume2,
  Trash2,
  Move,
  Palette,
  Sparkles
} from 'lucide-react';
import { tts } from '../services/ttsService';
import { BubbleContextMenu } from './BubbleContextMenu';
import { isTextEditingTarget } from '../utils/keyboardTarget';

interface BubbleOverlayProps {
  pageId: string;
  bubble: TextBubble;
  viewMode: ViewMode;
  settings: AppSettings;
  isActive: boolean;
  onSelect: () => void;
  onDeselect?: () => void;
  onUpdateBubble: (updated: TextBubble) => void;
  onCommitBubble?: (updated: TextBubble) => void;
  onDeleteBubble?: (bubbleId: string) => void;
  onDuplicateBubble?: (bubble: TextBubble, mode: 'drag' | 'offset') => TextBubble | null;
  onCopyBubbleText?: (bubble: TextBubble) => void;
  pageWidth: number;
  pageHeight: number;
}

type ResizeHandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const BubbleOverlay: React.FC<BubbleOverlayProps> = ({
  pageId,
  bubble,
  viewMode,
  settings,
  isActive,
  onSelect,
  onDeselect,
  onUpdateBubble,
  onCommitBubble,
  onDeleteBubble,
  onDuplicateBubble,
  onCopyBubbleText,
  pageWidth,
  pageHeight,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(bubble.translated_text);
  const [isHovered, setIsHovered] = useState(false);
  const [bubbleMenuPos, setBubbleMenuPos] = useState<{ x: number; y: number } | null>(null);

  // Sync editText when bubble.translated_text changes (e.g. on Undo / Redo)
  useEffect(() => {
    setEditText(bubble.translated_text);
  }, [bubble.translated_text]);

  // Drag & Resize Modes
  const [dragMode, setDragMode] = useState<'move' | ResizeHandleType | null>(null);
  const latestBubbleRef = useRef<TextBubble>(bubble);
  const dragBubbleRef = useRef<TextBubble>(bubble);
  latestBubbleRef.current = bubble;

  // Track rendered on-screen pixel size for 100% responsive font fitting
  const bubbleContainerRef = useRef<HTMLDivElement>(null);
  const [renderedSize, setRenderedSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    const el = bubbleContainerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setRenderedSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateSize);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, []);

  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    initialBox: [number, number, number, number];
    containerW: number;
    containerH: number;
    hasMoved: boolean;
    createdDuplicate: boolean;
  }>({
    clientX: 0,
    clientY: 0,
    initialBox: bubble.box_2d,
    containerW: pageWidth || 800,
    containerH: pageHeight || 1200,
    hasMoved: false,
    createdDuplicate: false,
  });

  // Coordinates normalized 0-1000 to percentages
  let [ymin, xmin, ymax, xmax] = bubble.box_2d;

  // Handle float normalization (if AI returned 0.0-1.0 instead of 0-1000)
  if (ymin <= 1.0 && ymax <= 1.0 && ymax > 0) {
    ymin *= 1000;
    xmin *= 1000;
    ymax *= 1000;
    xmax *= 1000;
  }

  // Ensure valid min/max
  if (ymin > ymax) { const temp = ymin; ymin = ymax; ymax = temp; }
  if (xmin > xmax) { const temp = xmin; xmin = xmax; xmax = temp; }

  const topPct = (ymin / 1000) * 100;
  const leftPct = (xmin / 1000) * 100;
  const widthPct = Math.max(0.2, ((xmax - xmin) / 1000) * 100);
  const heightPct = Math.max(0.2, ((ymax - ymin) / 1000) * 100);

  // Helper to start Drag or Resize
  const initDrag = (e: React.MouseEvent, mode: 'move' | ResizeHandleType) => {
    if (isEditing) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect();

    let dragBubble = latestBubbleRef.current;
    let createdDuplicate = false;
    if (mode === 'move' && e.altKey && onDuplicateBubble) {
      const duplicate = onDuplicateBubble(dragBubble, 'drag');
      if (duplicate) {
        dragBubble = duplicate;
        createdDuplicate = true;
      }
    }
    dragBubbleRef.current = dragBubble;

    const parentElem = document.getElementById(`manga-page-${pageId}`);
    // Use the manga image element specifically, NOT the full wrapper (which includes the header toolbar)
    // Using the wrapper height causes Y-axis scaling to be off because of the header offset
    const imgElem = parentElem?.querySelector('img.manga-image-elem');
    const rect = imgElem?.getBoundingClientRect() ?? parentElem?.getBoundingClientRect();
    const containerW = rect?.width || (pageWidth || 800);
    const containerH = rect?.height || (pageHeight || 1200);

    setDragMode(mode);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      initialBox: dragBubble.box_2d,
      containerW,
      containerH,
      hasMoved: false,
      createdDuplicate,
    };
  };

  // Global MouseMove & MouseUp listener for 100% Free Unlocked Resizing
  useEffect(() => {
    if (!dragMode) return;

    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY, initialBox, containerW, containerH } = dragStartRef.current;
      const [iYmin, iXmin, iYmax, iXmax] = initialBox;

      const deltaX = ((e.clientX - clientX) / containerW) * 1000;
      const deltaY = ((e.clientY - clientY) / containerH) * 1000;

      if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
        dragStartRef.current.hasMoved = true;
      }

      const MIN_SIZE = 2; // Allow resizing down to near-zero (1px screen equivalent)

      let newYmin = iYmin;
      let newXmin = iXmin;
      let newYmax = iYmax;
      let newXmax = iXmax;

      if (dragMode === 'move') {
        const boxW = iXmax - iXmin;
        const boxH = iYmax - iYmin;
        newXmin = Math.max(0, Math.min(1000 - boxW, iXmin + deltaX));
        newYmin = Math.max(0, Math.min(1000 - boxH, iYmin + deltaY));
        newXmax = newXmin + boxW;
        newYmax = newYmin + boxH;
      } else {
        if (dragMode.includes('w')) {
          newXmin = Math.max(0, Math.min(iXmax - MIN_SIZE, iXmin + deltaX));
        }
        if (dragMode.includes('e')) {
          newXmax = Math.min(1000, Math.max(iXmin + MIN_SIZE, iXmax + deltaX));
        }
        if (dragMode.includes('n')) {
          newYmin = Math.max(0, Math.min(iYmax - MIN_SIZE, iYmin + deltaY));
        }
        if (dragMode.includes('s')) {
          newYmax = Math.min(1000, Math.max(iYmin + MIN_SIZE, iYmax + deltaY));
        }
      }

      const updatedObj: TextBubble = {
        ...dragBubbleRef.current,
        box_2d: [
          Math.round(Math.min(newYmin, newYmax)),
          Math.round(Math.min(newXmin, newXmax)),
          Math.round(Math.max(newYmin, newYmax)),
          Math.round(Math.max(newXmin, newXmax)),
        ],
        user_edited: true,
      };

      dragBubbleRef.current = updatedObj;
      onUpdateBubble(updatedObj);
    };

    const handleMouseUp = () => {
      setDragMode(null);
      if (dragStartRef.current.hasMoved || dragStartRef.current.createdDuplicate) {
        if (onCommitBubble) {
          onCommitBubble(dragBubbleRef.current);
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragMode, onUpdateBubble, onCommitBubble]);

  // Keyboard shortcut: Press Enter or Escape to confirm/save & deselect
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTextEditingTarget(e.target) && e.key !== 'Escape') return;

      if (e.key === 'Enter' && !e.shiftKey) {
        if (isEditing) {
          e.preventDefault();
          const updated: TextBubble = {
            ...latestBubbleRef.current,
            translated_text: editText,
            user_edited: true,
          };
          if (onCommitBubble) onCommitBubble(updated);
          else onUpdateBubble(updated);
          setIsEditing(false);
        } else {
          if (onCommitBubble) onCommitBubble(latestBubbleRef.current);
          if (onDeselect) onDeselect();
        }
      } else if (e.key === 'Escape') {
        if (isEditing) {
          setIsEditing(false);
          setEditText(latestBubbleRef.current.translated_text);
        } else if (onDeselect) {
          onDeselect();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, isEditing, editText, onUpdateBubble, onCommitBubble, onDeselect]);

  // Quick Dimension Modifiers
  const adjustHeight = (delta: number) => {
    const newH = Math.max(2, (ymax - ymin) + delta);
    const midY = (ymin + ymax) / 2;
    const nextYmin = Math.max(0, Math.round(midY - newH / 2));
    const nextYmax = Math.min(1000, Math.round(midY + newH / 2));
    const updated: TextBubble = {
      ...bubble,
      box_2d: [nextYmin, xmin, nextYmax, xmax],
      user_edited: true,
    };
    if (onCommitBubble) onCommitBubble(updated);
    else onUpdateBubble(updated);
  };

  const adjustWidth = (delta: number) => {
    const newW = Math.max(2, (xmax - xmin) + delta);
    const midX = (xmin + xmax) / 2;
    const nextXmin = Math.max(0, Math.round(midX - newW / 2));
    const nextXmax = Math.min(1000, Math.round(midX + newW / 2));
    const updated: TextBubble = {
      ...bubble,
      box_2d: [ymin, nextXmin, ymax, nextXmax],
      user_edited: true,
    };
    if (onCommitBubble) onCommitBubble(updated);
    else onUpdateBubble(updated);
  };

  // Intercept Right Click on Text Bubble -> Open Manga Shapes Menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevents page context menu from popping up!
    onSelect();
    setBubbleMenuPos({ x: e.clientX, y: e.clientY });
  };

  // Hide in pure original mode unless hovered in 'hover' mode
  if (viewMode === 'original' && !isHovered) {
    return (
      <div
        className="manga-bubble-overlay"
        style={{
          top: `${topPct}%`,
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          height: `${heightPct}%`,
          background: 'transparent',
          cursor: 'pointer',
        }}
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={`${bubble.speaker}: ${bubble.translated_text}`}
      />
    );
  }

  const handleSaveEdit = (e: React.MouseEvent | React.FormEvent) => {
    e.stopPropagation();
    const updated: TextBubble = {
      ...bubble,
      translated_text: editText,
      user_edited: true
    };
    if (onCommitBubble) onCommitBubble(updated);
    else onUpdateBubble(updated);
    setIsEditing(false);
  };

  const handlePlayVoice = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    tts.speak(bubble.translated_text, 'th-TH', bubble.speaker, settings.selectedVoiceName);
  };

  const isSFX = bubble.bubble_type === 'sfx';
  const isTransparent = bubble.bg_color === 'transparent' || bubble.bubble_shape === 'transparent_sfx';

  const backdropOpacity = settings.bubbleOpacity || 0.85;

  // Resolve background color: White Semi-Transparent Glass with high whiteness (85%) as requested
  let customBgColor = `rgba(255, 255, 255, ${backdropOpacity})`;
  if (bubble.bg_color && bubble.bg_color !== 'transparent') {
    if (bubble.bg_color === '#000000') {
      customBgColor = `rgba(15, 20, 30, ${backdropOpacity})`;
    } else if (bubble.bg_color === '#f59e0b') {
      customBgColor = `rgba(245, 158, 11, ${backdropOpacity})`;
    } else if (bubble.bg_color === '#ef4444') {
      customBgColor = `rgba(239, 68, 68, ${backdropOpacity})`;
    } else if (bubble.bg_color === '#7c3aed') {
      customBgColor = `rgba(124, 58, 237, ${backdropOpacity})`;
    } else if (bubble.bg_color === '#ffffff' || bubble.bg_color === 'auto') {
      customBgColor = `rgba(255, 255, 255, ${backdropOpacity})`;
    } else {
      customBgColor = bubble.bg_color;
    }
  }

  const isDarkBubble = bubble.bg_color === '#000000';
  const textColor = isSFX
    ? '#f59e0b'
    : isDarkBubble
      ? '#ffffff'
      : (bubble.text_color && bubble.text_color !== '#ffffff' ? bubble.text_color : '#000000');

  // Toggle Shape from Menu
  const handleSelectShape = (shape: BubbleShape) => {
    const updated: TextBubble = {
      ...bubble,
      bubble_shape: shape,
      user_edited: true,
    };
    if (onCommitBubble) onCommitBubble(updated);
    else onUpdateBubble(updated);
  };

  // Set Color from Menu
  const handleSelectColor = (bgColor: string, selTextColor: string) => {
    const updated: TextBubble = {
      ...bubble,
      bg_color: bgColor,
      text_color: selTextColor,
      user_edited: true,
    };
    if (onCommitBubble) onCommitBubble(updated);
    else onUpdateBubble(updated);
  };

  // In hover mode, show original text if hovered, or translated if not
  const displayText = (viewMode === 'hover' && isHovered)
    ? bubble.source_text
    : bubble.translated_text;

  // Calculate dynamic font size based on ACTUAL on-screen rendered dimensions (100% responsive)
  const actualW = renderedSize.width || ((widthPct / 100) * 780);
  const actualH = renderedSize.height || ((heightPct / 100) * 1100);
  const actualArea = actualW * actualH;
  const textLength = Math.max(1, displayText.length);
  const charArea = actualArea / textLength;
  let dynamicFontSizePx = Math.sqrt(charArea) * 0.90 * (settings.fontSizeScale || 1.0);

  // Clamp font size to fit gracefully inside rendered box height and width
  const maxHFont = Math.max(8, actualH * 0.38);
  const maxWFont = Math.max(8, actualW * 0.45);
  dynamicFontSizePx = Math.max(9, Math.min(maxHFont, maxWFont, dynamicFontSizePx, 38));

  const showControls = (isHovered || isActive) && !isEditing;

  // Compute Manga Shape Styling
  const bubbleShape: BubbleShape = bubble.bubble_shape || (bubble.bubble_type === 'thought' ? 'thought_cloud' : 'rounded');

  let shapeBorderRadius = '8px';
  let shapeClipPath: string | undefined = undefined;
  let shapeBorder = isDarkBubble ? '1.5px solid rgba(255, 255, 255, 0.4)' : '1.5px solid rgba(0, 0, 0, 0.6)';

  if (bubbleShape === 'oval') {
    shapeBorderRadius = '50%';
  } else if (bubbleShape === 'square') {
    shapeBorderRadius = '0px';
    shapeBorder = isDarkBubble ? '2px solid rgba(255, 255, 255, 0.6)' : '2px solid rgba(0, 0, 0, 0.8)';
  } else if (bubbleShape === 'thought_cloud') {
    shapeBorderRadius = '28px';
    shapeBorder = isDarkBubble ? '2.5px dotted rgba(255, 255, 255, 0.9)' : '2.5px dotted rgba(0, 0, 0, 0.9)';
  } else if (bubbleShape === 'shout_spiky') {
    shapeBorderRadius = '4px';
    shapeClipPath = 'polygon(50% 0%, 63% 15%, 82% 4%, 80% 24%, 98% 28%, 86% 45%, 100% 60%, 83% 70%, 92% 90%, 72% 84%, 60% 100%, 48% 85%, 32% 98%, 26% 80%, 6% 88%, 15% 68%, 0% 55%, 16% 42%, 3% 25%, 22% 24%, 25% 4%, 40% 16%)';
  } else if (bubbleShape === 'electric_shock') {
    shapeBorderRadius = '4px';
    shapeClipPath = 'polygon(0% 15%, 15% 0%, 35% 12%, 60% 0%, 80% 14%, 100% 0%, 90% 35%, 100% 60%, 85% 85%, 100% 100%, 65% 90%, 45% 100%, 25% 88%, 0% 100%, 12% 65%, 0% 40%)';
  } else if (bubbleShape === 'whisper_dashed') {
    shapeBorderRadius = '10px';
    shapeBorder = isDarkBubble ? '2px dashed rgba(255, 255, 255, 0.8)' : '2px dashed rgba(0, 0, 0, 0.8)';
  } else if (bubbleShape === 'transparent_sfx') {
    shapeBorder = 'none';
  }

  return (
    <>
      <div
        ref={bubbleContainerRef}
        className={`manga-bubble-overlay ${isActive ? 'bubble-active' : ''}`}
        style={{
          top: `${topPct}%`,
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          height: `${heightPct}%`,
          zIndex: isActive ? 35 : isEditing ? 40 : 15,
          cursor: isEditing ? 'text' : (dragMode === 'move' ? 'grabbing' : 'grab'),
          userSelect: 'none',
          boxSizing: 'border-box',
        }}
        onMouseDown={(e) => initDrag(e, 'move')}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
      >
        {/* Semi-transparent Glass Backdrop with Custom Manga Shape */}
        {!isSFX && !isTransparent && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: customBgColor,
              backdropFilter: 'blur(3px)',
              border: shapeBorder,
              borderRadius: shapeBorderRadius,
              clipPath: shapeClipPath,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              zIndex: 1,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Visual Active Outline */}
        {showControls && (
          <div
            style={{
              position: 'absolute',
              inset: -2,
              border: isActive ? '2px solid var(--accent-cyan)' : '1.5px dashed var(--accent-cyan)',
              borderRadius: shapeBorderRadius || '6px',
              pointerEvents: 'none',
              zIndex: 20,
              boxShadow: isActive ? '0 0 12px rgba(6, 182, 212, 0.6)' : '0 0 6px rgba(6, 182, 212, 0.3)',
            }}
          />
        )}

        {/* 4 Interactive Full-Border Drag Zones */}
        {showControls && (
          <>
            {/* Top Edge Bar */}
            <div
              onMouseDown={(e) => initDrag(e, 'n')}
              style={{
                position: 'absolute',
                top: -6,
                left: 10,
                right: 10,
                height: 12,
                cursor: 'ns-resize',
                zIndex: 25,
              }}
              title="ลากเพื่อยืดขอบบนขึ้น/ลง"
            />

            {/* Bottom Edge Bar */}
            <div
              onMouseDown={(e) => initDrag(e, 's')}
              style={{
                position: 'absolute',
                bottom: -6,
                left: 10,
                right: 10,
                height: 12,
                cursor: 'ns-resize',
                zIndex: 25,
              }}
              title="ลากเพื่อยืดขอบล่างขึ้น/ลง"
            />

            {/* Left Edge Bar */}
            <div
              onMouseDown={(e) => initDrag(e, 'w')}
              style={{
                position: 'absolute',
                top: 10,
                bottom: 10,
                left: -6,
                width: 12,
                cursor: 'ew-resize',
                zIndex: 25,
              }}
              title="ลากเพื่อยืดขอบซ้าย"
            />

            {/* Right Edge Bar */}
            <div
              onMouseDown={(e) => initDrag(e, 'e')}
              style={{
                position: 'absolute',
                top: 10,
                bottom: 10,
                right: -6,
                width: 12,
                cursor: 'ew-resize',
                zIndex: 25,
              }}
              title="ลากเพื่อยืดขอบขวา"
            />
          </>
        )}

        {/* 8 Visible High-Precision Resize Handles */}
        {showControls && (
          <>
            {/* Top-Left (NW) */}
            <div
              onMouseDown={(e) => initDrag(e, 'nw')}
              style={{
                position: 'absolute',
                top: -6,
                left: -6,
                width: 12,
                height: 12,
                backgroundColor: 'var(--accent-cyan)',
                border: '1.5px solid #000000',
                borderRadius: '2px',
                cursor: 'nwse-resize',
                zIndex: 30,
                boxShadow: '0 2px 5px rgba(0,0,0,0.8)',
              }}
              title="ยืด/หด มุมบนซ้าย"
            />

            {/* Top-Center (N) */}
            <div
              onMouseDown={(e) => initDrag(e, 'n')}
              style={{
                position: 'absolute',
                top: -6,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 14,
                height: 12,
                backgroundColor: 'var(--accent-cyan)',
                border: '1.5px solid #000000',
                borderRadius: '2px',
                cursor: 'ns-resize',
                zIndex: 30,
                boxShadow: '0 2px 5px rgba(0,0,0,0.8)',
              }}
              title="ยืด/หด ขอบบน (แนวตั้ง)"
            />

            {/* Top-Right (NE) */}
            <div
              onMouseDown={(e) => initDrag(e, 'ne')}
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                width: 12,
                height: 12,
                backgroundColor: 'var(--accent-cyan)',
                border: '1.5px solid #000000',
                borderRadius: '2px',
                cursor: 'nesw-resize',
                zIndex: 30,
                boxShadow: '0 2px 5px rgba(0,0,0,0.8)',
              }}
              title="ยืด/หด มุมบนขวา"
            />

            {/* Middle-Right (E) */}
            <div
              onMouseDown={(e) => initDrag(e, 'e')}
              style={{
                position: 'absolute',
                top: '50%',
                right: -6,
                transform: 'translateY(-50%)',
                width: 12,
                height: 14,
                backgroundColor: 'var(--accent-cyan)',
                border: '1.5px solid #000000',
                borderRadius: '2px',
                cursor: 'ew-resize',
                zIndex: 30,
                boxShadow: '0 2px 5px rgba(0,0,0,0.8)',
              }}
              title="ยืด/หด ขอบขวา (แนวนอน)"
            />

            {/* Bottom-Right (SE) */}
            <div
              onMouseDown={(e) => initDrag(e, 'se')}
              style={{
                position: 'absolute',
                bottom: -6,
                right: -6,
                width: 12,
                height: 12,
                backgroundColor: 'var(--accent-cyan)',
                border: '1.5px solid #000000',
                borderRadius: '2px',
                cursor: 'nwse-resize',
                zIndex: 30,
                boxShadow: '0 2px 5px rgba(0,0,0,0.8)',
              }}
              title="ยืด/หด มุมล่างขวา"
            />

            {/* Bottom-Center (S) */}
            <div
              onMouseDown={(e) => initDrag(e, 's')}
              style={{
                position: 'absolute',
                bottom: -6,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 14,
                height: 12,
                backgroundColor: 'var(--accent-cyan)',
                border: '1.5px solid #000000',
                borderRadius: '2px',
                cursor: 'ns-resize',
                zIndex: 30,
                boxShadow: '0 2px 5px rgba(0,0,0,0.8)',
              }}
              title="ยืด/หด ขอบล่าง (แนวตั้ง)"
            />

            {/* Bottom-Left (SW) */}
            <div
              onMouseDown={(e) => initDrag(e, 'sw')}
              style={{
                position: 'absolute',
                bottom: -6,
                left: -6,
                width: 12,
                height: 12,
                backgroundColor: 'var(--accent-cyan)',
                border: '1.5px solid #000000',
                borderRadius: '2px',
                cursor: 'nesw-resize',
                zIndex: 30,
                boxShadow: '0 2px 5px rgba(0,0,0,0.8)',
              }}
              title="ยืด/หด มุมล่างซ้าย"
            />

            {/* Middle-Left (W) */}
            <div
              onMouseDown={(e) => initDrag(e, 'w')}
              style={{
                position: 'absolute',
                top: '50%',
                left: -6,
                transform: 'translateY(-50%)',
                width: 12,
                height: 14,
                backgroundColor: 'var(--accent-cyan)',
                border: '1.5px solid #000000',
                borderRadius: '2px',
                cursor: 'ew-resize',
                zIndex: 30,
                boxShadow: '0 2px 5px rgba(0,0,0,0.8)',
              }}
              title="ยืด/หด ขอบซ้าย (แนวนอน)"
            />
          </>
        )}

        {/* Bubble Content / Text with Crisp Stroke */}
        {isEditing ? (
          <div
            style={{
              position: 'relative',
              zIndex: 30,
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <textarea
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              style={{
                width: '100%',
                height: '100%',
                fontSize: `${dynamicFontSizePx}px`,
                fontFamily: `var(--font-${settings.fontFamily === 'Sarabun' ? 'thai-clean' : 'thai-comic'})`,
                border: '2px solid var(--accent-cyan)',
                borderRadius: '6px',
                padding: '4px',
                background: 'rgba(15, 20, 34, 0.95)',
                color: '#ffffff',
                resize: 'none',
                outline: 'none',
                textAlign: 'center',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSaveEdit(e);
                }
              }}
            />
            <span style={{ position: 'absolute', bottom: -19, left: 0, color: '#cbd5e1', fontSize: '0.64rem', whiteSpace: 'nowrap' }}>
              Shift + Enter: ขึ้นบรรทัดใหม่
            </span>
            <div style={{ position: 'absolute', bottom: -28, right: 0, display: 'flex', gap: '4px', zIndex: 35 }}>
              <button
                onClick={handleSaveEdit}
                style={{
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px'
                }}
              >
                <Check size={12} /> บันทึก (Enter)
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              position: 'relative',
              zIndex: 10,
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              overflow: 'hidden',
              padding: '2px 4px',
              fontSize: `${dynamicFontSizePx}px`,
              fontFamily: isSFX
                ? 'var(--font-bangers)'
                : settings.fontFamily === 'Sarabun'
                  ? 'var(--font-thai-clean)'
                  : 'var(--font-thai-comic)',
              fontWeight: 800,
              lineHeight: 1.25,
              color: textColor,
              WebkitTextStroke: isSFX ? '1.5px #000000' : isDarkBubble ? '0.5px #000000' : 'none',
              textShadow: isSFX ? '0px 2px 4px rgba(0,0,0,0.85)' : isDarkBubble ? '0 1px 2px rgba(0,0,0,0.8)' : 'none',
            }}
          >
            {displayText}
          </div>
        )}

        {/* Floating Action Controls on Hover / Selection */}
        {showControls && (
          <div
            style={{
              position: 'absolute',
              top: -34,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(15, 20, 34, 0.95)',
              backdropFilter: 'blur(8px)',
              padding: '3px 8px',
              borderRadius: '8px',
              zIndex: 50,
              border: '1px solid rgba(6, 182, 212, 0.4)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.7)',
              whiteSpace: 'nowrap',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span title="คลิกค้างเพื่อย้ายตำแหน่ง, Alt + ลากเพื่อทำสำเนา, หรือลากขอบเพื่อยืดหด" style={{ color: 'var(--text-dim)', cursor: 'grab', display: 'flex', alignItems: 'center' }}>
              <Move size={12} />
            </span>

            <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.15)' }} />

            {/* Quick Vertical Stretch Buttons */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); adjustHeight(35); }}
              title="ยืดความสูงขึ้น (+แนวตั้ง)"
              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', padding: '2px 5px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px' }}
            >
              ↕️+
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); adjustHeight(-35); }}
              title="ลดความสูงลง (-แนวตั้ง)"
              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', padding: '2px 5px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px' }}
            >
              ↕️-
            </button>

            {/* Quick Horizontal Stretch Buttons */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); adjustWidth(35); }}
              title="ยืดความกว้าง (+แนวนอน)"
              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#c084fc', cursor: 'pointer', padding: '2px 5px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px' }}
            >
              ↔️+
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); adjustWidth(-35); }}
              title="ลดความกว้าง (-แนวนอน)"
              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#c084fc', cursor: 'pointer', padding: '2px 5px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px' }}
            >
              ↔️-
            </button>

            <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.15)' }} />

            <button
              onClick={(e) => {
                e.stopPropagation();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setBubbleMenuPos({ x: rect.left, y: rect.bottom + 5 });
              }}
              title="เลือกรูปทรงกรอบมังงะ & สไตล์สี (หรือคลิกขวาที่ตัวหนังสือ)"
              style={{ background: 'rgba(6, 182, 212, 0.15)', border: '1px solid rgba(6, 182, 212, 0.3)', color: 'var(--accent-cyan)', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.72rem', fontWeight: 700 }}
            >
              <Palette size={12} /> ทรงกรอบ
            </button>

            <button
              onClick={handlePlayVoice}
              title="ฟังเสียงพูดด้วย AI Neural Voice (TTS)"
              style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: '2px' }}
            >
              <Volume2 size={13} />
            </button>

            <button
              onClick={() => setIsEditing(true)}
              title="แก้ไขคำแปล (ดับเบิ้ลคลิก)"
              style={{ background: 'transparent', border: 'none', color: '#facc15', cursor: 'pointer', padding: '2px' }}
            >
              <Edit2 size={13} />
            </button>

            {onDeleteBubble && (
              <button
                onClick={() => onDeleteBubble(bubble.id)}
                title="ลบกล่องข้อความนี้ออก"
                style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: '2px' }}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Dedicated Manga Bubble Right-Click Context Menu */}
      {bubbleMenuPos && (
        <BubbleContextMenu
          x={bubbleMenuPos.x}
          y={bubbleMenuPos.y}
          bubble={bubble}
          onClose={() => setBubbleMenuPos(null)}
          onSelectShape={handleSelectShape}
          onSelectColor={handleSelectColor}
          onStartEdit={() => setIsEditing(true)}
          onPlayTTS={handlePlayVoice}
          onDuplicate={() => { onDuplicateBubble?.(bubble, 'offset'); }}
          onCopyText={() => { onCopyBubbleText?.(bubble); }}
          onDelete={() => onDeleteBubble && onDeleteBubble(bubble.id)}
        />
      )}
    </>
  );
};
