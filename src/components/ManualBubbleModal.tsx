import React, { useEffect, useState } from 'react';
import { Check, MessageSquarePlus, User, X } from 'lucide-react';

export interface ManualBubbleValues {
  sourceText: string;
  translatedText: string;
  speaker: string;
}

interface ManualBubbleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: ManualBubbleValues) => void;
}

const INITIAL_VALUES: ManualBubbleValues = {
  sourceText: '',
  translatedText: '',
  speaker: 'ตัวละคร',
};

export const ManualBubbleModal: React.FC<ManualBubbleModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [values, setValues] = useState<ManualBubbleValues>(INITIAL_VALUES);

  useEffect(() => {
    if (isOpen) setValues(INITIAL_VALUES);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const translatedText = values.translatedText.trim();
    if (!translatedText) {
      alert('กรุณากรอกคำแปลไทยที่จะแสดงในกล่องข้อความ');
      return;
    }

    onSave({
      sourceText: values.sourceText.trim(),
      translatedText,
      speaker: values.speaker.trim() || 'ตัวละคร',
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal-content"
        onSubmit={handleSubmit}
        onMouseDown={(event) => event.stopPropagation()}
        style={{ maxWidth: '540px', width: '92%', padding: '22px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: 'rgba(6, 182, 212, 0.14)',
                border: '1px solid rgba(6, 182, 212, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-cyan)',
              }}
            >
              <MessageSquarePlus size={19} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.08rem', margin: 0, color: '#ffffff' }}>เพิ่มกล่องข้อความ</h2>
              <p style={{ fontSize: '0.77rem', color: 'var(--text-dim)', margin: '2px 0 0' }}>ตำแหน่งกล่องถูกวางไว้บนภาพแล้ว และยังลากปรับได้ภายหลัง</p>
            </div>
          </div>
          <button className="btn-icon" type="button" onClick={onClose} title="ปิด">
            <X size={16} />
          </button>
        </div>

        <label style={labelStyle}>
          ข้อความต้นฉบับ
          <textarea
            value={values.sourceText}
            onChange={(event) => setValues(current => ({ ...current, sourceText: event.target.value }))}
            placeholder="พิมพ์ข้อความภาษาเดิม หากต้องการเก็บไว้"
            rows={3}
            style={textareaStyle}
          />
        </label>

        <label style={labelStyle}>
          คำแปลไทยที่จะแสดง
          <textarea
            autoFocus
            value={values.translatedText}
            onChange={(event) => setValues(current => ({ ...current, translatedText: event.target.value }))}
            placeholder="พิมพ์ข้อความที่ต้องการแสดงบนมังงะ"
            rows={4}
            style={{ ...textareaStyle, borderColor: 'rgba(6, 182, 212, 0.42)' }}
          />
          <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', fontWeight: 400 }}>
            Space = เว้นวรรค · Shift + Enter = ขึ้นบรรทัดใหม่
          </span>
        </label>

        <label style={labelStyle}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><User size={14} /> ผู้พูด</span>
          <input
            value={values.speaker}
            onChange={(event) => setValues(current => ({ ...current, speaker: event.target.value }))}
            placeholder="เช่น พระเอก, ผู้บรรยาย, SFX"
            style={inputStyle}
          />
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button type="submit" className="btn-primary">
            <Check size={15} /> เพิ่มกล่องข้อความ
          </button>
        </div>
      </form>
    </div>
  );
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  fontSize: '0.82rem',
  fontWeight: 700,
  color: '#e2e8f0',
  marginTop: '13px',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  resize: 'vertical',
  minHeight: '64px',
  borderRadius: '6px',
  padding: '8px 10px',
  color: '#ffffff',
  background: 'rgba(15, 20, 34, 0.9)',
  border: '1px solid rgba(255, 255, 255, 0.14)',
  outline: 'none',
  fontFamily: 'var(--font-thai-clean)',
  fontSize: '0.88rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: '6px',
  padding: '8px 10px',
  color: '#ffffff',
  background: 'rgba(15, 20, 34, 0.9)',
  border: '1px solid rgba(255, 255, 255, 0.14)',
  outline: 'none',
  fontFamily: 'var(--font-thai-clean)',
  fontSize: '0.88rem',
};
