import React, { useEffect, useRef } from 'react';
import { Scissors, Crop, Trash2, Sparkles, Copy, X, Eraser, Paintbrush, Layers, MessageSquarePlus } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  pageId: string;
  pageIndex: number;
  onClose: () => void;
  onStartCrop: (pageId: string) => void;
  onStartScissors: (pageId: string) => void;
  onTranslatePage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onCopyText: (pageId: string) => void;
  onAddBubble: (pageId: string) => void;
  onStartEraser: (pageId: string) => void;
  onStartPaint: (pageId: string) => void;
  onInpaintPage: (pageId: string) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  pageId,
  pageIndex,
  onClose,
  onStartCrop,
  onStartScissors,
  onTranslatePage,
  onDeletePage,
  onCopyText,
  onAddBubble,
  onStartEraser,
  onStartPaint,
  onInpaintPage,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', onClose);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', onClose);
    };
  }, [onClose]);

  // Adjust coordinates if menu would overflow screen
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const menuW = 240;
  const menuH = 390;

  const posX = Math.min(x, screenW - menuW - 10);
  const posY = Math.min(y, screenH - menuH - 10);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: posY,
        left: posX,
        zIndex: 9999,
        background: '#0f1422',
        border: '1px solid rgba(6, 182, 212, 0.4)',
        borderRadius: '12px',
        padding: '6px',
        width: `${menuW}px`,
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.85), 0 0 15px rgba(6, 182, 212, 0.2)',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        animation: 'modalEnter 0.15s ease',
        userSelect: 'none',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          padding: '6px 10px',
          fontSize: '0.72rem',
          fontWeight: 700,
          color: 'var(--accent-cyan)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          marginBottom: '4px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>จัดการหน้าที่ {pageIndex + 1}</span>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Scissors Tool */}
      <button
        onClick={() => { onStartScissors(pageId); onClose(); }}
        className="context-menu-item"
        style={menuItemStyle}
      >
        <Scissors size={15} color="#f59e0b" />
        <span>ใช้กรรไกรตัดแบ่งท่อน</span>
      </button>

      {/* Crop Tool */}
      <button
        onClick={() => { onStartCrop(pageId); onClose(); }}
        className="context-menu-item"
        style={menuItemStyle}
      >
        <Crop size={15} color="var(--accent-cyan)" />
        <span>ครอบตัด / ตัดหัว-ท้ายออก</span>
      </button>

      <button
        onClick={() => { onAddBubble(pageId); onClose(); }}
        className="context-menu-item"
        style={menuItemStyle}
      >
        <MessageSquarePlus size={15} color="var(--accent-cyan)" />
        <span>เพิ่มกล่องข้อความตรงนี้</span>
      </button>

      <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '2px 0' }} />

      {/* Eraser Tool */}
      <button
        onClick={() => { onStartEraser(pageId); onClose(); }}
        className="context-menu-item"
        style={menuItemStyle}
      >
        <Eraser size={15} color="#38bdf8" />
        <span>ยางลบ (ลบตัวหนังสือ/รอย)</span>
      </button>

      {/* Paintbrush Tool */}
      <button
        onClick={() => { onStartPaint(pageId); onClose(); }}
        className="context-menu-item"
        style={menuItemStyle}
      >
        <Paintbrush size={15} color="#c084fc" />
        <span>พู่กันสี (แต้มสี/วาดทับ)</span>
      </button>

      {/* Inpaint / Embed Translation to Image */}
      <button
        onClick={() => { onInpaintPage(pageId); onClose(); }}
        className="context-menu-item"
        style={menuItemStyle}
      >
        <Layers size={15} color="#f472b6" />
        <span>ฝังข้อความไทยลงรูปภาพ</span>
      </button>

      <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '2px 0' }} />

      {/* Translate Page */}
      <button
        onClick={() => { onTranslatePage(pageId); onClose(); }}
        className="context-menu-item"
        style={menuItemStyle}
      >
        <Sparkles size={15} color="#a855f7" />
        <span>ตรวจข้อความตกหล่นและแปลเพิ่ม</span>
      </button>

      {/* Copy All Text */}
      <button
        onClick={() => { onCopyText(pageId); onClose(); }}
        className="context-menu-item"
        style={menuItemStyle}
      >
        <Copy size={15} color="#34d399" />
        <span>คัดลอกบทแปลหน้านี้</span>
      </button>

      <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '2px 0' }} />

      {/* Delete Page */}
      <button
        onClick={() => { onDeletePage(pageId); onClose(); }}
        className="context-menu-item"
        style={{ ...menuItemStyle, color: '#f87171' }}
      >
        <Trash2 size={15} color="#f87171" />
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <span>ลบหน้านี้ออก</span>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '3px' }}>
            Delete
          </span>
        </div>
      </button>
    </div>
  );
};

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '7px 10px',
  background: 'transparent',
  border: 'none',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '0.82rem',
  fontWeight: 500,
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
  transition: 'background 0.15s ease',
};
