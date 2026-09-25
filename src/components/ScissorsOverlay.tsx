import React, { useState, useRef, useEffect } from 'react';
import { Scissors, X } from 'lucide-react';
import { MangaPage } from '../types';

interface ScissorsOverlayProps {
  page: MangaPage;
  onSplitPage: (pageId: string, cutYPx: number) => void;
  onCancel: () => void;
}

export const ScissorsOverlay: React.FC<ScissorsOverlayProps> = ({
  page,
  onSplitPage,
  onCancel,
}) => {
  const [cursorYPct, setCursorYPct] = useState<number>(50);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.max(1, Math.min(99, ((e.clientY - rect.top) / rect.height) * 100));
    setCursorYPct(pct);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    // Instant Split on Click with ZERO alerts or questions!
    const cutYPx = Math.round((cursorYPct / 100) * page.height);
    onSplitPage(page.id, cutYPx);
  };

  // Keyboard shortcut: Escape to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const cutYPx = Math.round((cursorYPct / 100) * page.height);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 55,
        cursor: 'crosshair',
        background: 'rgba(0, 0, 0, 0.2)',
        userSelect: 'none',
      }}
    >
      {/* Top Banner Guide */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 20, 34, 0.95)',
          border: '1px solid #f59e0b',
          borderRadius: '20px',
          padding: '6px 16px',
          color: '#ffffff',
          fontSize: '0.82rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.85)',
          pointerEvents: 'auto',
          zIndex: 60,
        }}
      >
        <Scissors size={15} color="#f59e0b" />
        <span>คลิก 1 ครั้งตรงจุดที่ต้องการตัด ➜ แยกเป็น 2 รูปภาพทันที</span>
        <button
          onClick={(e) => { e.stopPropagation(); onCancel(); }}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
          }}
          title="ยกเลิก (Esc)"
        >
          <X size={14} />
        </button>
      </div>

      {/* Glowing Horizontal Cut Laser Line */}
      <div
        style={{
          position: 'absolute',
          top: `${cursorYPct}%`,
          left: 0,
          right: 0,
          height: '2px',
          background: '#f59e0b',
          boxShadow: '0 0 12px #f59e0b, 0 0 24px #f59e0b',
          pointerEvents: 'none',
        }}
      >
        {/* Scissor Icon badge on the cut line */}
        <div
          style={{
            position: 'absolute',
            left: 16,
            top: -15,
            background: '#f59e0b',
            color: '#000000',
            borderRadius: '50%',
            width: '30px',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(245, 158, 11, 0.9)',
          }}
        >
          <Scissors size={16} />
        </div>

        <div
          style={{
            position: 'absolute',
            right: 16,
            top: -12,
            background: 'rgba(0, 0, 0, 0.85)',
            border: '1px solid #f59e0b',
            color: '#f59e0b',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontWeight: 800,
          }}
        >
          ตัดที่ระดับ {cutYPx} px ({Math.round(cursorYPct)}%)
        </div>
      </div>
    </div>
  );
};
