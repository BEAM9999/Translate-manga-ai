import React from 'react';
import { Eraser, Layers, X } from 'lucide-react';

interface EmbedTranslationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmEmbed: () => void;
  onAutoCleanAndEmbed: () => void;
}

export const EmbedTranslationModal: React.FC<EmbedTranslationModalProps> = ({
  isOpen,
  onClose,
  onConfirmEmbed,
  onAutoCleanAndEmbed,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onMouseDown={onClose} style={{ zIndex: 1001 }}>
      <section className="modal-content" onMouseDown={(event) => event.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={20} color="var(--accent-cyan)" />
            <h2>ฝังคำแปลลงรูปภาพ</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="ปิด"><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: '12px', fontSize: '0.85rem', lineHeight: 1.55 }}>
          <p style={{ margin: 0, color: '#d1fae5' }}>เลือกได้ว่าจะคงข้อความต้นฉบับไว้ หรือให้ระบบลบตามกรอบที่ OCR ตรวจจับก่อนฝังคำแปลไทย</p>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>ทั้งสองแบบจะฝังเฉพาะข้อความไทยโดยไม่มีกรอบ, blur หรือ gradient และเก็บ OCR ไว้สำหรับ Undo กับการแก้ไขภายหลัง</p>
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button className="btn-secondary" onClick={onConfirmEmbed}><Layers size={15} /> ฝังทับเดิม</button>
          <button className="btn-primary" onClick={onAutoCleanAndEmbed}><Eraser size={15} /> ลบตาม OCR แล้วฝัง</button>
        </div>
      </section>
    </div>
  );
};