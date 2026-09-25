import React, { useRef, useCallback } from 'react';
import { Eraser, Paintbrush, Plus, Minus } from 'lucide-react';
import { percentToBrushPixelSize } from '../utils/brushUtils';

interface BrushSizeSliderProps {
  tool: 'eraser' | 'paint';
  sizePercent: number; // 1 to 200
  onChange: (newPercent: number) => void;
  style?: React.CSSProperties;
}

export const BrushSizeSlider: React.FC<BrushSizeSliderProps> = ({
  tool,
  sizePercent,
  onChange,
  style,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef<boolean>(false);

  const isEraser = tool === 'eraser';
  const themeColor = isEraser ? '#06b6d4' : '#a855f7';
  const themeGlow = isEraser ? 'rgba(6, 182, 212, 0.45)' : 'rgba(168, 85, 247, 0.45)';
  const toolName = isEraser ? 'หลอดขนาดยางลบ' : 'หลอดขนาดพู่กัน';
  const pixelSize = percentToBrushPixelSize(sizePercent);

  // Quick preset sizes
  const presets = [10, 25, 50, 100, 150, 200];

  const updateFromClientY = useCallback((clientY: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    // Top = 200%, Bottom = 1%
    const ratio = (rect.bottom - clientY) / rect.height;
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const newPercent = Math.round(1 + clampedRatio * 199);
    onChange(newPercent);
  }, [onChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    updateFromClientY(e.clientY);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (isDraggingRef.current) {
        updateFromClientY(moveEvent.clientY);
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 5 : -5;
    const next = Math.max(1, Math.min(200, sizePercent + delta));
    onChange(next);
  };

  const handleStep = (step: number) => {
    const next = Math.max(1, Math.min(200, sizePercent + step));
    onChange(next);
  };

  // Preview circle max display size is 44px
  const previewCircleSize = Math.min(46, Math.max(4, Math.round(pixelSize * 0.45)));

  return (
    <div
      className="brush-size-slider-panel"
      style={{
        position: 'absolute',
        left: 'calc(100% + 14px)',
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 9999,
        background: '#0a0f1d',
        border: `2px solid ${themeColor}`,
        boxShadow: `0 12px 35px rgba(0, 0, 0, 0.85), 0 0 25px ${themeGlow}`,
        borderRadius: '18px',
        padding: '14px 14px',
        width: '148px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        userSelect: 'none',
        animation: 'brushSliderFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        ...style,
      }}
      onClick={(e) => e.stopPropagation()}
      onWheel={handleWheel}
    >
      {/* Pointer arrow pointing to the toolbar button */}
      <div
        style={{
          position: 'absolute',
          left: '-9px',
          top: '50%',
          transform: 'translateY(-50%) rotate(45deg)',
          width: '14px',
          height: '14px',
          background: '#0a0f1d',
          borderLeft: `2px solid ${themeColor}`,
          borderBottom: `2px solid ${themeColor}`,
          zIndex: 1,
        }}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', justifyContent: 'center' }}>
        {isEraser ? (
          <Eraser size={16} color={themeColor} />
        ) : (
          <Paintbrush size={16} color={themeColor} />
        )}
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap' }}>
          {toolName}
        </span>
      </div>

      {/* Percentage Value Display */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.08)',
          padding: '4px 12px',
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'baseline',
          gap: '5px',
          border: `1px solid ${themeColor}60`,
          boxShadow: `0 0 10px ${themeGlow}`,
        }}
      >
        <span style={{ fontSize: '1.15rem', fontWeight: 800, color: themeColor, fontFamily: 'monospace' }}>
          {sizePercent}%
        </span>
        <span style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>
          ({pixelSize}px)
        </span>
      </div>

      {/* Vertical Slider Track Container with Step Buttons */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
        }}
      >
        {/* Plus Button */}
        <button
          type="button"
          onClick={() => handleStep(5)}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: `1px solid ${themeColor}40`,
            borderRadius: '6px',
            color: '#f8fafc',
            width: '26px',
            height: '22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title="เพิ่มขนาด (+5%)"
        >
          <Plus size={13} />
        </button>

        {/* Vertical Tube Track */}
        <div
          style={{
            position: 'relative',
            height: '130px',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Scale labels on left */}
          <div
            style={{
              position: 'absolute',
              left: '4px',
              top: 0,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              fontSize: '0.62rem',
              color: '#94a3b8',
              pointerEvents: 'none',
              fontFamily: 'monospace',
              fontWeight: 600,
            }}
          >
            <span>200%</span>
            <span>100%</span>
            <span>1%</span>
          </div>

          {/* Interactive Tube Track */}
          <div
            ref={trackRef}
            onMouseDown={handleMouseDown}
            style={{
              position: 'relative',
              width: '16px',
              height: '100%',
              background: 'rgba(255, 255, 255, 0.12)',
              border: `1px solid ${themeColor}50`,
              borderRadius: '10px',
              cursor: 'ns-resize',
              marginLeft: '26px',
              marginRight: '6px',
              boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.5)',
            }}
            title="คลิกแล้วลากขึ้น-ลง หรือหมุนลูกกลิ้งเมาส์เพื่อปรับขนาด (1% - 200%)"
          >
            {/* Filled active tube portion */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: `${((sizePercent - 1) / 199) * 100}%`,
                background: `linear-gradient(to top, ${themeColor}88, ${themeColor})`,
                borderRadius: '10px',
                boxShadow: `0 0 10px ${themeGlow}`,
              }}
            />

            {/* Draggable Knob */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                bottom: `${((sizePercent - 1) / 199) * 100}%`,
                transform: 'translate(-50%, 50%)',
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: '#ffffff',
                border: `3px solid ${themeColor}`,
                boxShadow: `0 0 14px ${themeColor}, 0 2px 6px rgba(0,0,0,0.7)`,
                cursor: 'ns-resize',
                transition: 'transform 0.05s ease',
              }}
            />
          </div>
        </div>

        {/* Minus Button */}
        <button
          type="button"
          onClick={() => handleStep(-5)}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: `1px solid ${themeColor}40`,
            borderRadius: '6px',
            color: '#f8fafc',
            width: '26px',
            height: '22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title="ลดขนาด (-5%)"
        >
          <Minus size={13} />
        </button>
      </div>

      {/* Tip Circle Preview */}
      <div
        style={{
          width: '56px',
          height: '56px',
          background: 'rgba(0, 0, 0, 0.45)',
          borderRadius: '12px',
          border: `1px solid ${themeColor}40`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title={`พรีวิวขนาดจริง: ${pixelSize}px`}
      >
        <div
          style={{
            width: `${previewCircleSize}px`,
            height: `${previewCircleSize}px`,
            borderRadius: '50%',
            border: `2px solid ${themeColor}`,
            background: isEraser ? `${themeColor}33` : `${themeColor}88`,
            boxShadow: `0 0 8px ${themeGlow}`,
            transition: 'width 0.08s ease, height 0.08s ease',
          }}
        />
      </div>

      {/* Quick Preset Buttons */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '4px',
          width: '100%',
        }}
      >
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            style={{
              background: sizePercent === p ? themeColor : 'rgba(255, 255, 255, 0.08)',
              color: sizePercent === p ? '#000000' : '#e2e8f0',
              fontWeight: sizePercent === p ? 800 : 500,
              fontSize: '0.68rem',
              border: `1px solid ${sizePercent === p ? themeColor : 'rgba(255, 255, 255, 0.1)'}`,
              borderRadius: '6px',
              padding: '4px 0',
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
            title={`เลือกขนาด ${p}%`}
          >
            {p}%
          </button>
        ))}
      </div>
    </div>
  );
};
