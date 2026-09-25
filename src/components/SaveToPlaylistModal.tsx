import React, { useState, useEffect } from 'react';
import { MangaPage, MangaPlaylist } from '../types';
import { getAllPlaylists, createPlaylist, saveChapterToPlaylist } from '../services/playlistStorageService';
import { 
  X, 
  BookmarkPlus, 
  FolderPlus, 
  Check, 
  Layers, 
  Sparkles,
  BookOpen
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface SaveToPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  pages: MangaPage[];
  onPlaylistSaved?: () => void;
}

export const SaveToPlaylistModal: React.FC<SaveToPlaylistModalProps> = ({
  isOpen,
  onClose,
  pages,
  onPlaylistSaved,
}) => {
  const [playlists, setPlaylists] = useState<MangaPlaylist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('');
  const [chapterTitle, setChapterTitle] = useState<string>('');
  const [isCreatingNewPlaylist, setIsCreatingNewPlaylist] = useState<boolean>(false);
  const [newPlaylistName, setNewPlaylistName] = useState<string>('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Load playlists on open
  useEffect(() => {
    if (isOpen) {
      setSaveSuccessMessage(null);
      getAllPlaylists().then(list => {
        setPlaylists(list);
        if (list.length > 0) {
          setSelectedPlaylistId(list[0].id);
          setChapterTitle(`ตอนที่ ${list[0].chapters.length + 1}`);
        } else {
          setIsCreatingNewPlaylist(true);
          setChapterTitle('ตอนที่ 1');
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const totalBubbles = pages.reduce((sum, p) => sum + (p.ocrResults?.length || 0), 0);
  const thumbnail = pages[0]?.originalImageUrl || '';

  // Handle Create new playlist inline
  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) {
      alert('กรุณากรอกชื่อ Playlist');
      return;
    }
    const created = await createPlaylist(newPlaylistName, newPlaylistDesc);
    const updatedList = await getAllPlaylists();
    setPlaylists(updatedList);
    setSelectedPlaylistId(created.id);
    setChapterTitle('ตอนที่ 1');
    setIsCreatingNewPlaylist(false);
    setNewPlaylistName('');
    setNewPlaylistDesc('');
  };

  // Handle Save Chapter
  const handleSave = async () => {
    if (!selectedPlaylistId && !isCreatingNewPlaylist) {
      alert('กรุณาเลือกหรือสร้าง Playlist ก่อน');
      return;
    }

    setIsSaving(true);
    try {
      let targetPlId = selectedPlaylistId;
      if (isCreatingNewPlaylist) {
        if (!newPlaylistName.trim()) {
          alert('กรุณากรอกชื่อ Playlist');
          setIsSaving(false);
          return;
        }
        const created = await createPlaylist(newPlaylistName, newPlaylistDesc);
        targetPlId = created.id;
      }

      await saveChapterToPlaylist(
        targetPlId,
        chapterTitle.trim() || 'ตอนที่ 1',
        pages
      );

      confetti({
        particleCount: 60,
        spread: 60,
        origin: { y: 0.6 }
      });

      setSaveSuccessMessage(`บันทึก "${chapterTitle || 'ตอนนี้'}" ลงใน Playlist เรียบร้อยแล้ว!`);
      onPlaylistSaved?.();

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      alert(`ไม่สามารถบันทึกลง Playlist ได้: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div 
        className="modal-content"
        style={{ maxWidth: '540px', width: '92%', padding: '24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div 
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(168, 85, 247, 0.2))',
                border: '1px solid rgba(6, 182, 212, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-cyan)'
              }}
            >
              <BookmarkPlus size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                ส่งมังงะตอนนี้ลง Playlist
              </h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: 0 }}>
                บันทึกและจัดระเบียบตอนมังงะลงในเครื่องอย่างปลอดภัย ไม่หายไปไหน
              </p>
            </div>
          </div>
          <button 
            className="btn-icon"
            onClick={onClose}
            style={{ width: '32px', height: '32px' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Chapter Overview Preview Card */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '12px',
            marginBottom: '18px',
          }}
        >
          {thumbnail ? (
            <img 
              src={thumbnail} 
              alt="Thumbnail" 
              style={{ width: '56px', height: '74px', objectFit: 'cover', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}
            />
          ) : (
            <div style={{ width: '56px', height: '74px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={22} color="var(--text-dim)" />
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ffffff', marginBottom: '4px' }}>
              ข้อมูลตอนที่จะบันทึก
            </div>
            <div style={{ display: 'flex', gap: '12px', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              <span>📄 <b>{pages.length}</b> หน้า</span>
              <span>💬 <b>{totalBubbles}</b> กล่องข้อความแปล</span>
            </div>
          </div>
        </div>

        {/* Select Playlist Section */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e2e8f0' }}>
              เลือก Playlist (ซีรีส์มังงะ):
            </label>
            <button
              onClick={() => setIsCreatingNewPlaylist(!isCreatingNewPlaylist)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent-cyan)',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <FolderPlus size={14} /> {isCreatingNewPlaylist ? 'เลือก Playlist ที่มีอยู่' : '+ สร้าง Playlist ใหม่'}
            </button>
          </div>

          {isCreatingNewPlaylist ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(6, 182, 212, 0.05)', border: '1px dashed rgba(6, 182, 212, 0.3)', padding: '12px', borderRadius: '8px' }}>
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="ชื่อ Playlist เช่น Solo Leveling, วันพีซ..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'rgba(15, 20, 34, 0.8)',
                  border: '1px solid rgba(6, 182, 212, 0.4)',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
              <input
                type="text"
                value={newPlaylistDesc}
                onChange={(e) => setNewPlaylistDesc(e.target.value)}
                placeholder="คำอธิบายสั้นๆ (ไม่บังคับ)"
                style={{
                  width: '100%',
                  padding: '6px 12px',
                  background: 'rgba(15, 20, 34, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  outline: 'none'
                }}
              />
            </div>
          ) : playlists.length > 0 ? (
            <select
              value={selectedPlaylistId}
              onChange={(e) => {
                setSelectedPlaylistId(e.target.value);
                const pl = playlists.find(p => p.id === e.target.value);
                if (pl) setChapterTitle(`ตอนที่ ${pl.chapters.length + 1}`);
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'rgba(15, 20, 34, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '0.88rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {playlists.map((pl) => (
                <option key={pl.id} value={pl.id} style={{ background: '#0f172a', color: '#ffffff' }}>
                  📚 {pl.name} ({pl.chapters.length} ตอน)
                </option>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', padding: '8px 0' }}>
              ยังไม่มี Playlist ในระบบ กรุณาสร้าง Playlist ใหม่ด้านบน
            </div>
          )}
        </div>

        {/* Chapter Title Input */}
        <div style={{ marginBottom: '22px' }}>
          <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e2e8f0', display: 'block', marginBottom: '6px' }}>
            ชื่อตอนมังงะ (Chapter Title):
          </label>
          <input
            type="text"
            value={chapterTitle}
            onChange={(e) => setChapterTitle(e.target.value)}
            placeholder="เช่น ตอนที่ 1: จุดเริ่มต้น, ตอนที่ 24, Chapter 12..."
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'rgba(15, 20, 34, 0.9)',
              border: '1px solid var(--accent-cyan)',
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '0.92rem',
              fontWeight: 600,
              outline: 'none'
            }}
          />
        </div>

        {/* Success Message */}
        {saveSuccessMessage && (
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#34d399',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 700,
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Check size={16} /> {saveSuccessMessage}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            className="btn-secondary"
            onClick={onClose}
            style={{ padding: '8px 18px', fontSize: '0.85rem' }}
          >
            ยกเลิก
          </button>

          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={isSaving || pages.length === 0}
            style={{ padding: '8px 22px', fontSize: '0.88rem' }}
          >
            {isSaving ? (
              <div className="spinner" style={{ width: '14px', height: '14px' }} />
            ) : (
              <BookmarkPlus size={16} />
            )}
            <span>{isSaving ? 'กำลังบันทึก...' : 'ยืนยันส่งลง Playlist'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
