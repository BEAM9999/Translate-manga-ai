import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { BubbleShape, TextBubble } from '../types';
import { 
  X, 
  Volume2, 
  Edit2, 
  Trash2, 
  Check, 
  Palette,
  Copy,
  Clipboard
} from 'lucide-react';

interface BubbleContextMenuProps {
  x: number;
  y: number;
  bubble: TextBubble;
  onClose: () => void;
  onSelectShape: (shape: BubbleShape) => void;
  onSelectColor: (bgColor: string, textColor: string) => void;
  onStartEdit: () => void;
  onPlayTTS: () => void;
  onDuplicate: () => void;
  onCopyText: () => void;
  onDelete: () => void;
}

interface ShapeOption {
  id: BubbleShape;
  label: string;
  subLabel: string;
  icon: string;
}

const MANGA_SHAPES: ShapeOption[] = [
  { id: 'rounded', label: 'กรอบสี่เหลี่ยมขอบมน', subLabel: 'ฟองพูดทั่วไปมาตรฐาน', icon: '🗨️' },
  { id: 'oval', label: 'กรอบวงรี / ทรงไข่', subLabel: 'ฟองกลมมนคลาสสิก', icon: '💬' },
  { id: 'thought_cloud', label: 'กรอบก้อนเมฆ (ความคิด)', subLabel: 'ตัวละครกำลังคิดในใจ', icon: '☁️' },
  { id: 'shout_spiky', label: 'กรอบหอยเม่น / หนามแหลม', subLabel: 'ตะโกน / ระเบิดพลัง', icon: '💥' },
  { id: 'electric_shock', label: 'กรอบประกายสายฟ้า', subLabel: 'ช็อก / ตกใจสุดขีด', icon: '⚡' },
  { id: 'square', label: 'กรอบสี่เหลี่ยมมุมฉาก', subLabel: 'กล่องบรรยาย / ช่องคิด', icon: '📜' },
  { id: 'whisper_dashed', label: 'กรอบเส้นประ (กระซิบ)', subLabel: 'เสียงแผ่วเบา / หม่นหมอง', icon: '👻' },
  { id: 'transparent_sfx', label: 'ไร้กรอบ (ตัวหนังสือลอย SFX)', subLabel: 'เอฟเฟกต์เสียงลายเส้น', icon: '✨' },
];

const COLOR_PRESETS = [
  { id: 'white', label: 'ขาวโปร่งแสง (ค่าเริ่มต้น 85%)', bg: '#ffffff', text: '#ffffff', swatch: 'rgba(255, 255, 255, 0.85)', border: '#38bdf8' },
  { id: 'dark', label: 'ดำโปร่งแสง 85%', bg: '#000000', text: '#ffffff', swatch: 'rgba(15, 23, 42, 0.85)', border: '#475569' },
  { id: 'yellow', label: 'เหลือง Comic', bg: '#f59e0b', text: '#ffffff', swatch: 'rgba(245, 158, 11, 0.85)', border: '#ca8a04' },
  { id: 'red', label: 'แดงตะโกน', bg: '#ef4444', text: '#ffffff', swatch: 'rgba(239, 68, 68, 0.85)', border: '#b91c1c' },
  { id: 'purple', label: 'ม่วงมืดมน', bg: '#7c3aed', text: '#ffffff', swatch: 'rgba(124, 58, 237, 0.85)', border: '#7e22ce' },
  { id: 'transparent', label: 'โปร่งใส 100%', bg: 'transparent', text: '#ffffff', swatch: 'transparent', border: 'dashed #06b6d4' },
];

export const BubbleContextMenu: React.FC<BubbleContextMenuProps> = ({
  x,
  y,
  bubble,
  onClose,
  onSelectShape,
  onSelectColor,
  onStartEdit,
  onPlayTTS,
  onDuplicate,
  onCopyText,
  onDelete,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [hoveredColor, setHoveredColor] = useState<string | null>(null);

  // Close on outside click
  useEffect(() => {
    let timer: NodeJS.Timeout;
    const handlePointerDown = (e: PointerEvent | MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Small delay so the opening click doesn't immediately close the menu
    timer = setTimeout(() => {
      window.addEventListener('pointerdown', handlePointerDown);
      window.addEventListener('scroll', onClose, { passive: true });
    }, 60);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', onClose);
    };
  }, [onClose]);

  // Adjust coordinates if menu overflows window
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const menuW = 260;
  const menuH = 540;

  const posX = Math.max(10, Math.min(x, screenW - menuW - 14));
  const posY = Math.max(10, Math.min(y, screenH - menuH - 14));

  const activeShape = bubble.bubble_shape || (bubble.bubble_type === 'thought' ? 'thought_cloud' : 'rounded');

  const menuContent = (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: posY,
        left: posX,
        zIndex: 999999,
        background: '#0d111d',
        border: '1px solid rgba(6, 182, 212, 0.45)',
        borderRadius: '12px',
        padding: '6px',
        width: `${menuW}px`,
        boxShadow: '0 16px 48px rgba(0, 0, 0, 0.95), 0 0 20px rgba(6, 182, 212, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        animation: 'modalEnter 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
        userSelect: 'none',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        backdropFilter: 'blur(16px)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 10px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: '3px',
        }}
      >
        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Palette size={13} /> เลือกแบบกรอบคำพูดมังงะ
        </span>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px', display: 'flex' }}
        >
          <X size={13} />
        </button>
      </div>

      {/* Manga Shapes Vertical List (สไตล์ Windows Context Menu เรียงบนลงล่าง) */}
      <div 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '2px', 
          maxHeight: '230px', 
          overflowY: 'auto',
          paddingRight: '2px' 
        }}
      >
        {MANGA_SHAPES.map((shape) => {
          const isSelected = activeShape === shape.id;
          return (
            <div
              key={shape.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectShape(shape.id);
                onClose();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                borderRadius: '6px',
                background: isSelected ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                border: isSelected ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid transparent',
                color: isSelected ? '#38bdf8' : '#f1f5f9',
                fontSize: '0.78rem',
                cursor: 'pointer',
                transition: 'background 0.12s ease',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255, 255, 255, 0.07)';
              }}
              onMouseLeave={(e) => {
                if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
              title={shape.subLabel}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1rem', width: '20px', textAlign: 'center' }}>{shape.icon}</span>
                <span style={{ fontWeight: isSelected ? 700 : 500 }}>{shape.label}</span>
              </div>
              {isSelected && <Check size={14} color="var(--accent-cyan)" />}
            </div>
          );
        })}
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.08)', margin: '4px 0' }} />

      {/* Background Color Swatches */}
      <div style={{ padding: '4px 8px' }}>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: 700, marginBottom: '6px' }}>
          สีพื้นหลัง (Background Tone):
        </div>
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'space-between' }}>
          {COLOR_PRESETS.map((preset) => {
            const isCurrent = (bubble.bg_color || '#ffffff') === preset.bg;
            return (
              <div
                key={preset.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectColor(preset.bg, preset.text);
                  onClose();
                }}
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '6px',
                  backgroundColor: preset.swatch,
                  border: isCurrent ? '2px solid #38bdf8' : `1.5px ${preset.border}`,
                  boxShadow: isCurrent ? '0 0 8px rgba(6, 182, 212, 0.6)' : 'none',
                  cursor: 'pointer',
                  transform: isCurrent ? 'scale(1.12)' : 'scale(1)',
                  transition: 'all 0.12s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title={preset.label}
              >
                {isCurrent && <Check size={12} color={preset.id === 'white' ? '#000000' : '#ffffff'} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.08)', margin: '4px 0' }} />

      {/* Actions (Windows style vertical action rows) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {/* Edit Action */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onStartEdit();
            onClose();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 10px',
            borderRadius: '6px',
            color: '#facc15',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(250, 204, 21, 0.15)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <Edit2 size={13} />
          <span>แก้ไขคำแปล (ดับเบิ้ลคลิก)</span>
        </div>

        <div
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
            onClose();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 10px',
            borderRadius: '6px',
            color: '#c084fc',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(192, 132, 252, 0.15)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <Copy size={13} />
          <span>ทำสำเนากล่องข้อความ</span>
        </div>

        <div
          onClick={(e) => {
            e.stopPropagation();
            onCopyText();
            onClose();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 10px',
            borderRadius: '6px',
            color: '#34d399',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(52, 211, 153, 0.15)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <Clipboard size={13} />
          <span>คัดลอกข้อความไป Clipboard</span>
        </div>

        {/* TTS Action */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onPlayTTS();
            onClose();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 10px',
            borderRadius: '6px',
            color: '#38bdf8',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(56, 189, 248, 0.15)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <Volume2 size={13} />
          <span>ฟังเสียงพากย์ด้วย AI Neural TTS</span>
        </div>

        {/* Delete Action */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
            onClose();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 10px',
            borderRadius: '6px',
            color: '#f87171',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(239, 68, 68, 0.15)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <Trash2 size={13} />
          <span>ลบกล่องข้อความนี้</span>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(menuContent, document.body);
};
