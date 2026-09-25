import React, { useState, useEffect } from 'react';
import { AppSettings, GeminiModelId, TranslationContextId, AiProvider, OpenRouterModelEntry } from '../types';
import { GEMINI_MODELS } from '../data/models';
import { TRANSLATION_CONTEXTS } from '../data/translationContexts';
import { clearOcrCache, getCacheStats } from '../services/cacheService';
import { AppDataStats, clearAllAppData, getAppDataStats } from '../services/appDataService';
import { tts } from '../services/ttsService';
import { parseSmartKeysAndModels, removeModelFromSmartText } from '../utils/smartKeyParser';
import { checkAllOpenRouterModelsHealth } from '../services/modelCheckerService';
import { 
  X, 
  Key, 
  Eye, 
  EyeOff, 
  ExternalLink, 
  Trash2, 
  Sparkles, 
  Check, 
  Type, 
  Languages, 
  Database,
  Cpu,
  BookOpen,
  Volume2,
  Sliders,
  Layers,
  Brain,
  ClipboardPaste,
  Server,
  Plus,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Archive,
  HardDriveDownload
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  activePlaylistName?: string;
  onSaveSettings: (newSettings: AppSettings) => void | Promise<void>;
  onOpenBackup?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  activePlaylistName,
  onSaveSettings,
  onOpenBackup,
}) => {
  const [current, setCurrent] = useState<AppSettings>({ ...settings });
  const [showKey, setShowKey] = useState(false);
  const [revealedKeyIds, setRevealedKeyIds] = useState<Record<string, boolean>>({});
  const [cacheInfo, setCacheInfo] = useState(getCacheStats());
  const [appDataInfo, setAppDataInfo] = useState<AppDataStats | null>(null);
  const [isResettingAppData, setIsResettingAppData] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isPlayingTestVoice, setIsPlayingTestVoice] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isMemoryEditorExpanded, setIsMemoryEditorExpanded] = useState(false);
  
  // Smart Import Textarea State (Persisted in settings.rawSmartPasteText)
  const [smartPasteText, setSmartPasteText] = useState(settings.rawSmartPasteText || '');
  const [smartImportResult, setSmartImportResult] = useState<string | null>(null);

  // Sync state when opened
  useEffect(() => {
    if (isOpen) {
      setCurrent({ ...settings });
      setCacheInfo(getCacheStats());
      getAppDataStats().then(setAppDataInfo);
      setSmartPasteText(settings.rawSmartPasteText || '');
      setSmartImportResult(null);

      // Load available voices
      const voices = tts.getVoices();
      setAvailableVoices(voices);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSave = async () => {
    await onSaveSettings({
      ...current,
      rawSmartPasteText: smartPasteText
    });
    onClose();
  };

  const handleClearCache = () => {
    if (confirm('คุณต้องการล้างแคชคำแปลและข้อมูล OCR ทั้งหมดหรือไม่?')) {
      clearOcrCache();
      setCacheInfo(getCacheStats());
      getAppDataStats().then(setAppDataInfo);
      showToast('ล้างแคชคำแปลทั้งหมดเรียบร้อยแล้ว');
    }
  };

  const handleResetAppData = async () => {
    if (!confirm('ลบการตั้งค่า แคช หน้ามังงะ และ Playlist ทั้งหมดของ C2 Sub Auto AI หรือไม่? การลบนี้ย้อนกลับไม่ได้ และจะลบเฉพาะข้อมูลเว็บนี้ ไม่ลบไฟล์ Windows')) {
      return;
    }

    setIsResettingAppData(true);
    try {
      await clearAllAppData();
      window.location.reload();
    } catch (error) {
      console.error('Failed to reset app data:', error);
      showToast('ลบข้อมูลไม่สำเร็จ อาจมีแท็บอื่นกำลังใช้งานฐานข้อมูลนี้');
      setIsResettingAppData(false);
    }
  };

  const formatStorageUsage = (bytes: number | null) => {
    if (bytes === null) return 'ประเมินไม่ได้';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const handleTestVoice = () => {
    setIsPlayingTestVoice(true);
    tts.speak(
      'สวัสดีครับ นี่คือระบบเสียงจำลองสำหรับอ่านมังงะและคอมมิคแปลไทย',
      'th-TH',
      'normal',
      current.selectedVoiceName,
      () => setIsPlayingTestVoice(false)
    );
  };

  // Run Health Check on all OpenRouter Models
  const handleCheckHealth = async (entriesToCheck?: OpenRouterModelEntry[]) => {
    const list = entriesToCheck || current.openRouterModelEntries || [];
    if (list.length === 0) return;

    setIsCheckingHealth(true);
    try {
      const checkedList = await checkAllOpenRouterModelsHealth(list, (progressList) => {
        setCurrent(prev => ({ ...prev, openRouterModelEntries: progressList }));
      });
      setCurrent(prev => ({ ...prev, openRouterModelEntries: checkedList }));
      showToast('ตรวจสอบความพร้อมใช้งานของโมเดลเสร็จสิ้น');
    } catch (e) {
      console.error('Health check error:', e);
    } finally {
      setIsCheckingHealth(false);
    }
  };

  // Clear Smart Text Box & immediately remove all associated OpenRouter models
  const handleClearTextBox = () => {
    setSmartPasteText('');
    setSmartImportResult(null);
    setCurrent(prev => ({
      ...prev,
      openRouterModelEntries: [],
      openRouterModel: '',
      openRouterApiKey: '',
      rawSmartPasteText: ''
    }));
    showToast('ล้างกล่องข้อความและลบรายการโมเดล OpenRouter ทั้งหมดแล้ว');
  };

  // Run Smart Key & Model Parser (Strict 1-to-1 sync with text box)
  const handleRunSmartImport = async () => {
    if (!smartPasteText.trim()) {
      handleClearTextBox();
      return;
    }

    const parsed = parseSmartKeysAndModels(smartPasteText);
    const updated = { ...current };
    const summaryParts: string[] = [];

    // 1. Process Gemini Keys
    if (parsed.geminiKeys.length > 0) {
      updated.geminiApiKeysPool = parsed.geminiKeys;
      if (!updated.apiKey || !parsed.geminiKeys.includes(updated.apiKey)) {
        updated.apiKey = parsed.geminiKeys[0];
      }
      summaryParts.push(`คีย์ Gemini (${parsed.geminiKeys.length})`);
    }

    // 2. Process OpenRouter Model + Dedicated Key Entries (STRICT REPLACEMENT)
    updated.openRouterModelEntries = parsed.openRouterEntries;
    if (parsed.openRouterEntries.length > 0) {
      // Check if currently selected model is still in the new list
      const isStillPresent = parsed.openRouterEntries.some(e => e.id === updated.openRouterModel);
      if (!isStillPresent) {
        updated.openRouterModel = parsed.openRouterEntries[0].id;
        updated.openRouterApiKey = parsed.openRouterEntries[0].key;
      } else {
        const matched = parsed.openRouterEntries.find(e => e.id === updated.openRouterModel);
        if (matched?.key) updated.openRouterApiKey = matched.key;
      }
      summaryParts.push(`โมเดล OpenRouter (${parsed.openRouterEntries.length})`);
    } else {
      updated.openRouterModel = '';
      updated.openRouterApiKey = '';
    }

    updated.rawSmartPasteText = smartPasteText;

    if (summaryParts.length > 0) {
      setCurrent(updated);
      setSmartImportResult(`✅ ตรวจพบและนำเข้า: ${summaryParts.join(', ')} สำเร็จ!`);
      showToast('นำเข้าข้อมูลสำเร็จ กำลังตรวจสอบสถานะโมเดล...');

      // Auto-trigger health check on newly imported models
      if (parsed.openRouterEntries.length > 0) {
        handleCheckHealth(parsed.openRouterEntries);
      }
    } else {
      setSmartImportResult('⚠️ ไม่พบคีย์หรือโมเดลที่ถูกต้องในข้อความที่กรอก');
    }
  };

  // Select an individual OpenRouter Model + Key card
  const handleSelectOpenRouterEntry = (entry: OpenRouterModelEntry) => {
    setCurrent({
      ...current,
      openRouterModel: entry.id,
      openRouterApiKey: entry.key || current.openRouterApiKey
    });
    showToast(`เลือกใช้โมเดล: ${entry.name}`);
  };

  // Delete an individual OpenRouter Model entry and remove it from text box too
  const handleDeleteOpenRouterEntry = (entryId: string) => {
    const updatedList = (current.openRouterModelEntries || []).filter(e => e.id !== entryId);
    const updatedText = removeModelFromSmartText(smartPasteText, entryId);
    setSmartPasteText(updatedText);

    let nextActiveModel = current.openRouterModel;
    let nextActiveKey = current.openRouterApiKey;

    if (current.openRouterModel === entryId) {
      nextActiveModel = updatedList[0]?.id || '';
      nextActiveKey = updatedList[0]?.key || '';
    }

    setCurrent({
      ...current,
      openRouterModelEntries: updatedList,
      openRouterModel: nextActiveModel,
      openRouterApiKey: nextActiveKey,
      rawSmartPasteText: updatedText
    });
    showToast('ลบโมเดลออกจากรายการและกล่องข้อความแล้ว');
  };

  // Clear all OpenRouter imported models
  const handleClearAllOpenRouterEntries = () => {
    if (confirm('คุณต้องการล้างรายการโมเดล OpenRouter ทั้งหมดหรือไม่?')) {
      handleClearTextBox();
    }
  };

  // Delete an individual Gemini key
  const handleDeleteGeminiKey = (keyToDelete: string) => {
    const updatedPool = (current.geminiApiKeysPool || []).filter(k => k !== keyToDelete);
    const nextKey = current.apiKey === keyToDelete ? (updatedPool[0] || '') : current.apiKey;
    setCurrent({
      ...current,
      geminiApiKeysPool: updatedPool,
      apiKey: nextKey
    });
    showToast('ลบคีย์ Gemini แล้ว');
  };

  const toggleRevealKey = (id: string) => {
    setRevealedKeyIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '720px' }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} color="var(--accent-cyan)" />
            <h2>ตั้งค่าระบบ AI OCR, โมเดล & คีย์ API</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Section 0: AI Provider Switcher (Gemini vs OpenRouter) */}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Server size={14} color="var(--accent-cyan)" />
              เลือกผู้ให้บริการ AI (AI Provider)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {/* Gemini Provider Tab */}
              <button
                type="button"
                onClick={() => setCurrent({ ...current, provider: 'gemini' })}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: (current.provider || 'gemini') === 'gemini' ? '2px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                  background: (current.provider || 'gemini') === 'gemini' ? 'rgba(6, 182, 212, 0.14)' : 'var(--bg-surface)',
                  color: '#ffffff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <Zap size={20} color="var(--accent-cyan)" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: (current.provider || 'gemini') === 'gemini' ? 'var(--accent-cyan)' : '#ffffff' }}>
                    Google Gemini
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Flash, Pro, Lite และ Gemini 3.7
                  </div>
                </div>
              </button>

              {/* OpenRouter Provider Tab */}
              <button
                type="button"
                onClick={() => setCurrent({ ...current, provider: 'openrouter' })}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: current.provider === 'openrouter' ? '2px solid #a855f7' : '1px solid var(--border-subtle)',
                  background: current.provider === 'openrouter' ? 'rgba(168, 85, 247, 0.14)' : 'var(--bg-surface)',
                  color: '#ffffff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <Cpu size={20} color="#a855f7" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: current.provider === 'openrouter' ? '#c084fc' : '#ffffff' }}>
                    OpenRouter
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    รองรับโมเดลหลากค่าย พร้อมตรวจจับคีย์ & สถานะ
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Section: Smart Key & Model Importer */}
          <div 
            className="form-group"
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px dashed var(--accent-cyan)',
              borderRadius: '8px',
              padding: '14px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0, fontSize: '0.84rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                <ClipboardPaste size={15} />
                ระบบตรวจจับและนำเข้า API Key & โมเดลอัจฉริยะ (Smart Importer)
              </label>
              {smartPasteText && (
                <button
                  type="button"
                  onClick={handleClearTextBox}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: '0.72rem', cursor: 'pointer' }}
                >
                  ล้างกล่องข้อความ
                </button>
              )}
            </div>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', margin: '0 0 8px 0' }}>
              วางโค้ดที่มีรูปแบบ <code style={{ color: '#38bdf8' }}>name=... id=... key=...</code> ระบบจะบันทึกและตรวจเช็คสถานะการใช้งานให้อัตโนมัติ:
            </p>
            <textarea
              className="input-text"
              rows={4}
              placeholder={`วางโค้ดหลายๆ โมเดลตรงนี้ เช่น:\nname = StepFun: Step 3.5 Flash (free)\nid   = stepfun/step-3.5-flash:free\nkey  = sk-or-v1-...\n--------------------------------------------\nname = Arcee AI: Trinity Large Preview\nid   = arcee-ai/trinity-large-preview:free\nkey  = sk-or-v1-...\n--------------------------------------------\nkey  = AIzaSy...`}
              value={smartPasteText}
              onChange={(e) => setSmartPasteText(e.target.value)}
              style={{ width: '100%', resize: 'vertical', fontSize: '0.78rem', fontFamily: 'monospace', lineHeight: '1.4' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
              <span style={{ fontSize: '0.74rem', color: '#34d399', fontWeight: 600 }}>
                {smartImportResult}
              </span>
              <button
                type="button"
                className="btn-primary"
                onClick={handleRunSmartImport}
                disabled={!smartPasteText.trim() || isCheckingHealth}
                style={{ fontSize: '0.78rem', padding: '6px 14px', background: 'linear-gradient(135deg, var(--accent-cyan), #a855f7)' }}
              >
                {isCheckingHealth ? <Loader2 size={13} className="spinner" /> : <Sparkles size={13} />} 
                {isCheckingHealth ? 'กำลังตรวจสอบคีย์...' : 'ตรวจจับและนำเข้าคีย์ทันที'}
              </button>
            </div>
          </div>

          {/* Provider Section A: Google Gemini API & Models */}
          {(current.provider || 'gemini') === 'gemini' && (
            <>
              {/* Gemini Key */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Key size={14} color="var(--accent-cyan)" />
                    Google Gemini API Key ปัจจุบัน
                  </label>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--accent-cyan)',
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}
                  >
                    รับ API Key ฟรี <ExternalLink size={11} />
                  </a>
                </div>

                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    className="input-text"
                    style={{ width: '100%', paddingRight: '40px' }}
                    placeholder="AIzaSy..."
                    value={current.apiKey}
                    onChange={(e) => setCurrent({ ...current, apiKey: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Gemini Backup Key Pool Card List */}
                {(current.geminiApiKeysPool?.length || 0) > 0 && (
                  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                      คีย์ Gemini ในระบบ ({current.geminiApiKeysPool.length} คีย์):
                    </span>
                    <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {current.geminiApiKeysPool.map((k, idx) => {
                        const isActive = current.apiKey === k;
                        return (
                          <div
                            key={k}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              background: isActive ? 'rgba(6, 182, 212, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                              border: isActive ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                              fontSize: '0.76rem',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)', fontWeight: 700 }}>
                                คีย์ #{idx + 1}:
                              </span>
                              <span style={{ fontFamily: 'monospace' }}>
                                {k.slice(0, 10)}...{k.slice(-6)}
                              </span>
                              {isActive && (
                                <span style={{ color: '#34d399', fontSize: '0.68rem', background: 'rgba(52, 211, 153, 0.15)', padding: '1px 6px', borderRadius: '4px' }}>
                                  ใช้งานอยู่
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {!isActive && (
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                                  onClick={() => setCurrent({ ...current, apiKey: k })}
                                >
                                  เลือกใช้
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteGeminiKey(k)}
                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                                title="ลบคีย์นี้"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Gemini Model Selection */}
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Cpu size={14} color="var(--accent-purple)" />
                  โมเดล AI (Gemini Vision Model)
                </label>
                <select
                  className="input-text"
                  value={current.selectedModel}
                  onChange={(e) => setCurrent({ ...current, selectedModel: e.target.value as GeminiModelId })}
                >
                  <optgroup label="🌟 แนะนำ (Recommended)">
                    {GEMINI_MODELS.filter(m => m.category === 'Recommended').map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} — {m.description}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="🧠 วิเคราะห์ลึกซึ้ง (Pro / Deep Context)">
                    {GEMINI_MODELS.filter(m => m.category === 'Pro / Deep Context').map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} — {m.description}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="⚡ ความเร็วสูงพิเศษ (Ultra Fast / Lite)">
                    {GEMINI_MODELS.filter(m => m.category === 'Ultra Fast / Lite').map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} — {m.description}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="🧪 รุ่นพรีวิว / ทดลอง (Preview / Experimental)">
                    {GEMINI_MODELS.filter(m => m.category === 'Preview / Experimental').map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} — {m.description}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </>
          )}

          {/* Provider Section B: OpenRouter Individual Model & Key Cards List */}
          {current.provider === 'openrouter' && (
            <>
              {/* Header with Check Health & Clear All buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0, fontWeight: 700, color: '#c084fc', fontSize: '0.88rem' }}>
                  <Cpu size={16} />
                  รายการโมเดลและคีย์ OpenRouter ({current.openRouterModelEntries?.length || 0} โมเดล)
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {(current.openRouterModelEntries?.length || 0) > 0 && (
                    <>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleCheckHealth()}
                        disabled={isCheckingHealth}
                        style={{ fontSize: '0.72rem', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '4px', borderColor: 'rgba(168, 85, 247, 0.4)', color: '#c084fc' }}
                        title="ตรวจสอบสถานะและโควตาของโมเดลทั้งหมด"
                      >
                        {isCheckingHealth ? <Loader2 size={12} className="spinner" /> : <RefreshCw size={12} />}
                        {isCheckingHealth ? 'กำลังตรวจ...' : 'ตรวจสถานะคีย์ทั้งหมด'}
                      </button>
                      <button
                        type="button"
                        onClick={handleClearAllOpenRouterEntries}
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                      >
                        <Trash2 size={12} /> ล้างรายการทั้งหมด
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Dynamic Model & Dedicated Key Cards */}
              {(current.openRouterModelEntries?.length || 0) > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '290px', overflowY: 'auto', paddingRight: '4px' }}>
                  {current.openRouterModelEntries.map((entry, idx) => {
                    const isActive = current.openRouterModel === entry.id;
                    const isRevealed = !!revealedKeyIds[entry.id];
                    const hasKey = entry.key && entry.key.trim().length > 0;
                    const isError = entry.status === 'error';
                    const isChecking = entry.status === 'checking';
                    const isOnline = entry.status === 'active';

                    return (
                      <div
                        key={entry.id}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: isError 
                            ? '2px solid #ef4444' 
                            : (isActive ? '2px solid #a855f7' : '1px solid var(--border-subtle)'),
                          background: isError 
                            ? 'rgba(239, 68, 68, 0.10)' 
                            : (isActive ? 'rgba(168, 85, 247, 0.12)' : 'var(--bg-surface)'),
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {/* Top row: Name (RED if error), Badge, Active Indicator */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span 
                              style={{ 
                                fontWeight: 700, 
                                fontSize: '0.84rem', 
                                color: isError ? '#ef4444' : (isActive ? '#c084fc' : '#ffffff') 
                              }}
                            >
                              #{idx + 1} {entry.name}
                            </span>
                            {entry.id.includes(':free') && (
                              <span style={{ fontSize: '0.66rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', fontWeight: 600 }}>
                                FREE
                              </span>
                            )}
                            {/* Health Badge */}
                            {isError && (
                              <span style={{ fontSize: '0.66rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.25)', color: '#ef4444', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <AlertTriangle size={10} /> ใช้งานไม่ได้ / หมดโควตา
                              </span>
                            )}
                            {isOnline && (
                              <span style={{ fontSize: '0.66rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(52, 211, 153, 0.2)', color: '#34d399', fontWeight: 600 }}>
                                ✅ Online
                              </span>
                            )}
                            {isChecking && (
                              <span style={{ fontSize: '0.66rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(6, 182, 212, 0.2)', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Loader2 size={10} className="spinner" /> ตรวจสอบ...
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {isActive ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#34d399', fontSize: '0.72rem', fontWeight: 700 }}>
                                <CheckCircle2 size={13} /> กำลังใช้งาน
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="btn-primary"
                                style={{ 
                                  padding: '3px 10px', 
                                  fontSize: '0.72rem', 
                                  background: isError ? 'rgba(239, 68, 68, 0.3)' : '#a855f7',
                                  borderColor: isError ? '#ef4444' : undefined,
                                  color: '#ffffff'
                                }}
                                onClick={() => handleSelectOpenRouterEntry(entry)}
                              >
                                เลือกใช้งาน
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDeleteOpenRouterEntry(entry.id)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                              title="ลบโมเดลนี้"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Model ID */}
                        <div style={{ fontSize: '0.74rem', color: isError ? '#f87171' : 'var(--text-muted)', fontFamily: 'monospace' }}>
                          ID: <span style={{ color: isError ? '#ef4444' : '#38bdf8' }}>{entry.id}</span>
                          {entry.statusMessage && (
                            <span style={{ marginLeft: '8px', fontSize: '0.70rem', color: isError ? '#ef4444' : '#34d399' }}>
                              ({entry.statusMessage})
                            </span>
                          )}
                        </div>

                        {/* Dedicated API Key for this model */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.25)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.72rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'monospace', color: isError ? '#ef4444' : (hasKey ? 'var(--text-main)' : '#ef4444') }}>
                            <Key size={11} color={isError ? '#ef4444' : (hasKey ? '#a855f7' : '#ef4444')} />
                            <span>
                              {hasKey 
                                ? (isRevealed ? entry.key : `${entry.key.slice(0, 14)}••••••••••••${entry.key.slice(-4)}`)
                                : '(ยังไม่มีคีย์สำหรับโมเดลนี้)'}
                            </span>
                          </div>
                          {hasKey && (
                            <button
                              type="button"
                              onClick={() => toggleRevealKey(entry.id)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '0 4px' }}
                            >
                              {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', textAlign: 'center' }}>
                  <p style={{ margin: '0 0 6px 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    ยังไม่มีรายการโมเดล OpenRouter ในระบบ
                  </p>
                  <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                    คัดลอกโค้ดรายการโมเดลมาวางในกล่อง <strong>"ระบบตรวจจับและนำเข้า API Key อัจฉริยะ"</strong> ด้านบน แล้วกดปุ่มนำเข้าได้ทันที
                  </p>
                </div>
              )}

              {/* Manual Fallback Input */}
              <div className="form-group" style={{ marginTop: '12px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                  หรือกรอก/สลับ Model ID และ Key แบบกำหนดเอง:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <input
                    type="text"
                    className="input-text"
                    style={{ fontSize: '0.76rem' }}
                    placeholder="Model ID เช่น stepfun/step-3.5-flash:free"
                    value={current.openRouterModel || ''}
                    onChange={(e) => setCurrent({ ...current, openRouterModel: e.target.value })}
                  />
                  <input
                    type="password"
                    className="input-text"
                    style={{ fontSize: '0.76rem' }}
                    placeholder="OpenRouter Key: sk-or-v1-..."
                    value={current.openRouterApiKey || ''}
                    onChange={(e) => setCurrent({ ...current, openRouterApiKey: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}

          {/* Section 2: Specialized Translation Context (บริบทเฉพาะทาง) */}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <BookOpen size={14} color="#f59e0b" />
              บริบทและแนวเรื่องของมังงะ/การ์ตูน (Genre Translation Context)
            </label>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '8px' }}>
              เลือกบริบทเพื่อให้ AI เข้าใจวัฒนธรรม สรรพนาม และสำนวนเฉพาะทางอย่างลึกซึ้ง (เลือกบริบทเดียวเด็ดขาด):
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {TRANSLATION_CONTEXTS.map((ctx) => {
                const isSelected = (current.translationContext || 'modern_era') === ctx.id;
                return (
                  <div
                    key={ctx.id}
                    onClick={() => setCurrent({ ...current, translationContext: ctx.id })}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                      background: isSelected ? 'rgba(6, 182, 212, 0.12)' : 'var(--bg-surface)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.86rem', color: isSelected ? 'var(--accent-cyan)' : '#ffffff' }}>
                        {ctx.title}
                      </span>
                      <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                        {ctx.category}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                      {ctx.description}
                    </p>
                  </div>
                );
              })}
            </div>

            {current.translationContext === 'custom_context' && (
              <div style={{ marginTop: '8px' }}>
                <textarea
                  className="input-text"
                  rows={3}
                  placeholder="ระบุคำสั่งบริบท เช่น: 'พระเอกชื่อหลินเฟิง เป็นจอมยุทธ์ที่ชอบพูดจาประชดประชัน ใช้สำนวนกวนๆ ทันสมัย...'"
                  value={current.customContextPrompt || ''}
                  onChange={(e) => setCurrent({ ...current, customContextPrompt: e.target.value })}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>
            )}
          </div>

          {/* Section: AI Custom Memory & Glossary (ระบบความทรงจำ AI & พจนานุกรมคำศัพท์เฉพาะ) */}
          <div 
            className="form-group" 
            style={{ 
              background: 'rgba(255, 255, 255, 0.02)', 
              border: current.enableAiMemory ? '1px solid rgba(236, 72, 153, 0.5)' : '1px solid var(--border-subtle)', 
              borderRadius: '10px', 
              padding: '14px',
              transition: 'border 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: current.enableAiMemory ? '10px' : '0' }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0, fontWeight: 700, color: '#ffffff' }}>
                  <Brain size={15} color="#ec4899" />
                  ระบบความทรงจำ AI & พจนานุกรมชื่อตัวละคร (AI Memory & Glossary)
                </label>
                <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                  {activePlaylistName
                    ? `บันทึกเข้าบริบทของ Playlist: ${activePlaylistName} และแสดงในแผงซ้าย`
                    : 'เลือก Playlist ก่อนเพื่อบันทึกบริบทนี้แยกตามเรื่อง'}
                </span>
              </div>

              {/* On/Off Switch */}
              <button
                type="button"
                onClick={() => setCurrent({ ...current, enableAiMemory: !current.enableAiMemory })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: current.enableAiMemory ? 'rgba(236, 72, 153, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                  border: current.enableAiMemory ? '1px solid #ec4899' : '1px solid var(--border-subtle)',
                  borderRadius: '20px',
                  padding: '5px 12px',
                  color: current.enableAiMemory ? '#f472b6' : 'var(--text-muted)',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {current.enableAiMemory ? 'เปิดใช้งาน (ON)' : 'ปิดไว้ (OFF - ประหยัด Token)'}
              </button>
            </div>

            {current.enableAiMemory && (
              <div style={{ marginTop: '10px' }}>
                <textarea
                  className="input-text"
                  rows={6}
                  placeholder={`พิมพ์คำสั่งหรือพจนานุกรมเฉพาะทาง เช่น:\n- Xiao Yan -> เซียวเหยียน\n- Heavenly Flame -> เพลิงสวรรค์\n- ถ้าเจอชื่อ "Sister Lan" ให้แปลว่า "ศิษย์พี่หลาน"\n- ตัวละครหญิงพูดจาสุภาพลงท้ายด้วย "เจ้าค่ะ"`}
                  value={current.aiMemoryDirectives || ''}
                  onChange={(e) => setCurrent({ ...current, aiMemoryDirectives: e.target.value })}
                  style={{ width: '100%', minHeight: '132px', resize: 'vertical', fontSize: '0.9rem', lineHeight: '1.55' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                  <span style={{ fontSize: '0.7rem', color: '#34d399' }}>
                    * ข้อความนี้จะถูกใช้กับทุกหน้าของ Playlist ที่กำลังเลือก และบรรทัดชื่อเดิม {'->'} ชื่อไทยจะถูกเพิ่มในแผงซ้าย
                  </span>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button type="button" onClick={() => setIsMemoryEditorExpanded(true)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-cyan)', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Maximize2 size={13} /> ขยายพื้นที่พิมพ์
                    </button>
                    {current.aiMemoryDirectives && (
                      <button type="button" onClick={() => setCurrent({ ...current, aiMemoryDirectives: '' })} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: '0.7rem', cursor: 'pointer' }}>
                        ล้างข้อความ
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!current.enableAiMemory && (
              <div style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                ปิดอยู่: จะไม่บันทึกข้อความจากกล่องนี้เข้า Playlist เมื่อกดบันทึกการตั้งค่า
              </div>
            )}
          </div>

          {/* Section 4: Speech Bubble Backdrop Transparency */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={14} color="#38bdf8" />
                ความโปร่งใสของพื้นหลังฟองคำพูด (Backdrop Opacity):
              </label>
              <span style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>
                {Math.round((current.bubbleOpacity ?? 0.85) * 100)}% (มองเห็นภาพวาดด้านหลัง)
              </span>
            </div>
            <input
              type="range"
              min="0.2"
              max="1.0"
              step="0.05"
              value={current.bubbleOpacity ?? 0.85}
              onChange={(e) => setCurrent({ ...current, bubbleOpacity: parseFloat(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              * ปรับความโปร่งแสงเพื่อให้เห็นเส้นภาพวาดด้านหลังอย่างเป็นธรรมชาติ ไม่เป็นแผ่นขาวทึบแข็ง
            </span>
          </div>

          {/* Section 5: Natural Neural Voice Selector (Microsoft Edge / Google) */}
          <div className="form-group">
            <label className="voice-select-label">
              <Volume2 size={14} color="#10b981" />
              โมเดลเสียงอ่านออกเสียง (Microsoft Edge Natural Voice / Neural TTS)
            </label>
            <div className="voice-select-row">
              <select
                className="input-text voice-select"
                value={current.selectedVoiceName || ''}
                onChange={(e) => setCurrent({ ...current, selectedVoiceName: e.target.value })}
                title={current.selectedVoiceName || undefined}
              >
                <option value="">เสียงธรรมชาติเริ่มต้น (Microsoft Edge Natural / Google Neural)</option>
                {availableVoices
                  .filter(v => v.lang.startsWith('th') || v.lang.startsWith('en') || v.name.includes('Natural') || v.name.includes('Online'))
                  .map((voice) => (
                    <option key={voice.name} value={voice.name}>
                      {voice.name} ({voice.lang}) {voice.name.includes('Natural') ? '🌟 Natural' : ''}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="btn-secondary voice-test-button"
                onClick={handleTestVoice}
                disabled={isPlayingTestVoice}
              >
                <Volume2 size={13} /> {isPlayingTestVoice ? 'กำลังเล่น...' : 'ทดลองฟังเสียง'}
              </button>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              * แนะนำให้เปิดใช้งานบนเบราว์เซอร์ Microsoft Edge เพื่อคุณภาพเสียงระดับ Neural HD ภาษาไทยธรรมชาติ
            </span>
          </div>

          {/* Section 6: Smart Cache Management */}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Database size={14} color="#a855f7" />
              จัดการข้อมูลแคชแปลภาษา (Cache Management)
            </label>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>
                  แคช OCR: {cacheInfo.count} รายการ ({cacheInfo.sizeKb} KB)
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                  ใช้ผลแปลเดิมซ้ำได้โดยไม่ต้องเรียก AI ใหม่
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleClearCache}
                style={{ color: '#facc15', borderColor: 'rgba(250,204,21,0.3)', flexShrink: 0 }}
              >
                <Trash2 size={13} /> ล้างแคช
              </button>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                marginTop: '8px',
                padding: '10px 14px',
                background: 'rgba(239,68,68,0.045)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: '8px',
              }}
            >
              <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.84rem', fontWeight: 600 }}>
                  <HardDriveDownload size={14} color="#f87171" />
                  ข้อมูลทั้งหมดที่จะลบ
                  <span style={{ color: '#fca5a5', whiteSpace: 'nowrap' }}>
                    {formatStorageUsage(appDataInfo?.totalBytes ?? null)} โดยประมาณ
                  </span>
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '3px' }}>
                  {appDataInfo
                    ? `${appDataInfo.pageCount} หน้า/รูป · ${appDataInfo.bubbleCount} ข้อความ · ${appDataInfo.playlistCount} Playlist · ${appDataInfo.chapterCount} ตอน · ${appDataInfo.cacheEntryCount} แคช · ${appDataInfo.settingsCount} ชุดตั้งค่า`
                    : 'กำลังตรวจสอบข้อมูลที่จัดเก็บ...'}
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleResetAppData}
                disabled={isResettingAppData}
                style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)', flexShrink: 0 }}
              >
                <Trash2 size={13} /> {isResettingAppData ? 'กำลังลบ...' : 'ลบข้อมูลทั้งหมด'}
              </button>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '6px' }}>
              ขนาดคำนวณจากข้อมูลของแอปใน localStorage และ IndexedDB เป็นค่าประมาณ ไม่รวมพื้นที่ของเว็บหรือไฟล์ Windows อื่น
            </div>
          </div>

          {/* Backup & Restore Section */}
          {onOpenBackup && (
            <div className="settings-group" style={{ marginTop: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Archive size={14} color="#f59e0b" />
                สำรองข้อมูล ย้ายเครื่อง & นำเข้า-ส่งออก (Full Backup & Restore)
              </label>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>
                    ส่งออกหรือนำเข้าข้อมูลทั้งหมด เพื่อย้ายเครื่อง หรือสำรองข้อมูล
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                    รวมคีย์ API, รายการโมเดล, คลัง Playlist, ตอนมังงะ และคำสั่งบริบทเรื่อง
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    onClose();
                    setTimeout(() => onOpenBackup(), 150);
                  }}
                  style={{ color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)', whiteSpace: 'nowrap' }}
                >
                  <HardDriveDownload size={13} /> เปิดระบบสำรองข้อมูล
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {toastMessage && (
              <span style={{ color: '#34d399', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Check size={14} /> {toastMessage}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-secondary" onClick={onClose}>
              ยกเลิก
            </button>
            <button className="btn-primary" onClick={handleSave}>
              บันทึกการตั้งค่า
            </button>
          </div>
        </div>
      </div>

      {isMemoryEditorExpanded && (
        <div className="modal-backdrop memory-editor-backdrop" onMouseDown={() => setIsMemoryEditorExpanded(false)}>
          <section className="memory-editor-expanded" onMouseDown={(event) => event.stopPropagation()}>
            <div className="memory-editor-expanded-header">
              <div>
                <h2>AI Memory & Glossary</h2>
                <p>{activePlaylistName ? `กำลังแก้บริบทของ ${activePlaylistName}` : 'เลือก Playlist ก่อนบันทึกบริบท'}</p>
              </div>
              <button type="button" className="btn-icon" onClick={() => setIsMemoryEditorExpanded(false)} title="ย่อพื้นที่พิมพ์"><Minimize2 size={17} /></button>
            </div>
            <textarea
              autoFocus
              value={current.aiMemoryDirectives || ''}
              onChange={(event) => setCurrent({ ...current, aiMemoryDirectives: event.target.value })}
              placeholder="พิมพ์บริบท รายชื่อตัวละคร สกิล องค์กร หรือรูปแบบ ชื่อเดิม -> ชื่อไทย"
            />
            <div className="memory-editor-expanded-footer">
              <span>กด “บันทึกการตั้งค่า” ในหน้าหลักเพื่อนำบริบทเข้า Playlist</span>
              <button type="button" className="btn-primary" onClick={() => setIsMemoryEditorExpanded(false)}><Check size={15} /> เสร็จสิ้น</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
