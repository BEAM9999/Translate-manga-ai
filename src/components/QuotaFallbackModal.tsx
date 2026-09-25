import React, { useState } from 'react';
import { GeminiModelId } from '../types';
import { GEMINI_MODELS } from '../data/models';
import { 
  AlertTriangle, 
  Sparkles, 
  ArrowRight, 
  RefreshCw, 
  Check, 
  X, 
  Key, 
  ShieldAlert,
  Cpu,
  Zap
} from 'lucide-react';

interface QuotaFallbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  exhaustedModelId: GeminiModelId;
  errorMessage?: string;
  failedPageIndex: number;
  totalPages: number;
  currentApiKey: string;
  onResumeTranslation: (newModelId: GeminiModelId, newApiKey?: string) => void;
}

export const QuotaFallbackModal: React.FC<QuotaFallbackModalProps> = ({
  isOpen,
  onClose,
  exhaustedModelId,
  errorMessage,
  failedPageIndex,
  totalPages,
  currentApiKey,
  onResumeTranslation,
}) => {
  // Suggest a fast & reliable alternative model
  const defaultAlternative: GeminiModelId = 
    exhaustedModelId === 'gemini-2.5-flash' 
      ? 'gemini-2.5-flash-lite' 
      : exhaustedModelId === 'gemini-2.5-pro' 
        ? 'gemini-2.5-flash' 
        : 'gemini-3-flash';

  const [selectedModel, setSelectedModel] = useState<GeminiModelId>(defaultAlternative);
  const [apiKey, setApiKey] = useState(currentApiKey);
  const [showKeyInput, setShowKeyInput] = useState(false);

  if (!isOpen) return null;

  const currentModelObj = GEMINI_MODELS.find(m => m.id === exhaustedModelId);
  const currentModelName = currentModelObj?.name || exhaustedModelId;

  const handleConfirm = () => {
    onResumeTranslation(selectedModel, apiKey !== currentApiKey ? apiKey : undefined);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 999 }}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '620px', border: '2px solid rgba(245, 158, 11, 0.6)', boxShadow: '0 0 40px rgba(245, 158, 11, 0.25)' }}
      >
        {/* Header */}
        <div className="modal-header" style={{ borderBottomColor: 'rgba(245, 158, 11, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div 
              style={{ 
                width: '32px', 
                height: '32px', 
                borderRadius: '8px', 
                background: 'rgba(245, 158, 11, 0.2)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: '#f59e0b'
              }}
            >
              <ShieldAlert size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', color: '#ffffff', margin: 0 }}>
                โควตาโมเดลเต็ม / สลับโมเดลเพื่อแปลต่อทันที
              </h2>
              <span style={{ fontSize: '0.74rem', color: '#f59e0b' }}>
                ระบบป้องกันการหยุดชะงัก — แปลต่อจากหน้าที่ {failedPageIndex + 1} จาก {totalPages} หน้า
              </span>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Situation Explanation Card */}
          <div 
            style={{ 
              background: 'rgba(245, 158, 11, 0.08)', 
              border: '1px solid rgba(245, 158, 11, 0.25)', 
              borderRadius: '10px', 
              padding: '12px 14px',
              marginBottom: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <p style={{ margin: 0, fontSize: '0.86rem', color: '#ffffff', fontWeight: 600 }}>
                  {errorMessage?.includes('503') || errorMessage?.includes('หนาแน่น') || errorMessage?.toLowerCase().includes('demand')
                    ? <>โมเดล <span style={{ color: '#f59e0b' }}>"{currentModelName}"</span> เซิร์ฟเวอร์ Google มีผู้ใช้หนาแน่นชั่วคราว (503 High Demand)</>
                    : <>โมเดล <span style={{ color: '#f59e0b' }}>"{currentModelName}"</span> ถึงขีดจำกัดโควตา Token ชั่วคราว</>
                  }
                </p>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {errorMessage || 'เซิร์ฟเวอร์ Google มีผู้ใช้งานหนาแน่น หรือโควตาคำขอต่อนาทีเต็มชั่วคราว'}
                </p>
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: '#34d399' }}>
                  <Check size={13} />
                  <span>หน้าที่แปลเสร็จไปแล้วก่อนหน้านี้ถูกบันทึกไว้ในแคชเรียบร้อย 100% ไม่สูญหาย</span>
                </div>
              </div>
            </div>
          </div>

          {/* Model Selection */}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Cpu size={14} color="var(--accent-cyan)" />
              เลือกโมเดลอื่นเพื่อแปลต่อจากเดิมทันที (Recommended Alternative Models):
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              {GEMINI_MODELS
                .filter(m => m.id !== exhaustedModelId && (m.category === 'Recommended' || m.category === 'Ultra Fast / Lite' || m.category === 'Pro / Deep Context'))
                .slice(0, 5)
                .map((m) => {
                  const isSelected = selectedModel === m.id;
                  return (
                    <div
                      key={m.id}
                      onClick={() => setSelectedModel(m.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: isSelected ? '2px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                        background: isSelected ? 'rgba(6, 182, 212, 0.14)' : 'var(--bg-surface)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div 
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            border: isSelected ? '5px solid var(--accent-cyan)' : '2px solid var(--text-dim)',
                            background: '#000000',
                            flexShrink: 0
                          }} 
                        />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.88rem', color: isSelected ? 'var(--accent-cyan)' : '#ffffff' }}>
                              {m.name}
                            </span>
                            {m.badge && (
                              <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>
                                {m.badge}
                              </span>
                            )}
                          </div>
                          <p style={{ margin: '2px 0 0 0', fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                            {m.description}
                          </p>
                        </div>
                      </div>

                      {isSelected && (
                        <span style={{ color: 'var(--accent-cyan)', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px' }}>
                          <Check size={14} /> พร้อมใช้งาน
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Optional: Switch API Key */}
          <div style={{ marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => setShowKeyInput(!showKeyInput)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent-cyan)',
                fontSize: '0.76rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: 0
              }}
            >
              <Key size={12} /> {showKeyInput ? 'ซ่อนช่องเปลี่ยน API Key' : 'ต้องการเปลี่ยนเป็น API Key สำรองอันอื่นด้วย?'}
            </button>

            {showKeyInput && (
              <div style={{ marginTop: '8px' }}>
                <input
                  type="password"
                  className="input-text"
                  placeholder="กรอก Gemini API Key สำรองอันใหม่..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ borderTopColor: 'rgba(255, 255, 255, 0.08)' }}>
          <button className="btn-secondary" onClick={onClose}>
            หยุดแปลชั่วคราว
          </button>
          <button 
            className="btn-primary" 
            onClick={handleConfirm}
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #ec4899)',
              boxShadow: '0 0 20px rgba(245, 158, 11, 0.4)',
              color: '#ffffff'
            }}
          >
            <Zap size={15} /> สลับโมเดลและแปลต่อจากจุดเดิมทันที <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
