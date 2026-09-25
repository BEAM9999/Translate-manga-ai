import React, { useState, useRef, useEffect } from 'react';
import { Check, RotateCcw, X, Scissors, Move } from 'lucide-react';
import { MangaPage } from '../types';

interface CropOverlayProps {
  page: MangaPage;
  onApplyCrop: (pageId: string, cropRect: { top: number; left: number; width: number; height: number }) => void;
  onCancel: () => void;
}

export const CropOverlay: React.FC<CropOverlayProps> = ({
  page,
  onApplyCrop,
  onCancel,
}) => {
  // Start from EXACT 0 (100% full image) - No auto-guessing!
  const [crop, setCrop] = useState({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const activeHandleRef = useRef<string | null>(null);
  const startPosRef = useRef<{ x: number; y: number; crop: typeof crop }>({ x: 0, y: 0, crop });

  const handleMouseDown = (handle: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    activeHandleRef.current = handle;
    startPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      crop: { ...crop },
    };
  };

  const handleApply = () => {
    // If nothing cropped (all 0), just cancel
    if (crop.top === 0 && crop.bottom === 0 && crop.left === 0 && crop.right === 0) {
      onCancel();
      return;
    }

    // Convert to pixel dimensions
    const topPx = (crop.top / 100) * page.height;
    const leftPx = (crop.left / 100) * page.width;
    const rightPx = (crop.right / 100) * page.width;
    const bottomPx = (crop.bottom / 100) * page.height;

    const widthPx = Math.max(10, page.width - leftPx - rightPx);
    const heightPx = Math.max(10, page.height - topPx - bottomPx);

    onApplyCrop(page.id, {
      top: Math.round(topPx),
      left: Math.round(leftPx),
      width: Math.round(widthPx),
      height: Math.round(heightPx),
    });
  };

  // Keyboard shortcut: Press Enter to Apply Crop, Escape to Cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleApply();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [crop, page]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!activeHandleRef.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const deltaX = ((e.clientX - startPosRef.current.x) / rect.width) * 100;
      const deltaY = ((e.clientY - startPosRef.current.y) / rect.height) * 100;
      const initial = startPosRef.current.crop;

      setCrop((prev) => {
        const next = { ...prev };
        const handle = activeHandleRef.current;

        if (handle === 'top' || handle === 'top-left' || handle === 'top-right') {
          next.top = Math.max(0, Math.min(100 - initial.bottom - 5, initial.top + deltaY));
        }
        if (handle === 'bottom' || handle === 'bottom-left' || handle === 'bottom-right') {
          next.bottom = Math.max(0, Math.min(100 - initial.top - 5, initial.bottom - deltaY));
        }
        if (handle === 'left' || handle === 'top-left' || handle === 'bottom-left') {
          next.left = Math.max(0, Math.min(100 - initial.right - 5, initial.left + deltaX));
        }
        if (handle === 'right' || handle === 'top-right' || handle === 'bottom-right') {
          next.right = Math.max(0, Math.min(100 - initial.left - 5, initial.right - deltaX));
        }

        return next;
      });
    };

    const handleMouseUp = () => {
      activeHandleRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleReset = () => {
    setCrop({ top: 0, bottom: 0, left: 0, right: 0 });
  };

  const cropHeightPct = 100 - crop.top - crop.bottom;
  const cropWidthPct = 100 - crop.left - crop.right;
  const hasChanges = crop.top > 0 || crop.bottom > 0 || crop.left > 0 || crop.right > 0;

  return (
    <div 
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        userSelect: 'none',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 4 Dimmed Excluded Borders - Only visible when user drags in */}
      {crop.top > 0 && (
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: `${crop.top}%`,
            background: 'rgba(0, 0, 0, 0.82)',
            backdropFilter: 'blur(3px)',
            borderBottom: '2px solid #ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f87171',
            fontSize: '0.78rem',
            fontWeight: 700,
          }}
        >
          ✂️ ลบส่วนหัวออก ({Math.round((crop.top / 100) * page.height)}px)
        </div>
      )}

      {crop.bottom > 0 && (
        <div 
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${crop.bottom}%`,
            background: 'rgba(0, 0, 0, 0.82)',
            backdropFilter: 'blur(3px)',
            borderTop: '2px solid #ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f87171',
            fontSize: '0.78rem',
            fontWeight: 700,
          }}
        >
          ✂️ ลบส่วนท้ายออก ({Math.round((crop.bottom / 100) * page.height)}px)
        </div>
      )}

      {crop.left > 0 && (
        <div 
          style={{
            position: 'absolute',
            top: `${crop.top}%`,
            bottom: `${crop.bottom}%`,
            left: 0,
            width: `${crop.left}%`,
            background: 'rgba(0, 0, 0, 0.82)',
            backdropFilter: 'blur(3px)',
            borderRight: '2px solid #ef4444',
          }}
        />
      )}

      {crop.right > 0 && (
        <div 
          style={{
            position: 'absolute',
            top: `${crop.top}%`,
            bottom: `${crop.bottom}%`,
            right: 0,
            width: `${crop.right}%`,
            background: 'rgba(0, 0, 0, 0.82)',
            backdropFilter: 'blur(3px)',
            borderLeft: '2px solid #ef4444',
          }}
        />
      )}

      {/* Active Crop Box (The kept region) */}
      <div
        style={{
          position: 'absolute',
          top: `${crop.top}%`,
          left: `${crop.left}%`,
          width: `${cropWidthPct}%`,
          height: `${cropHeightPct}%`,
          boxShadow: '0 0 0 2px #06b6d4, 0 0 20px rgba(6, 182, 212, 0.4)',
          pointerEvents: 'none',
        }}
      >
        {/* Dimension Label */}
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            background: 'rgba(6, 182, 212, 0.95)',
            color: '#000000',
            fontWeight: 800,
            fontSize: '0.75rem',
            padding: '2px 8px',
            borderRadius: '4px',
          }}
        >
          {Math.round((cropWidthPct / 100) * page.width)} × {Math.round((cropHeightPct / 100) * page.height)} px
        </div>
      </div>

      {/* Drag Handles */}
      {/* Top Handle */}
      <div
        onMouseDown={(e) => handleMouseDown('top', e)}
        style={{
          position: 'absolute',
          top: `calc(${crop.top}% - 8px)`,
          left: `${crop.left + cropWidthPct / 2}%`,
          transform: 'translateX(-50%)',
          width: '48px',
          height: '16px',
          background: '#06b6d4',
          borderRadius: '4px',
          cursor: 'ns-resize',
          zIndex: 60,
          boxShadow: '0 0 8px rgba(0,0,0,0.8)',
        }}
      />

      {/* Bottom Handle */}
      <div
        onMouseDown={(e) => handleMouseDown('bottom', e)}
        style={{
          position: 'absolute',
          bottom: `calc(${crop.bottom}% - 8px)`,
          left: `${crop.left + cropWidthPct / 2}%`,
          transform: 'translateX(-50%)',
          width: '48px',
          height: '16px',
          background: '#06b6d4',
          borderRadius: '4px',
          cursor: 'ns-resize',
          zIndex: 60,
          boxShadow: '0 0 8px rgba(0,0,0,0.8)',
        }}
      />

      {/* Left Handle */}
      <div
        onMouseDown={(e) => handleMouseDown('left', e)}
        style={{
          position: 'absolute',
          top: `${crop.top + cropHeightPct / 2}%`,
          left: `calc(${crop.left}% - 8px)`,
          transform: 'translateY(-50%)',
          width: '16px',
          height: '48px',
          background: '#06b6d4',
          borderRadius: '4px',
          cursor: 'ew-resize',
          zIndex: 60,
          boxShadow: '0 0 8px rgba(0,0,0,0.8)',
        }}
      />

      {/* Right Handle */}
      <div
        onMouseDown={(e) => handleMouseDown('right', e)}
        style={{
          position: 'absolute',
          top: `${crop.top + cropHeightPct / 2}%`,
          right: `calc(${crop.right}% - 8px)`,
          transform: 'translateY(-50%)',
          width: '16px',
          height: '48px',
          background: '#06b6d4',
          borderRadius: '4px',
          cursor: 'ew-resize',
          zIndex: 60,
          boxShadow: '0 0 8px rgba(0,0,0,0.8)',
        }}
      />

      {/* Floating Action Bar at Center-Bottom */}
      <div
        style={{
          position: 'absolute',
          top: `${Math.min(92, Math.max(12, crop.top + cropHeightPct - 12))}%`,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#0f1422',
          border: '1px solid #06b6d4',
          borderRadius: '24px',
          padding: '6px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.95)',
          zIndex: 70,
        }}
      >
        <button
          onClick={handleApply}
          style={{
            background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '16px',
            padding: '6px 14px',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Check size={14} /> ตัดภาพเลย (กด Enter)
        </button>

        {hasChanges && (
          <button
            onClick={handleReset}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '16px',
              padding: '6px 12px',
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="ดึงขยายกลับมาเต็มรูปภาพ"
          >
            <RotateCcw size={13} /> รีเซ็ต
          </button>
        )}

        <button
          onClick={onCancel}
          style={{
            background: 'transparent',
            color: 'var(--text-muted)',
            border: 'none',
            borderRadius: '16px',
            padding: '6px 10px',
            fontSize: '0.78rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
          }}
        >
          <X size={14} /> ยกเลิก (Esc)
        </button>
      </div>
    </div>
  );
};
