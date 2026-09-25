import React from 'react';
import { 
  Plus, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  Sparkles,
  Undo2,
  Redo2,
  Link2,
  MousePointer2,
  Eraser,
  Paintbrush,
} from 'lucide-react';

interface SidebarControlsProps {
  onAddPage: () => void;
  zoomScale: number;
  onSetZoomScale: (zoom: number) => void;
  totalPages: number;
  onLoadDemo: () => void;
  onClearAll: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onBridgeAllSeams?: () => void;
  canvasTool: 'pointer' | 'eraser' | 'paint';
  onSetCanvasTool: (tool: 'pointer' | 'eraser' | 'paint') => void;
}

export const SidebarControls: React.FC<SidebarControlsProps> = ({
  onAddPage,
  zoomScale,
  onSetZoomScale,
  totalPages,
  onLoadDemo,
  onClearAll,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onBridgeAllSeams,
  canvasTool,
  onSetCanvasTool,
}) => {
  const handleZoomIn = () => {
    onSetZoomScale(Math.min(200, zoomScale + 15));
  };

  const handleZoomOut = () => {
    onSetZoomScale(Math.max(50, zoomScale - 15));
  };

  const handleResetZoom = () => {
    onSetZoomScale(100);
  };

  return (
    <aside className="left-toolbar">
      {/* Add Page Button */}
      <button 
        className="tool-btn add-page-btn"
        onClick={onAddPage}
        title="เพิ่มรูปภาพหน้าใหม่ (.webp, .png, .jpg) (+)"
      >
        <Plus size={22} />
      </button>

      <div style={{ width: '32px', height: '1px', background: 'var(--border-subtle)' }} />

      {/* Undo Button */}
      <button
        className="tool-btn"
        onClick={onUndo}
        disabled={!canUndo}
        style={{ opacity: canUndo ? 1 : 0.35, cursor: canUndo ? 'pointer' : 'default' }}
        title="ย้อนกลับ (Undo: Ctrl+Z)"
      >
        <Undo2 size={18} />
      </button>

      {/* Redo Button */}
      <button
        className="tool-btn"
        onClick={onRedo}
        disabled={!canRedo}
        style={{ opacity: canRedo ? 1 : 0.35, cursor: canRedo ? 'pointer' : 'default' }}
        title="ทำซ้ำ (Redo: Ctrl+Y)"
      >
        <Redo2 size={18} />
      </button>

      <div style={{ width: '32px', height: '1px', background: 'var(--border-subtle)' }} />

      <button
        className={`tool-btn ${canvasTool === 'pointer' ? 'active' : ''}`}
        onClick={() => onSetCanvasTool('pointer')}
        title="เมาส์ปกติ: เลือก แก้ไข และคลิกขวาจัดการหน้า"
      >
        <MousePointer2 size={18} />
      </button>

      <button
        className={`tool-btn ${canvasTool === 'eraser' ? 'active' : ''}`}
        onClick={() => onSetCanvasTool('eraser')}
        title="ยางลบ: เลือกแล้วคลิกหน้าการ์ตูนเพื่อเริ่มวาด ปรับขนาดได้ในแถบเครื่องมือ"
      >
        <Eraser size={18} />
      </button>

      <button
        className={`tool-btn ${canvasTool === 'paint' ? 'active' : ''}`}
        onClick={() => onSetCanvasTool('paint')}
        title="พู่กัน: เลือกแล้วคลิกหน้าการ์ตูนเพื่อเริ่มวาด ปรับขนาดและสีได้"
      >
        <Paintbrush size={18} />
      </button>

      <div style={{ width: '32px', height: '1px', background: 'var(--border-subtle)' }} />

      {/* Zoom In */}
      <button 
        className="tool-btn"
        onClick={handleZoomIn}
        title="ขยายขนาดรูปภาพ (+15%)"
      >
        <ZoomIn size={18} />
      </button>

      {/* Zoom Indicator / Reset */}
      <button 
        className="tool-btn"
        onClick={handleResetZoom}
        title="รีเซ็ตขนาดเป็น 100%"
        style={{ fontSize: '0.68rem', fontWeight: 700 }}
      >
        {zoomScale}%
      </button>

      {/* Zoom Out */}
      <button 
        className="tool-btn"
        onClick={handleZoomOut}
        title="ย่อขนาดรูปภาพ (-15%)"
      >
        <ZoomOut size={18} />
      </button>

      <div style={{ width: '32px', height: '1px', background: 'var(--border-subtle)' }} />

      {/* Load Sample Demo */}
      <button 
        className="tool-btn"
        onClick={onLoadDemo}
        title="โหลดตัวอย่างมังงะ (Demo 2 หน้า)"
      >
        <Sparkles size={18} color="var(--accent-cyan)" />
      </button>

      {/* Seam Bridge Across All Pages */}
      {totalPages >= 2 && onBridgeAllSeams && (
        <button 
          className="tool-btn"
          onClick={onBridgeAllSeams}
          title="วิเคราะห์และแปลรอยต่อระหว่างทุกหน้า (Bridge Seams: แก้ปัญหาตัวหนังสือขาดครึ่งข้ามหน้า)"
          style={{ color: '#c084fc' }}
        >
          <Link2 size={18} />
        </button>
      )}

      {/* Reset / Clear All */}
      <button 
        className="tool-btn"
        onClick={onClearAll}
        title="ล้างหน้าทั้งหมด เริ่มใหม่"
      >
        <RotateCcw size={18} color="#f87171" />
      </button>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <div 
          style={{
            fontSize: '0.7rem',
            color: 'var(--text-dim)',
            fontWeight: 700,
            textAlign: 'center',
          }}
          title="จำนวนหน้าทั้งหมดในตอนนี้"
        >
          {totalPages}P
        </div>
      </div>
    </aside>
  );
};
