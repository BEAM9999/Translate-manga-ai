import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Download,
  Upload,
  FolderDown,
  FolderUp,
  Archive,
  FileText,
  Key,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
  Layers,
  Database,
  Info,
  Check,
  RefreshCw,
  FolderCheck,
  Cloud,
  CloudUpload,
  CloudDownload,
  LogOut,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { AppSettings, MangaPlaylist } from '../types';
import {
  gatherFullBackupBundle,
  exportBackupToZipFile,
  exportBackupToJsonFile,
  exportBackupToDirectory,
  isFileSystemAccessSupported,
  parseBackupFromZip,
  parseBackupFromJson,
  parseBackupFromDirectoryFiles,
  restoreBackupBundle,
  BackupDataBundle,
  BackupValidationResult,
  RestoreOptions,
  RestoreResult,
  DirectoryExportProgress,
} from '../services/backupService';
import {
  signInWithGoogleDrive,
  signOutGoogleDrive,
  getStoredGoogleUser,
  getLastSyncTimestamp,
  uploadBackupToGoogleDrive,
  restoreBackupFromGoogleDrive,
  getGoogleDriveBackupInfo,
  GoogleDriveUser,
  GoogleDriveBackupInfo,
  CloudSyncProgress,
  GOOGLE_DRIVE_FOLDER_NAME,
} from '../services/googleDriveService';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'export' | 'import' | 'cloud';
  currentSettings?: AppSettings;
  onSettingsRestored?: (newSettings: AppSettings) => void;
  onDataRestored?: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'export',
  currentSettings,
  onSettingsRestored,
  onDataRestored,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import' | 'cloud'>(initialTab);

  // Export state
  const [exportPreview, setExportPreview] = useState<BackupDataBundle | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [exportIncludeImages, setExportIncludeImages] = useState(true);
  const [dirProgress, setDirProgress] = useState<DirectoryExportProgress | null>(null);

  // Google Drive state
  const [googleUser, setGoogleUser] = useState<GoogleDriveUser | null>(() => getStoredGoogleUser());
  const [isGoogleConnecting, setIsGoogleConnecting] = useState(false);
  const [isGoogleSyncing, setIsGoogleSyncing] = useState(false);
  const [isGoogleRestoring, setIsGoogleRestoring] = useState(false);
  const [googleBackupInfo, setGoogleBackupInfo] = useState<GoogleDriveBackupInfo | null>(null);
  const [googleMessage, setGoogleMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(() => getLastSyncTimestamp());
  const [cloudProgress, setCloudProgress] = useState<CloudSyncProgress | null>(null);

  // Import state
  const [isParsing, setIsParsing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [importValidation, setImportValidation] = useState<BackupValidationResult | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);

  // Import configuration options
  const [restoreSettings, setRestoreSettings] = useState(true);
  const [restorePlaylists, setRestorePlaylists] = useState(true);
  const [playlistRestoreMode, setPlaylistRestoreMode] = useState<'merge' | 'overwrite'>('merge');
  const [restoreWorkspaceDraft, setRestoreWorkspaceDraft] = useState(false);

  // Refs for hidden inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setExportMessage(null);
      setImportValidation(null);
      setRestoreResult(null);
      setGoogleMessage(null);
      loadExportStats();
      const user = getStoredGoogleUser();
      setGoogleUser(user);
      if (user) {
        getGoogleDriveBackupInfo().then(info => setGoogleBackupInfo(info)).catch(() => {});
      }
    }
  }, [isOpen, initialTab, currentSettings]);

  // Google Drive Handlers
  const handleConnectGoogle = async () => {
    setIsGoogleConnecting(true);
    setGoogleMessage(null);
    try {
      const user = await signInWithGoogleDrive();
      setGoogleUser(user);
      setGoogleMessage({
        text: `เชื่อมต่อกับบัญชี Google สำเร็จ (${user.email})`,
        type: 'success',
      });
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
      const info = await getGoogleDriveBackupInfo();
      setGoogleBackupInfo(info);
    } catch (err) {
      setGoogleMessage({
        text: `เชื่อมต่อไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
      });
    } finally {
      setIsGoogleConnecting(false);
    }
  };

  const handleUploadToGoogle = async () => {
    setIsGoogleSyncing(true);
    setGoogleMessage(null);
    setCloudProgress({
      stage: 'checking',
      current: 0,
      total: 100,
      percent: 5,
      message: 'กำลังเชื่อมต่อและตรวจสอบไฟล์บน Google Drive...',
    });
    try {
      const res = await uploadBackupToGoogleDrive(
        currentSettings,
        { includeImages: exportIncludeImages },
        (prog) => setCloudProgress(prog)
      );
      const now = Date.now();
      setLastSyncTime(now);
      setGoogleMessage({
        text: `สำรองข้อมูลขึ้น Google Drive สำเร็จ! ซิงค์ตอนใหม่ ${res.chaptersSynced} จาก ${res.totalChapters} ตอน (โฟลเดอร์ "${GOOGLE_DRIVE_FOLDER_NAME}") โดยไม่กิน RAM เครื่อง`,
        type: 'success',
      });
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.7 } });
      const info = await getGoogleDriveBackupInfo();
      setGoogleBackupInfo(info);
    } catch (err) {
      setGoogleMessage({
        text: `สำรองขึ้น Google Drive ล้มเหลว: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
      });
    } finally {
      setIsGoogleSyncing(false);
      setCloudProgress(null);
    }
  };

  const handleRestoreFromGoogle = async () => {
    if (!window.confirm('คุณต้องการนำเข้าข้อมูลและคำแปลจาก Google Drive มาบันทึกทับ/ผสานลงในเครื่องนี้ใช่หรือไม่?')) {
      return;
    }
    setIsGoogleRestoring(true);
    setGoogleMessage(null);
    setCloudProgress({
      stage: 'checking',
      current: 0,
      total: 100,
      percent: 5,
      message: 'กำลังอ่านไฟล์และดัชนีคลังจาก Google Drive...',
    });
    try {
      const result = await restoreBackupFromGoogleDrive(
        {
          restoreSettings,
          restorePlaylists,
          playlistRestoreMode,
          restoreWorkspaceDraft,
        },
        onSettingsRestored,
        (prog) => setCloudProgress(prog)
      );
      setRestoreResult(result);
      onDataRestored?.();
      loadExportStats();
      setGoogleMessage({
        text: `กู้คืนข้อมูลจาก Google Drive สำเร็จ (Playlist ทั้งหมด: ${result.totalPlaylistsCount} เรื่อง, ตอนที่กู้คืน: ${result.chaptersRestoredCount} ตอน)`,
        type: 'success',
      });
      confetti({ particleCount: 80, spread: 80, origin: { y: 0.7 } });
    } catch (err) {
      setGoogleMessage({
        text: `ดึงข้อมูลจาก Google Drive ล้มเหลว: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
      });
    } finally {
      setIsGoogleRestoring(false);
      setCloudProgress(null);
    }
  };

  const handleSignOutGoogle = () => {
    signOutGoogleDrive();
    setGoogleUser(null);
    setGoogleBackupInfo(null);
    setGoogleMessage({
      text: 'ออกจากระบบ Google Drive ในเครื่องนี้แล้ว',
      type: 'success',
    });
  };

  const loadExportStats = async () => {
    try {
      const bundle = await gatherFullBackupBundle(currentSettings);
      setExportPreview(bundle);
    } catch (e) {
      console.warn('Failed to calculate export stats:', e);
    }
  };

  if (!isOpen) return null;

  // Handle Export Actions
  const handleExportZip = async () => {
    setIsExporting(true);
    setExportMessage(null);
    try {
      const filename = await exportBackupToZipFile(currentSettings, { includeImages: exportIncludeImages });
      setExportMessage({
        text: `ดาวน์โหลดไฟล์ ZIP โฟลเดอร์สำรอง "${filename}" เรียบร้อยแล้ว`,
        type: 'success',
      });
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
    } catch (err) {
      setExportMessage({
        text: `เกิดข้อผิดพลาดในการส่งออก ZIP: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportJson = async () => {
    setIsExporting(true);
    setExportMessage(null);
    try {
      const filename = await exportBackupToJsonFile(currentSettings, { includeImages: exportIncludeImages });
      setExportMessage({
        text: `ดาวน์โหลดไฟล์ JSON สำรอง "${filename}" เรียบร้อยแล้ว`,
        type: 'success',
      });
      confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
    } catch (err) {
      setExportMessage({
        text: `เกิดข้อผิดพลาดในการส่งออก JSON: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportDirectory = async () => {
    setIsExporting(true);
    setExportMessage(null);
    setDirProgress({
      stage: 'init',
      current: 0,
      total: 100,
      percent: 5,
      message: 'กำลังเลือกโฟลเดอร์ปลายทางในคอมพิวเตอร์...',
    });
    try {
      const result = await exportBackupToDirectory(
        currentSettings,
        { includeImages: exportIncludeImages },
        (prog) => setDirProgress(prog)
      );
      if (result.success) {
        setExportMessage({
          text: `บันทึกไฟล์สตรีมมิ่งลงในโฟลเดอร์ "${result.folderName}" เรียบร้อยแล้ว (ไม่กิน RAM เครื่อง)`,
          type: 'success',
        });
        confetti({ particleCount: 70, spread: 70, origin: { y: 0.7 } });
      } else if (result.error && result.error !== 'ยกเลิกการเลือกโฟลเดอร์') {
        setExportMessage({
          text: result.error,
          type: 'error',
        });
      }
    } catch (err) {
      setExportMessage({
        text: `เกิดข้อผิดพลาดในการเขียนโฟลเดอร์: ${err instanceof Error ? err.message : String(err)}`,
        type: 'error',
      });
    } finally {
      setIsExporting(false);
      setDirProgress(null);
    }
  };

  // Handle Import File / Folder Selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setImportValidation(null);
    setRestoreResult(null);

    try {
      let result: BackupValidationResult;
      if (file.name.endsWith('.zip')) {
        result = await parseBackupFromZip(file);
      } else if (file.name.endsWith('.json')) {
        result = await parseBackupFromJson(file);
      } else {
        result = {
          isValid: false,
          errors: ['กรุณาเลือกไฟล์สำรองที่มีนามสกุล .zip หรือ .json'],
          warnings: [],
        };
      }

      setImportValidation(result);
    } catch (err) {
      setImportValidation({
        isValid: false,
        errors: [`ไม่สามารถอ่านไฟล์ได้: ${err instanceof Error ? err.message : String(err)}`],
        warnings: [],
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleFolderChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsParsing(true);
    setImportValidation(null);
    setRestoreResult(null);

    try {
      const result = await parseBackupFromDirectoryFiles(files);
      setImportValidation(result);
    } catch (err) {
      setImportValidation({
        isValid: false,
        errors: [`ไม่สามารถอ่านโฟลเดอร์ได้: ${err instanceof Error ? err.message : String(err)}`],
        warnings: [],
      });
    } finally {
      setIsParsing(false);
    }
  };

  // Drag & Drop Handler
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setImportValidation(null);
    setRestoreResult(null);

    try {
      let result: BackupValidationResult;
      if (file.name.endsWith('.zip')) {
        result = await parseBackupFromZip(file);
      } else if (file.name.endsWith('.json')) {
        result = await parseBackupFromJson(file);
      } else {
        result = {
          isValid: false,
          errors: ['กรุณาลากวางไฟล์นามสกุล .zip หรือ .json เท่านั้น'],
          warnings: [],
        };
      }
      setImportValidation(result);
    } catch (err) {
      setImportValidation({
        isValid: false,
        errors: [`ไม่สามารถอ่านไฟล์ได้: ${err instanceof Error ? err.message : String(err)}`],
        warnings: [],
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Execute Restore
  const handleExecuteRestore = async () => {
    if (!importValidation?.isValid || !importValidation.bundle) return;

    const options: RestoreOptions = {
      restoreSettings,
      restorePlaylists,
      playlistRestoreMode,
      restoreWorkspaceDraft,
    };

    if (!options.restoreSettings && !options.restorePlaylists && !options.restoreWorkspaceDraft) {
      alert('กรุณาเลือกอย่างน้อยหนึ่งรายการที่ต้องการนำเข้า');
      return;
    }

    if (options.playlistRestoreMode === 'overwrite') {
      const confirmed = confirm(
        'คำเตือน: คุณเลือกโหมด "แทนที่ทั้งหมด (Overwrite)" คลัง Playlist เดิมในโปรแกรมทั้งหมดจะถูกลบและแทนที่ด้วยข้อมูลจากไฟล์สำรองนี้ คุณต้องการดำเนินการต่อหรือไม่?'
      );
      if (!confirmed) return;
    }

    setIsRestoring(true);
    try {
      const result = await restoreBackupBundle(
        importValidation.bundle,
        options,
        onSettingsRestored
      );

      setRestoreResult(result);
      if (onDataRestored) {
        onDataRestored();
      }
      confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
    } catch (err) {
      alert(`เกิดข้อผิดพลาดในการกู้คืนข้อมูล: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsRestoring(false);
    }
  };

  const hasFsAccess = isFileSystemAccessSupported();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '780px',
          width: '92%',
          background: 'rgba(17, 19, 31, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(168, 85, 247, 0.3)',
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 40px rgba(168, 85, 247, 0.15)',
        }}
      >
        {/* Header */}
        <div className="modal-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #a855f7, #06b6d4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(168,85,247,0.4)',
              }}
            >
              <Archive size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#ffffff' }}>
                ระบบสำรองและนำเข้าข้อมูลทั้งหมด (Full Backup & Restore)
              </h3>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                ส่งออกหรือนำเข้าคีย์ API, รายการโมเดล, คลัง Playlist, ตอนมังงะ และคำสั่งบริบทเรื่อง เพื่อใช้กับเครื่องอื่น
              </span>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} title="ปิด">
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: 'flex',
            padding: '12px 20px 0 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            gap: '8px',
          }}
        >
          <button
            onClick={() => setActiveTab('export')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px 8px 0 0',
              border: 'none',
              background: activeTab === 'export' ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
              borderBottom: activeTab === 'export' ? '2px solid #a855f7' : '2px solid transparent',
              color: activeTab === 'export' ? '#c084fc' : 'var(--text-dim)',
              fontSize: '0.86rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            <FolderDown size={15} />
            <span>📤 ส่งออกข้อมูลทั้งหมด (Export)</span>
          </button>

          <button
            onClick={() => setActiveTab('import')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px 8px 0 0',
              border: 'none',
              background: activeTab === 'import' ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
              borderBottom: activeTab === 'import' ? '2px solid #06b6d4' : '2px solid transparent',
              color: activeTab === 'import' ? 'var(--accent-cyan)' : 'var(--text-dim)',
              fontSize: '0.86rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            <FolderUp size={15} />
            <span>📥 นำเข้าข้อมูล (Import / Restore)</span>
          </button>

          <button
            onClick={() => setActiveTab('cloud')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px 8px 0 0',
              border: 'none',
              background: activeTab === 'cloud' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              borderBottom: activeTab === 'cloud' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'cloud' ? '#60a5fa' : 'var(--text-dim)',
              fontSize: '0.86rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            <Cloud size={15} />
            <span>☁️ ซิงค์ Google Drive (ฟรี 15 GB)</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="modal-body" style={{ padding: '20px', maxHeight: '68vh', overflowY: 'auto' }}>
          {activeTab === 'export' ? (
            <div>
              {/* Export Overview Cards */}
              <div
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '18px',
                }}
              >
                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={15} color="#a855f7" />
                  สรุปข้อมูลที่จะถูกส่งออก (Ready for Export)
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  {/* Settings Card */}
                  <div
                    style={{
                      background: 'rgba(168,85,247,0.06)',
                      border: '1px solid rgba(168,85,247,0.2)',
                      borderRadius: '8px',
                      padding: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#c084fc', fontWeight: 700, fontSize: '0.82rem', marginBottom: '6px' }}>
                      <Key size={14} /> คีย์ API & การตั้งค่า
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                      • Gemini Keys: <b>{exportPreview?.manifest.stats.geminiKeysCount || 0}</b> ตัว<br />
                      • OpenRouter Models: <b>{exportPreview?.manifest.stats.openRouterModelsCount || 0}</b> โมเดล<br />
                      • ฟอนต์, สไตล์ฟอง, เสียง TTS ครบถ้วน
                    </div>
                  </div>

                  {/* Playlists Card */}
                  <div
                    style={{
                      background: 'rgba(6,182,212,0.06)',
                      border: '1px solid rgba(6,182,212,0.2)',
                      borderRadius: '8px',
                      padding: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-cyan)', fontWeight: 700, fontSize: '0.82rem', marginBottom: '6px' }}>
                      <BookOpen size={14} /> คลัง Playlist & บริบทเรื่อง
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                      • จำนวน Playlist: <b>{exportPreview?.manifest.stats.playlistsCount || 0}</b> เรื่อง<br />
                      • จำนวนตอนทั้งหมด: <b>{exportPreview?.manifest.stats.totalChaptersCount || 0}</b> ตอน<br />
                      • ศัพท์/ชื่อตัวละคร: <b>{exportPreview?.manifest.stats.totalMemoriesCount || 0}</b> รายการ
                    </div>
                  </div>

                  {/* Workspace Draft Card */}
                  <div
                    style={{
                      background: 'rgba(16,185,129,0.06)',
                      border: '1px solid rgba(16,185,129,0.2)',
                      borderRadius: '8px',
                      padding: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontWeight: 700, fontSize: '0.82rem', marginBottom: '6px' }}>
                      <Layers size={14} /> หน้าแรก Home Studio
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                      • หน้าภาพที่กำลังทำค้างอยู่: <b>{exportPreview?.manifest.stats.workspaceDraftPagesCount || 0}</b> หน้า<br />
                      • บันทึกกล่องคำแปลและภาพดั้งเดิมไว้พร้อมทำต่อ
                    </div>
                  </div>
                </div>

                {/* Folder Structure Explanation */}
                <div
                  style={{
                    marginTop: '14px',
                    padding: '10px 12px',
                    background: 'rgba(0,0,0,0.25)',
                    borderRadius: '8px',
                    fontSize: '0.73rem',
                    color: 'var(--text-dim)',
                    lineHeight: 1.5,
                  }}
                >
                  📁 <b>โครงสร้างโฟลเดอร์เมื่อส่งออก:</b> ข้างในจะมีไฟล์ <code>settings.json</code> (คีย์และการตั้งค่า), <code>raw_keys_and_models.txt</code>, <code>playlists.json</code>, และโฟลเดอร์ย่อย <code>playlists/</code> ที่แยกตามชื่อเรื่องมังงะ ซึ่งข้างในจะมี <code>context_instructions.txt</code> (คำสั่งบริบทเรื่อง), <code>memory_glossary.json</code> (คลังชื่อตัวละคร) และ <code>chapters.json</code> อย่างเป็นระเบียบ
                </div>
              </div>

              {/* Status Message */}
              {exportMessage && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: exportMessage.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    border: exportMessage.type === 'success' ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(239,68,68,0.3)',
                    color: exportMessage.type === 'success' ? '#34d399' : '#f87171',
                  }}
                >
                  {exportMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  <span>{exportMessage.text}</span>
                </div>
              )}

              {/* Export Configuration Option: Include Images */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '10px',
                  marginBottom: '14px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', fontWeight: 600, color: '#f8fafc' }}>
                    <span>🖼️ รวมไฟล์รูปภาพหน้ามังงะต้นฉบับลงในไฟล์สำรอง</span>
                    <span style={{ fontSize: '0.7rem', padding: '2px 6px', background: exportIncludeImages ? 'rgba(52,211,153,0.15)' : 'rgba(148,163,184,0.15)', color: exportIncludeImages ? '#34d399' : '#94a3b8', borderRadius: '4px' }}>
                      {exportIncludeImages ? 'สำรองภาพครบถ้วน' : 'สำรองเฉพาะคำแปล/คลังศัพท์ (เบาพิเศษ)'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '3px', lineHeight: 1.4 }}>
                    {exportIncludeImages
                      ? '✓ แยกเก็บไฟล์ภาพเป็นไฟล์ไบนารีใน ZIP อย่างปลอดภัย ไม่ติดข้อจำกัดความยาวตัวอักษรของเบราว์เซอร์'
                      : '✓ ไม่รวมรูปภาพต้นฉบับ สำรองเฉพาะคีย์ API, การตั้งค่า, คลังชื่อตัวละคร และตำแหน่งกล่องคำแปล (ไฟล์เบาหลัก KB โอนย้ายไวมาก)'}
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px', flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={exportIncludeImages}
                    onChange={(e) => setExportIncludeImages(e.target.checked)}
                    style={{
                      width: '18px',
                      height: '18px',
                      accentColor: 'var(--accent-cyan)',
                      cursor: 'pointer',
                    }}
                  />
                </label>
              </div>

              {/* Directory Progress Bar */}
              {dirProgress && (
                <div
                  style={{
                    background: 'rgba(168,85,247,0.08)',
                    border: '1px solid rgba(168,85,247,0.3)',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', fontWeight: 700, color: '#d8b4fe' }}>
                      <Loader2 size={16} className="spin-animation" />
                      <span>{dirProgress.message}</span>
                    </div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#c084fc', padding: '2px 8px', background: 'rgba(192,132,252,0.15)', borderRadius: '6px' }}>
                      {dirProgress.percent}%
                    </span>
                  </div>

                  <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${dirProgress.percent}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #a855f7, #6366f1, #06b6d4)',
                        borderRadius: '4px',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                    <span>⚡ สตรีมมิ่งเขียนลงโฟลเดอร์ทีละตอน (ปลอดภัยจาก Invalid string length และ Memory Crash)</span>
                    <span>{dirProgress.current} / {dirProgress.total} ตอน</span>
                  </div>
                </div>
              )}

              {/* Export Action Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Option 1: Direct to Folder (File System Access) */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 18px',
                    background: 'rgba(168,85,247,0.06)',
                    border: '1px solid rgba(168,85,247,0.35)',
                    borderRadius: '12px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.9rem', color: '#ffffff' }}>
                      <FolderDown size={17} color="#c084fc" />
                      <span>บันทึกกระจายไฟล์ลงโฟลเดอร์ในเครื่อง (Streaming Folder)</span>
                      <span style={{ fontSize: '0.68rem', padding: '2px 6px', background: 'rgba(168,85,247,0.2)', color: '#d8b4fe', borderRadius: '4px', fontWeight: 700 }}>
                        แนะนำสูงสุด ⭐ ไม่กิน RAM
                      </span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '4px', lineHeight: 1.4 }}>
                      สตรีมมิ่งเขียนไฟล์ทีละตอนลงฮาร์ดดิสก์โดยตรง (โครงสร้างเหมือน Google Drive) ไม่กิน RAM เครื่อง ป้องกันข้อผิดพลาด "Invalid string length" แม้จะมีมังงะหลายร้อยหลายพันตอน
                    </div>
                  </div>
                  <button
                    className="btn-primary"
                    onClick={handleExportDirectory}
                    disabled={isExporting || !hasFsAccess}
                    style={{
                      whiteSpace: 'nowrap',
                      padding: '8px 16px',
                      fontSize: '0.84rem',
                      opacity: !hasFsAccess ? 0.5 : 1,
                      background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                    }}
                    title={!hasFsAccess ? 'เบราว์เซอร์นี้ไม่รองรับ File System Access API แนะนำให้ดาวน์โหลดเป็นไฟล์ ZIP ด้านล่าง' : 'เลือกโฟลเดอร์เพื่อบันทึกไฟล์'}
                  >
                    {isExporting && dirProgress ? <Loader2 size={14} className="spin-animation" /> : <FolderDown size={14} />}
                    <span>{hasFsAccess ? 'เลือกโฟลเดอร์บันทึก' : 'ไม่รองรับบนเบราว์เซอร์นี้'}</span>
                  </button>
                </div>

                {/* Option 2: Download ZIP (Universal) */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(6,182,212,0.3)',
                    borderRadius: '10px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.9rem', color: '#ffffff' }}>
                      <Archive size={17} color="var(--accent-cyan)" />
                      <span>ดาวน์โหลดเป็นไฟล์ ZIP รวมก้อนเดียว (.zip Archive)</span>
                      <span style={{ fontSize: '0.68rem', padding: '2px 6px', background: 'rgba(6,182,212,0.15)', color: 'var(--accent-cyan)', borderRadius: '4px', fontWeight: 600 }}>
                        ไฟล์เดี่ยวสะดวกย้ายเครื่อง
                      </span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '3px' }}>
                      บีบอัดข้อมูลทั้งหมดเป็นไฟล์ ZIP ก้อนเดียว เหมาะสำหรับปริมาณตอนทั่วไปที่ต้องการไฟล์เดียวส่งต่อทาง LINE หรืออีเมล
                    </div>
                  </div>
                  <button
                    className="btn-primary"
                    onClick={handleExportZip}
                    disabled={isExporting}
                    style={{
                      whiteSpace: 'nowrap',
                      padding: '8px 16px',
                      fontSize: '0.84rem',
                      background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                    }}
                  >
                    {isExporting && !dirProgress ? <Loader2 size={14} className="spin-animation" /> : <Download size={14} />}
                    <span>ดาวน์โหลด ZIP</span>
                  </button>
                </div>

                {/* Option 3: Download Single JSON */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '10px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.9rem', color: '#ffffff' }}>
                      <FileText size={17} color="#94a3b8" />
                      ส่งออกเป็นไฟล์สำรองเดี่ยว (.json)
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '3px' }}>
                      ไฟล์ JSON ไฟล์เดียวรวมการตั้งค่าและคลังมังงะ เหมาะสำหรับกู้คืนแบบด่วน
                    </div>
                  </div>
                  <button
                    className="btn-secondary"
                    onClick={handleExportJson}
                    disabled={isExporting}
                    style={{ whiteSpace: 'nowrap', padding: '8px 16px', fontSize: '0.84rem' }}
                  >
                    {isExporting ? <Loader2 size={14} className="spin-animation" /> : <Download size={14} />}
                    <span>ดาวน์โหลด JSON</span>
                  </button>
                </div>
              </div>
            </div>
          ) : activeTab === 'import' ? (
            <div>
              {/* Import View */}
              {/* Hidden Inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,.json"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <input
                ref={folderInputRef}
                type="file"
                // @ts-expect-error - webkitdirectory is standard for folder inputs
                webkitdirectory=""
                directory=""
                style={{ display: 'none' }}
                onChange={handleFolderChange}
              />

              {/* Upload Dropzone */}
              {!importValidation?.bundle && !restoreResult && (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  style={{
                    border: '2px dashed rgba(6,182,212,0.35)',
                    borderRadius: '12px',
                    padding: '30px 20px',
                    textAlign: 'center',
                    background: 'rgba(6,182,212,0.03)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    marginBottom: '18px',
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: 'rgba(6,182,212,0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 12px auto',
                      color: 'var(--accent-cyan)',
                    }}
                  >
                    {isParsing ? <Loader2 size={24} className="spin-animation" /> : <Upload size={24} />}
                  </div>

                  <div style={{ fontSize: '0.96rem', fontWeight: 700, color: '#ffffff', marginBottom: '4px' }}>
                    {isParsing ? 'กำลังอ่านและตรวจสอบไฟล์ข้อมูลสำรอง...' : 'ลากวางไฟล์สำรอง (.zip หรือ .json) ที่นี่'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '16px' }}>
                    รองรับไฟล์ ZIP โฟลเดอร์สำรอง, โฟลเดอร์ข้อมูลสำรอง, หรือไฟล์ JSON
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => fileInputRef.current?.click()}
                      style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                    >
                      <Archive size={14} /> เลือกไฟล์ ZIP / JSON
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => folderInputRef.current?.click()}
                      style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                    >
                      <FolderUp size={14} /> เลือกโฟลเดอร์สำรอง
                    </button>
                  </div>
                </div>
              )}

              {/* Import Validation Errors */}
              {importValidation && !importValidation.isValid && (
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    color: '#f87171',
                    fontSize: '0.82rem',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '4px' }}>
                    <AlertTriangle size={16} /> ไม่สามารถนำเข้าข้อมูลได้
                  </div>
                  {importValidation.errors.map((err: string, i: number) => (
                    <div key={i}>• {err}</div>
                  ))}
                  <button
                    className="btn-secondary"
                    onClick={() => setImportValidation(null)}
                    style={{ marginTop: '10px', fontSize: '0.75rem', padding: '4px 10px' }}
                  >
                    ลองเลือกไฟล์อื่น
                  </button>
                </div>
              )}

              {/* Import Preview Card (When Valid) */}
              {importValidation?.isValid && importValidation.bundle && !restoreResult && (
                <div
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(16,185,129,0.3)',
                    borderRadius: '12px',
                    padding: '16px',
                    marginBottom: '18px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontWeight: 700, fontSize: '0.92rem' }}>
                      <CheckCircle2 size={18} /> ตรวจพบข้อมูลสำรองที่สมบูรณ์
                    </div>
                    <button
                      className="btn-secondary"
                      onClick={() => setImportValidation(null)}
                      style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                    >
                      เปลี่ยนไฟล์
                    </button>
                  </div>

                  {/* Stats Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                    <div style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>คีย์ API & โมเดล</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#c084fc', marginTop: '2px' }}>
                        {importValidation.stats?.hasApiKeys ? '🟢 ตรวจพบคีย์ครบ' : '⚪ ไม่พบคีย์'}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                        OpenRouter: {importValidation.stats?.openRouterModelsCount} โมเดล
                      </div>
                    </div>

                    <div style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>คลัง Playlist</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent-cyan)', marginTop: '2px' }}>
                        {importValidation.stats?.playlistsCount} เรื่อง ({importValidation.stats?.chaptersCount} ตอน)
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                        ศัพท์/ชื่อ: {importValidation.stats?.memoriesCount} รายการ
                      </div>
                    </div>

                    <div style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>วันที่สำรองข้อมูล</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#e2e8f0', marginTop: '2px' }}>
                        {importValidation.bundle.manifest?.createdDateString || 'ไม่ระบุ'}
                      </div>
                    </div>
                  </div>

                  {/* Restoration Checklist & Options */}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '14px' }}>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#ffffff', marginBottom: '10px' }}>
                      เลือกข้อมูลที่ต้องการนำเข้า (Import Options):
                    </div>

                    {/* Option: Restore Settings */}
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        background: restoreSettings ? 'rgba(168,85,247,0.08)' : 'transparent',
                        marginBottom: '6px',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={restoreSettings}
                        onChange={(e) => setRestoreSettings(e.target.checked)}
                        disabled={!importValidation.stats?.hasSettings}
                        style={{ accentColor: '#a855f7', width: '16px', height: '16px' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#ffffff' }}>
                          🔑 นำเข้าการตั้งค่าและคีย์ API ทั้งหมด (Gemini, OpenRouter, ฟอนต์, คำสั่ง AI)
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                          รวมถึงข้อความต้นฉบับในกล่อง Smart Key Importer ให้ซิงก์ตรงกัน 100%
                        </div>
                      </div>
                    </label>

                    {/* Option: Restore Playlists */}
                    <div
                      style={{
                        padding: '10px',
                        borderRadius: '6px',
                        background: restorePlaylists ? 'rgba(6,182,212,0.08)' : 'transparent',
                        border: restorePlaylists ? '1px solid rgba(6,182,212,0.2)' : 'none',
                        marginBottom: '8px',
                      }}
                    >
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={restorePlaylists}
                          onChange={(e) => setRestorePlaylists(e.target.checked)}
                          disabled={importValidation.stats?.playlistsCount === 0}
                          style={{ accentColor: 'var(--accent-cyan)', width: '16px', height: '16px' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#ffffff' }}>
                            📚 นำเข้าคลัง Playlist มังงะ ทุกตอน และคำสั่งบริบทเรื่อง ({importValidation.stats?.playlistsCount} เรื่อง)
                          </div>
                        </div>
                      </label>

                      {restorePlaylists && (
                        <div style={{ marginLeft: '26px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: '#cbd5e1', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="plMode"
                              checked={playlistRestoreMode === 'merge'}
                              onChange={() => setPlaylistRestoreMode('merge')}
                              style={{ accentColor: 'var(--accent-cyan)' }}
                            />
                            <span><b>ผสานรวมกับคลังเดิม (Merge - แนะนำ)</b>: รักษา Playlist เดิมในเครื่องไว้ และเพิ่มหรืออัปเดตตอนใหม่</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: '#f87171', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="plMode"
                              checked={playlistRestoreMode === 'overwrite'}
                              onChange={() => setPlaylistRestoreMode('overwrite')}
                              style={{ accentColor: '#ef4444' }}
                            />
                            <span><b>แทนที่ทั้งหมด (Overwrite)</b>: ลบ Playlist เดิมในเครื่องทิ้งทั้งหมดและใช้เฉพาะชุดนี้</span>
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Option: Restore Workspace Draft */}
                    {importValidation.bundle.workspaceDraftPages && importValidation.bundle.workspaceDraftPages.length > 0 && (
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          background: restoreWorkspaceDraft ? 'rgba(16,185,129,0.08)' : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={restoreWorkspaceDraft}
                          onChange={(e) => setRestoreWorkspaceDraft(e.target.checked)}
                          style={{ accentColor: '#10b981', width: '16px', height: '16px' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#ffffff' }}>
                            📄 กู้คืนหน้างานร่างในหน้าแรก Studio ({importValidation.bundle.workspaceDraftPages.length} หน้า)
                          </div>
                        </div>
                      </label>
                    )}
                  </div>

                  {/* Action Button */}
                  <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setImportValidation(null)}
                      disabled={isRestoring}
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleExecuteRestore}
                      disabled={isRestoring || (!restoreSettings && !restorePlaylists && !restoreWorkspaceDraft)}
                      style={{
                        background: 'linear-gradient(135deg, #06b6d4, #10b981)',
                        padding: '8px 20px',
                        fontSize: '0.86rem',
                        fontWeight: 700,
                      }}
                    >
                      {isRestoring ? (
                        <>
                          <Loader2 size={15} className="spin-animation" />
                          <span>กำลังนำเข้าข้อมูล...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={15} />
                          <span>ยืนยันและนำเข้าข้อมูลเดี๋ยวนี้</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Restore Result Card (Success) */}
              {restoreResult && (
                <div
                  style={{
                    background: 'rgba(16,185,129,0.08)',
                    border: '1px solid rgba(16,185,129,0.3)',
                    borderRadius: '12px',
                    padding: '20px',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: 'rgba(16,185,129,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 12px auto',
                      color: '#34d399',
                    }}
                  >
                    <Check size={26} />
                  </div>

                  <h4 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', color: '#ffffff', fontWeight: 800 }}>
                    นำเข้าและกู้คืนข้อมูลสำเร็จเรียบร้อยแล้ว!
                  </h4>
                  <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                    ข้อมูลการตั้งค่า คีย์ API คลัง Playlist และคำสั่งบริบทเรื่องทั้งหมดถูกนำเข้าพร้อมใช้งานทันที
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      gap: '12px',
                      fontSize: '0.78rem',
                      color: '#cbd5e1',
                      marginBottom: '18px',
                    }}
                  >
                    {restoreResult.settingsRestored && (
                      <span style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                        🔑 การตั้งค่า: กู้คืนสำเร็จ
                      </span>
                    )}
                    <span style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                      📚 Playlist รวม: {restoreResult.totalPlaylistsCount} เรื่อง
                    </span>
                    {restoreResult.chaptersRestoredCount > 0 && (
                      <span style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                        📖 ตอนที่นำเข้า: {restoreResult.chaptersRestoredCount} ตอน
                      </span>
                    )}
                  </div>

                  <button
                    className="btn-primary"
                    onClick={onClose}
                    style={{ margin: '0 auto', padding: '8px 24px', fontSize: '0.86rem' }}
                  >
                    เสร็จสิ้น
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div>
              {/* Google Drive Cloud Sync Tab */}
              {/* Status Banner */}
              {googleMessage && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    marginBottom: '16px',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: googleMessage.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${googleMessage.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    color: googleMessage.type === 'success' ? '#34d399' : '#f87171',
                  }}
                >
                  {googleMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  <span style={{ flex: 1, lineHeight: 1.4 }}>{googleMessage.text}</span>
                  {googleMessage.type === 'error' && (
                    <button
                      className="btn-secondary"
                      onClick={handleConnectGoogle}
                      disabled={isGoogleConnecting}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.78rem',
                        whiteSpace: 'nowrap',
                        borderColor: 'rgba(239,68,68,0.4)',
                        color: '#ffffff',
                        background: 'rgba(239,68,68,0.2)',
                        cursor: 'pointer',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      title="เข้าสู่ระบบ Google เพื่อขอสิทธิ์การเข้าถึงใหม่อีกครั้ง"
                    >
                      <RefreshCw size={12} className={isGoogleConnecting ? 'spin-animation' : ''} />
                      <span>เชื่อมต่อใหม่อีกครั้ง</span>
                    </button>
                  )}
                  <button
                    onClick={() => setGoogleMessage(null)}
                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '2px' }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {!googleUser ? (
                /* Not Connected View */
                <div
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(59,130,246,0.3)',
                    borderRadius: '14px',
                    padding: '24px 20px',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(6,182,212,0.2))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px auto',
                      color: '#60a5fa',
                      border: '1px solid rgba(59,130,246,0.4)',
                    }}
                  >
                    <Cloud size={32} />
                  </div>

                  <h4 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 800, color: '#ffffff' }}>
                    ซิงค์ข้อมูลมังงะและคำแปลข้ามเครื่องด้วย Google Drive
                  </h4>
                  <p
                    style={{
                      margin: '0 auto 20px auto',
                      maxWidth: '540px',
                      fontSize: '0.84rem',
                      color: 'var(--text-dim)',
                      lineHeight: 1.5,
                    }}
                  >
                    เชื่อมต่อบัญชี Google ของคุณเพื่อสำรองข้อมูลและนำเข้าข้อมูลได้ฟรี 15 GB โดยข้อมูลจะถูกเก็บไว้ใน Google Drive ส่วนตัวของคุณ 100% ปลอดภัย ไม่ต้องเสียค่าบริการเซิร์ฟเวอร์ใดๆ
                  </p>

                  {/* Highlights Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '12px',
                      textAlign: 'left',
                      marginBottom: '24px',
                    }}
                  >
                    <div
                      style={{
                        padding: '12px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: '10px',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontWeight: 700, fontSize: '0.86rem', marginBottom: '4px' }}>
                        <ShieldCheck size={16} /> เป็นส่วนตัว ปลอดภัย 100%
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', lineHeight: 1.4 }}>
                        ขอสิทธิ์เฉพาะไฟล์ที่สร้างโดยเว็บนี้เท่านั้น ไม่สามารถเข้าถึงไฟล์ส่วนตัวอื่นๆ ใน Google Drive ของคุณได้
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '12px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: '10px',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontWeight: 700, fontSize: '0.86rem', marginBottom: '4px' }}>
                        <Database size={16} /> พื้นที่ฟรี 15 GB
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', lineHeight: 1.4 }}>
                        ใช้โควต้าบัญชี Google ส่วนตัวของคุณ ไม่จำกัดจำนวนครั้ง และไม่มีค่าบริการรายเดือน
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '12px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: '10px',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#c084fc', fontWeight: 700, fontSize: '0.86rem', marginBottom: '4px' }}>
                        <RefreshCw size={16} /> ข้ามอุปกรณ์ได้ทันที
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', lineHeight: 1.4 }}>
                        แปลบนคอมพิวเตอร์ แล้วเปิดมือถือหรือแท็บเล็ตดึงข้อมูลไปอ่านต่อได้ทุกที่
                      </div>
                    </div>
                  </div>

                  {/* Connect Button */}
                  <button
                    className="btn-primary"
                    onClick={handleConnectGoogle}
                    disabled={isGoogleConnecting}
                    style={{
                      background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
                      padding: '12px 28px',
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      boxShadow: '0 4px 16px rgba(59,130,246,0.3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    {isGoogleConnecting ? (
                      <>
                        <Loader2 size={18} className="spin-animation" />
                        <span>กำลังเชื่อมต่อกับ Google...</span>
                      </>
                    ) : (
                      <>
                        <Cloud size={18} />
                        <span>เชื่อมต่อบัญชี Google Drive (Sign in with Google)</span>
                      </>
                    )}
                  </button>

                  <div style={{ marginTop: '16px', fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                    💡 ระบบทำงานผ่าน Google Identity Services ปลอดภัยตามมาตรฐานสากล
                  </div>
                </div>
              ) : (
                /* Connected View */
                <div>
                  {/* User Profile Bar */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 18px',
                      background: 'rgba(59,130,246,0.08)',
                      border: '1px solid rgba(59,130,246,0.25)',
                      borderRadius: '12px',
                      marginBottom: '18px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {googleUser.picture ? (
                        <img
                          src={googleUser.picture}
                          alt={googleUser.name}
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '50%',
                            border: '2px solid #3b82f6',
                            objectFit: 'cover',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '50%',
                            background: '#3b82f6',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '1.1rem',
                          }}
                        >
                          {googleUser.name ? googleUser.name.charAt(0) : 'G'}
                        </div>
                      )}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#ffffff' }}>
                            {googleUser.name || 'ผู้ใช้ Google'}
                          </span>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'rgba(16,185,129,0.2)',
                              color: '#34d399',
                              border: '1px solid rgba(16,185,129,0.4)',
                              fontWeight: 600,
                            }}
                          >
                            🟢 เชื่อมต่อแล้ว
                          </span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                          {googleUser.email}
                        </div>
                      </div>
                    </div>

                    <button
                      className="btn-secondary"
                      onClick={handleSignOutGoogle}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.78rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: '#f87171',
                        borderColor: 'rgba(239,68,68,0.3)',
                      }}
                      title="ออกจากระบบ Google Drive ในเครื่องนี้"
                    >
                      <LogOut size={13} />
                      <span>ออกจากระบบ</span>
                    </button>
                  </div>

                  {/* Cloud Folder & Sync Status Box */}
                  <div
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: '12px',
                      padding: '14px 18px',
                      marginBottom: '18px',
                      fontSize: '0.8rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#e2e8f0' }}>
                        <Cloud size={16} color="#60a5fa" />
                        <span>ปลายทางบน Google Drive: <b>{GOOGLE_DRIVE_FOLDER_NAME}</b></span>
                      </div>
                      <a
                        href="https://drive.google.com/drive/my-drive"
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: '#60a5fa',
                          fontSize: '0.74rem',
                          textDecoration: 'none',
                        }}
                      >
                        <span>เปิด Drive</span>
                        <ExternalLink size={12} />
                      </a>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', color: 'var(--text-dim)', fontSize: '0.76rem' }}>
                      <div>
                        ซิงค์ล่าสุดจากเครื่องนี้:{' '}
                        <b style={{ color: lastSyncTime ? '#34d399' : 'var(--text-dim)' }}>
                          {lastSyncTime ? new Date(lastSyncTime).toLocaleString('th-TH') : 'ยังไม่เคยซิงค์'}
                        </b>
                      </div>
                      {googleBackupInfo?.exists && (
                        <div>
                          ข้อมูลบน Google Drive:{' '}
                          <b style={{ color: '#38bdf8' }}>
                            {googleBackupInfo.size ? `${(googleBackupInfo.size / (1024 * 1024)).toFixed(2)} MB` : 'ตรวจพบไฟล์'}
                          </b>
                          {googleBackupInfo.isDistributed && typeof googleBackupInfo.chapterCount === 'number' && (
                            <span style={{ color: '#34d399', fontWeight: 600 }}> (ระบบสตรีมมิ่ง {googleBackupInfo.chapterCount} ตอน)</span>
                          )}
                          {!googleBackupInfo.isDistributed && (
                            <span style={{ color: '#fbbf24' }}> (ไฟล์ ZIP เดิม)</span>
                          )}
                          {googleBackupInfo.modifiedTime && (
                            <span> • อัปเดต {new Date(googleBackupInfo.modifiedTime).toLocaleString('th-TH')}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Image inclusion checkbox */}
                    <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={exportIncludeImages}
                          onChange={(e) => setExportIncludeImages(e.target.checked)}
                          style={{ accentColor: '#3b82f6', width: '15px', height: '15px' }}
                        />
                        <span style={{ fontSize: '0.8rem', color: '#ffffff', fontWeight: 600 }}>
                          รวมรูปภาพหน้ามังงะต้นฉบับขึ้น Google Drive (แนะนำ)
                        </span>
                      </label>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginLeft: '23px', marginTop: '2px' }}>
                        ⚡ ระบบกระจายไฟล์แยกอัปโหลดทีละตอน (Streaming) กิน RAM เครื่องต่ำมาก และข้ามตอนเดิมที่ไม่มีการแก้ไขโดยอัตโนมัติ
                      </div>
                    </div>
                  </div>

                  {/* Cloud Sync Progress Bar */}
                  {cloudProgress && (
                    <div
                      style={{
                        background: 'rgba(59,130,246,0.08)',
                        border: '1px solid rgba(59,130,246,0.3)',
                        borderRadius: '12px',
                        padding: '16px 20px',
                        marginBottom: '18px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.86rem', fontWeight: 700, color: '#93c5fd' }}>
                          <Loader2 size={16} className="spin-animation" />
                          <span>{cloudProgress.message}</span>
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#38bdf8', padding: '2px 8px', background: 'rgba(56,189,248,0.15)', borderRadius: '6px' }}>
                          {cloudProgress.percent}%
                        </span>
                      </div>

                      {/* Progress Bar Track */}
                      <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${cloudProgress.percent}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #3b82f6, #06b6d4, #10b981)',
                            borderRadius: '4px',
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        <span>⚡ สตรีมมิ่งอัปโหลดทีละตอน (กิน RAM ต่ำ ไม่ทำให้เครื่องค้าง และข้ามตอนเดิมที่ไม่อัปเดต)</span>
                        <span>{cloudProgress.current} / {cloudProgress.total} ตอน</span>
                      </div>
                    </div>
                  )}

                  {/* 2 Main Action Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '18px' }}>
                    {/* Action 1: Upload */}
                    <div
                      style={{
                        padding: '18px',
                        background: 'rgba(59,130,246,0.04)',
                        border: '1px solid rgba(59,130,246,0.2)',
                        borderRadius: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#60a5fa', fontWeight: 800, fontSize: '0.96rem', marginBottom: '6px' }}>
                          <CloudUpload size={18} />
                          <span>1. สำรองข้อมูลขึ้น Google Drive</span>
                        </div>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.4, margin: '0 0 14px 0' }}>
                          รวบรวมคลัง Playlist ทั้งหมด ({exportPreview?.playlists.length || 0} เรื่อง), ตอนมังงะ, คีย์ API และคำสั่งบริบทเรื่องจากเครื่องนี้ แล้วอัปโหลดไปเก็บที่ Google Drive
                        </p>
                      </div>

                      <button
                        className="btn-primary"
                        onClick={handleUploadToGoogle}
                        disabled={isGoogleSyncing || isGoogleRestoring}
                        style={{
                          background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
                          width: '100%',
                          padding: '10px 16px',
                          fontSize: '0.86rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                        }}
                      >
                        {isGoogleSyncing ? (
                          <>
                            <Loader2 size={15} className="spin-animation" />
                            <span>กำลังสำรองข้อมูลขึ้น Drive...</span>
                          </>
                        ) : (
                          <>
                            <CloudUpload size={15} />
                            <span>สำรองข้อมูลขึ้นคลาวด์เดี๋ยวนี้</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Action 2: Restore */}
                    <div
                      style={{
                        padding: '18px',
                        background: 'rgba(16,185,129,0.04)',
                        border: '1px solid rgba(16,185,129,0.2)',
                        borderRadius: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontWeight: 800, fontSize: '0.96rem', marginBottom: '6px' }}>
                          <CloudDownload size={18} />
                          <span>2. กู้คืนข้อมูลจาก Google Drive</span>
                        </div>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.4, margin: '0 0 10px 0' }}>
                          ดึงข้อมูลและรูปภาพจาก Google Drive ล่าสุดลงมาบันทึกและผสานลงในเครื่องนี้ เพื่อให้สามารถอ่านและแปลต่อได้ทันที
                        </p>

                        {/* Options */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px', fontSize: '0.74rem' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#cbd5e1' }}>
                            <input
                              type="radio"
                              name="googlePlMode"
                              checked={playlistRestoreMode === 'merge'}
                              onChange={() => setPlaylistRestoreMode('merge')}
                              style={{ accentColor: '#10b981' }}
                            />
                            <span>ผสานข้อมูลกับของเดิม (Merge - ข้อมูลเดิมไม่หาย)</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#f87171' }}>
                            <input
                              type="radio"
                              name="googlePlMode"
                              checked={playlistRestoreMode === 'overwrite'}
                              onChange={() => setPlaylistRestoreMode('overwrite')}
                              style={{ accentColor: '#ef4444' }}
                            />
                            <span>แทนที่ทั้งหมดด้วยข้อมูลจากคลาวด์ (Overwrite)</span>
                          </label>
                        </div>
                      </div>

                      <button
                        className="btn-primary"
                        onClick={handleRestoreFromGoogle}
                        disabled={isGoogleSyncing || isGoogleRestoring}
                        style={{
                          background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                          width: '100%',
                          padding: '10px 16px',
                          fontSize: '0.86rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                        }}
                      >
                        {isGoogleRestoring ? (
                          <>
                            <Loader2 size={15} className="spin-animation" />
                            <span>กำลังดึงข้อมูลจาก Drive...</span>
                          </>
                        ) : (
                          <>
                            <CloudDownload size={15} />
                            <span>ดึงข้อมูลจาก Google Drive ลงเครื่อง</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Restore Result Card if applicable */}
                  {restoreResult && (
                    <div
                      style={{
                        background: 'rgba(16,185,129,0.08)',
                        border: '1px solid rgba(16,185,129,0.3)',
                        borderRadius: '12px',
                        padding: '16px',
                        textAlign: 'center',
                        marginBottom: '14px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#34d399', fontWeight: 800, fontSize: '0.95rem', marginBottom: '4px' }}>
                        <Check size={18} />
                        <span>กู้คืนข้อมูลจาก Google Drive สำเร็จเรียบร้อย!</span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                        Playlist ทั้งหมด: {restoreResult.totalPlaylistsCount} เรื่อง | ตอนที่กู้คืน: {restoreResult.chaptersRestoredCount} ตอน
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          className="modal-footer"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: 'var(--text-dim)' }}>
            <Info size={13} />
            <span>ไฟล์ที่ส่งออกสามารถนำไปใช้กับเครื่องอื่นหรือเบราว์เซอร์อื่นได้ 100%</span>
          </div>

          <button className="btn-secondary" onClick={onClose} style={{ fontSize: '0.82rem', padding: '6px 16px' }}>
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};
