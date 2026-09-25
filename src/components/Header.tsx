import React from 'react';
import { 
  Sparkles, 
  Settings, 
  Download, 
  Play, 
  Layers, 
  Image as ImageIcon, 
  Columns, 
  Key, 
  RefreshCw,
  Eye,
  Zap,
  Cpu,
  AlertCircle,
  BookOpen,
  BookmarkPlus
} from 'lucide-react';
import { GeminiModelId, ViewMode, AiProvider, OpenRouterModelEntry } from '../types';
import { GEMINI_MODELS } from '../data/models';

interface HeaderProps {
  provider: AiProvider;
  onSelectProvider: (provider: AiProvider) => void;
  selectedModel: GeminiModelId;
  customModelName: string;
  onSelectModel: (model: GeminiModelId) => void;
  openRouterModel: string;
  openRouterModelEntries: OpenRouterModelEntry[];
  onSelectOpenRouterModel: (modelId: string) => void;
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
  onTranslateAll: () => void;
  isTranslatingAny: boolean;
  apiKey: string;
  openRouterApiKey: string;
  onOpenSettings: () => void;
  onOpenExport: () => void;
  onOpenPlaylist?: () => void;
  onOpenSaveToPlaylist?: () => void;
  onGoToHome?: () => void;
  isInPlaylistMode?: boolean;
  activeChapterTitle?: string;
  playlistCount?: number;
  totalPages: number;
  translatedCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  provider = 'gemini',
  onSelectProvider,
  selectedModel,
  customModelName,
  onSelectModel,
  openRouterModel,
  openRouterModelEntries = [],
  onSelectOpenRouterModel,
  viewMode,
  onSetViewMode,
  onTranslateAll,
  isTranslatingAny,
  apiKey,
  openRouterApiKey,
  onOpenSettings,
  onOpenExport,
  onOpenPlaylist,
  onOpenSaveToPlaylist,
  onGoToHome,
  isInPlaylistMode = false,
  activeChapterTitle,
  playlistCount = 0,
  totalPages,
  translatedCount,
}) => {
  const isKeyConfigured = provider === 'openrouter'
    ? (openRouterApiKey && openRouterApiKey.trim().length > 0) || openRouterModelEntries.some(e => e.id === openRouterModel && e.key)
    : (apiKey && apiKey.trim().length > 0);

  // Active OpenRouter model info
  const activeOpenRouterEntry = openRouterModelEntries.find(e => e.id === openRouterModel);
  const isOpenRouterModelError = activeOpenRouterEntry?.status === 'error';

  return (
    <header className="header-bar">
      {/* Left: C2 Sub Auto AI Branding & Logo (Click to return to Home Studio) */}
      <div 
        className="logo-section header-brand" 
        onClick={onGoToHome}
        title="🏠 คลิกเพื่อกลับไปยังหน้าแรก / หน้าหลัก (Home Studio)"
      >
        <img 
          src="/logo.png" 
          alt="C2 Sub Auto AI" 
          onError={(e) => {
            const target = e.currentTarget as HTMLImageElement;
            if (!target.dataset.fallback) {
              target.dataset.fallback = '1';
              target.src = 'logo.png';
            }
          }}
          className="header-logo-img"
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        />
        <div className="app-title-group">
          <h1 className="header-title">
            <span>C2 Sub Auto AI</span>
            <span className="header-studio-badge">
              {isInPlaylistMode ? '📚 แก้ไขตอนใน Playlist' : '🏠 หน้าแรก (Studio)'}
            </span>
          </h1>
          <span className="header-subtitle">
            {isInPlaylistMode 
              ? `ตอน: ${activeChapterTitle} (กดโลโก้เพื่อกลับหน้าแรก)`
              : (totalPages > 0 ? `หน้าแรก (${translatedCount}/${totalPages} หน้าแปลแล้ว)` : 'AI Comic Translation')}
          </span>
        </div>
      </div>

      {/* Center: AI Provider Switcher & Model Selector & View Mode Switcher */}
      <div className="header-center-section">
        {/* Provider Switcher Tabs (Gemini vs OpenRouter) */}
        <div className="provider-switcher-container">
          <button
            onClick={() => onSelectProvider('gemini')}
            className={`provider-tab-btn ${provider === 'gemini' ? 'active-gemini' : ''}`}
            title="สลับไปใช้ Gemini AI (Google)"
          >
            <Zap size={13} fill={provider === 'gemini' ? '#ffffff' : 'none'} />
            <span>Gemini</span>
          </button>

          <button
            onClick={() => onSelectProvider('openrouter')}
            className={`provider-tab-btn ${provider === 'openrouter' ? 'active-openrouter' : ''}`}
            title="สลับไปใช้ OpenRouter API (Claude, StepFun, Qwen, DeepSeek ฯลฯ)"
          >
            <Cpu size={13} />
            <span>OpenRouter</span>
          </button>
        </div>

        {/* Dynamic Model Dropdown depending on Selected Provider */}
        {provider === 'gemini' ? (
          <div className="model-selector-group header-model-selector">
            <select
              value={selectedModel}
              onChange={(e) => onSelectModel(e.target.value as GeminiModelId)}
              className="model-select"
              title="เลือกโมเดล Gemini สำหรับ OCR และแปลภาษา"
            >
              {GEMINI_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} {model.badge ? `(${model.badge})` : ''}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="model-selector-group header-model-selector">
            <select
              value={openRouterModel}
              onChange={(e) => onSelectOpenRouterModel(e.target.value)}
              className="model-select"
              style={{
                borderColor: isOpenRouterModelError ? '#ef4444' : 'rgba(168, 85, 247, 0.5)',
                color: isOpenRouterModelError ? '#f87171' : undefined
              }}
              title="เลือกโมเดล OpenRouter ที่ตรวจจับได้จากกล่อง Smart Key Importer"
            >
              {openRouterModelEntries.length === 0 ? (
                <option value="">
                  + กรุณานำเข้ารายการโมเดลใน Settings
                </option>
              ) : (
                openRouterModelEntries.map((entry) => {
                  const isDead = entry.status === 'error';
                  return (
                    <option key={entry.id} value={entry.id} style={{ color: isDead ? '#ef4444' : undefined }}>
                      {isDead ? '❌ (Error) ' : '🟢 '}{entry.name}
                    </option>
                  );
                })
              )}
            </select>
          </div>
        )}

        {/* View Mode Switcher */}
        <div className="view-mode-tabs">
          <button 
            className={`view-mode-btn ${viewMode === 'original' ? 'active' : ''}`}
            onClick={() => onSetViewMode('original')}
            title="ดูภาพต้นฉบับดั้งเดิม (Original)"
          >
            <ImageIcon size={14} />
            <span className="view-mode-label">Original</span>
          </button>
          <button 
            className={`view-mode-btn ${viewMode === 'translated' ? 'active' : ''}`}
            onClick={() => onSetViewMode('translated')}
            title="ดูภาพพร้อมคำแปลไทย (Translated)"
          >
            <Layers size={14} />
            <span className="view-mode-label">Translated</span>
          </button>
          <button 
            className={`view-mode-btn ${viewMode === 'split' ? 'active' : ''}`}
            onClick={() => onSetViewMode('split')}
            title="ดูเปรียบเทียบต้นฉบับและคำแปล (Split View)"
          >
            <Columns size={14} />
            <span className="view-mode-label">Split View</span>
          </button>
          <button 
            className={`view-mode-btn ${viewMode === 'hover' ? 'active' : ''}`}
            onClick={() => onSetViewMode('hover')}
            title="ชี้เมาส์เพื่อดูต้นฉบับ (Hover)"
          >
            <Eye size={14} />
            <span className="view-mode-label">Hover</span>
          </button>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="header-right-section">
        {/* Playlist Library Button */}
        {onOpenPlaylist && (
          <button 
            className="btn-secondary header-btn"
            onClick={onOpenPlaylist}
            style={{
              borderColor: 'rgba(168, 85, 247, 0.4)',
              color: '#c084fc',
              background: 'rgba(168, 85, 247, 0.08)',
              fontWeight: 700
            }}
            title="เปิดดูคลังมังงะ & ซีรีส์ Playlist"
          >
            <BookOpen size={14} />
            <span className="header-btn-label">Playlist</span>
            {playlistCount > 0 && <span className="playlist-count-pill">({playlistCount})</span>}
          </button>
        )}

        {/* Save to Playlist Button */}
        {totalPages > 0 && onOpenSaveToPlaylist && (
          <button 
            className="btn-secondary header-btn"
            onClick={onOpenSaveToPlaylist}
            style={{
              borderColor: 'rgba(6, 182, 212, 0.4)',
              color: 'var(--accent-cyan)',
              background: 'rgba(6, 182, 212, 0.08)',
              fontWeight: 700
            }}
            title="บันทึกมังงะตอนนี้ลงใน Playlist"
          >
            <BookmarkPlus size={14} />
            <span className="header-btn-label">ส่งลง Playlist</span>
          </button>
        )}

        {/* API Key Status indicator */}
        <button 
          className="btn-secondary header-btn"
          onClick={onOpenSettings}
          style={{
            borderColor: isKeyConfigured ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)',
            color: isKeyConfigured ? '#34d399' : '#fbbf24',
          }}
          title={isKeyConfigured ? `${provider === 'openrouter' ? 'OpenRouter' : 'Gemini'} API Key เชื่อมต่อแล้ว` : 'กดเพื่อตั้งค่า API Key'}
        >
          <Key size={13} />
          <span className="header-btn-label">
            {isKeyConfigured ? `${provider === 'openrouter' ? 'OpenRouter' : 'Gemini'} OK` : 'Demo / ตั้งค่า Key'}
          </span>
        </button>

        {/* Translate All Chapter Button */}
        <button 
          className="btn-primary header-btn-primary"
          onClick={onTranslateAll}
          disabled={isTranslatingAny}
          style={{
            opacity: isTranslatingAny ? 0.7 : 1,
            background: provider === 'openrouter' ? 'linear-gradient(135deg, #a855f7, #ec4899)' : undefined
          }}
        >
          {isTranslatingAny ? (
            <>
              <div className="spinner" />
              <span>กำลังแปล...</span>
            </>
          ) : (
            <>
              <Play size={14} fill="#ffffff" />
              <span className="header-btn-label-full">แปลทั้งตอน ({totalPages} หน้า)</span>
              <span className="header-btn-label-short">แปล ({totalPages})</span>
            </>
          )}
        </button>

        {/* Export Button */}
        <button 
          className="btn-secondary header-btn"
          onClick={onOpenExport}
          title="ส่งออกรูปภาพที่แปลแล้ว, PDF หรือไฟล์ซับไตเติ้ล"
        >
          <Download size={14} />
          <span className="header-btn-label">ส่งออก</span>
        </button>

        {/* Settings Button */}
        <button 
          className="btn-secondary header-btn header-settings-btn"
          onClick={onOpenSettings}
          title="ตั้งค่าระบบ, โมเดล, ฟอนต์การ์ตูน และการแปล"
        >
          <Settings size={14} />
        </button>
      </div>
    </header>
  );
};
