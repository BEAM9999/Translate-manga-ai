import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Eraser, Paintbrush, Undo2, Check, X, Pipette, Trash2 } from 'lucide-react';
import { MangaPage } from '../types';
import { applyDrawingToImage } from '../utils/imageInpainter';

interface EraserOverlayProps {
  page: MangaPage;
  initialMode?: 'eraser' | 'paint';
  onApply: (pageId: string, newImageUrl: string, mode: 'eraser' | 'paint') => void;
  onCancel: () => void;
}

export const EraserOverlay: React.FC<EraserOverlayProps> = ({
  page,
  initialMode = 'eraser',
  onApply,
  onCancel,
}) => {
  const [mode, setMode] = useState<'eraser' | 'paint'>(initialMode);
  const [brushSize, setBrushSize] = useState<number>(24);
  const [brushColor, setBrushColor] = useState<string>(initialMode === 'eraser' ? '#ffffff' : '#000000');
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  const width = page.width || 800;
  const height = page.height || 1200;

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Clear canvas to transparent
    ctx.clearRect(0, 0, width, height);

    // Save initial blank state
    const blank = ctx.getImageData(0, 0, width, height);
    setHistory([blank]);
  }, [width, height]);

  // Convert mouse/touch event to canvas coordinates
  const getCanvasCoords = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  const saveHistoryState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory(prev => [...prev.slice(-15), data]); // keep last 15 states
  }, []);

  const handleUndo = useCallback(() => {
    if (history.length <= 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const newHistory = [...history];
    newHistory.pop(); // remove current state
    const previousState = newHistory[newHistory.length - 1];
    ctx.putImageData(previousState, 0, 0);
    setHistory(newHistory);
  }, [history]);

  const handleClearAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    saveHistoryState();
  }, [saveHistoryState]);

  // Start Drawing
  const startDrawing = (clientX: number, clientY: number) => {
    const coords = getCanvasCoords(clientX, clientY);
    lastPosRef.current = coords;
    setIsDrawing(true);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const color = mode === 'eraser' ? (brushColor === '#000000' ? '#ffffff' : brushColor) : brushColor;

    ctx.beginPath();
    ctx.arc(coords.x, coords.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };

  // Draw Stroke
  const draw = (clientX: number, clientY: number) => {
    if (!isDrawing || !lastPosRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCanvasCoords(clientX, clientY);
    const color = mode === 'eraser' ? (brushColor === '#000000' ? '#ffffff' : brushColor) : brushColor;

    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();

    lastPosRef.current = coords;
  };

  // Stop Drawing
  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      lastPosRef.current = null;
      saveHistoryState();
    }
  };

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // only left click
    updateCursorPosition(e.clientX, e.clientY);
    startDrawing(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    updateCursorPosition(e.clientX, e.clientY);
    draw(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    stopDrawing();
  };

  const updateCursorPosition = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setCursorPosition({
      x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
    });
  };

  // Apply Changes to Image
  const handleApply = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsApplying(true);

    try {
      const newImageUrl = await applyDrawingToImage(
        page.originalImageUrl,
        canvas,
        page.width,
        page.height
      );
      onApply(page.id, newImageUrl, mode);
    } catch (err) {
      console.error('Error applying drawing:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกภาพ');
    } finally {
      setIsApplying(false);
    }
  };

  // Eyedropper tool
  const handleEyedropper = async () => {
    if ('EyeDropper' in window) {
      try {
        const eyeDropper = new (window as any).EyeDropper();
        const result = await eyeDropper.open();
        setBrushColor(result.sRGBHex);
      } catch {
        // Cancelled or unsupported
      }
    } else {
      alert('เบราว์เซอร์ของคุณยังไม่รองรับ EyeDropper Tool แนะนำใช้ Chrome หรือ Edge ครับ');
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter') {
        handleApply();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, handleApply, handleUndo]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 55,
        userSelect: 'none',
      }}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Canvas for user drawing */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseEnter={(e) => updateCursorPosition(e.clientX, e.clientY)}
        onMouseLeave={() => {
          handleMouseUp();
          setCursorPosition(null);
        }}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: 'none',
        }}
      />

      {cursorPosition && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: `${cursorPosition.x}%`,
            top: `${cursorPosition.y}%`,
            width: `${brushSize}px`,
            height: `${brushSize}px`,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            border: `2px solid ${mode === 'eraser' ? '#38bdf8' : brushColor}`,
            background: mode === 'eraser' ? 'rgba(56, 189, 248, 0.12)' : `${brushColor}22`,
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: 56,
          }}
        />
      )}

      {/* Floating Toolbar */}
      <div
        style={{
          position: 'sticky',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'fit-content',
          maxWidth: '92%',
          margin: '0 auto',
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '16px',
          padding: '8px 16px',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.75)',
          zIndex: 60,
          pointerEvents: 'auto',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {/* Mode Selector */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.08)', borderRadius: '10px', padding: '3px' }}>
          <button
            onClick={() => { setMode('eraser'); setBrushColor('#ffffff'); }}
            style={{
              background: mode === 'eraser' ? '#3b82f6' : 'transparent',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s',
            }}
          >
            <Eraser size={15} />
            <span>ยางลบ</span>
          </button>
          <button
            onClick={() => { setMode('paint'); if (brushColor === '#ffffff') setBrushColor('#000000'); }}
            style={{
              background: mode === 'paint' ? '#8b5cf6' : 'transparent',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s',
            }}
          >
            <Paintbrush size={15} />
            <span>พู่กันสี</span>
          </button>
        </div>

        {/* Brush Size */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>ขนาด:</span>
          <input
            type="range"
            min="4"
            max="240"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            style={{ width: '80px', cursor: 'pointer', accentColor: '#3b82f6' }}
            title={`ขนาด: ${brushSize}px`}
          />
          <span style={{ fontSize: '0.75rem', minWidth: '32px', fontFamily: 'monospace' }}>{brushSize}px</span>
        </div>

        {/* Color Palette (for Paint or custom Eraser) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Quick colors */}
          {['#ffffff', '#000000', '#f3f4f6', '#1e293b'].map((c) => (
            <button
              key={c}
              onClick={() => setBrushColor(c)}
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: c,
                border: brushColor === c ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.3)',
                cursor: 'pointer',
                padding: 0,
              }}
              title={c}
            />
          ))}

          {/* Native Color Picker */}
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} title="เลือกสีเอง">
            <input
              type="color"
              value={brushColor}
              onChange={(e) => setBrushColor(e.target.value)}
              style={{
                width: '24px',
                height: '24px',
                padding: 0,
                border: 'none',
                borderRadius: '50%',
                cursor: 'pointer',
                background: 'transparent',
              }}
            />
          </label>

          {/* Eyedropper tool */}
          {'EyeDropper' in window && (
            <button
              onClick={handleEyedropper}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#cbd5e1',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="ดูดสีจากหน้าจอ"
            >
              <Pipette size={15} />
            </button>
          )}
        </div>

        {/* Action buttons: Undo & Clear */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={handleUndo}
            disabled={history.length <= 1}
            style={{
              background: 'transparent',
              border: 'none',
              color: history.length > 1 ? '#e2e8f0' : '#64748b',
              cursor: history.length > 1 ? 'pointer' : 'not-allowed',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
            }}
            title="เลิกทำ (Ctrl+Z)"
          >
            <Undo2 size={16} />
          </button>
          <button
            onClick={handleClearAll}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#f87171',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
            }}
            title="ล้างทั้งหมดที่วาด"
          >
            <Trash2 size={16} />
          </button>
        </div>

        {/* Separator */}
        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.15)' }} />

        {/* Save & Cancel */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleApply}
            disabled={isApplying}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 14px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: isApplying ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
            }}
          >
            <Check size={14} />
              <span>{isApplying ? 'กำลังบันทึก...' : 'บันทึกแล้วกลับเมาส์ปกติ'}</span>
          </button>

          <button
            onClick={onCancel}
            disabled={isApplying}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#e2e8f0',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="ทิ้งการวาดและกลับเมาส์ปกติ (Esc)"
          >
            <X size={14} />
            <span>ทิ้งการแก้ไข</span>
          </button>
        </div>
      </div>
    </div>
  );
};
