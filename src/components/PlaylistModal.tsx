import React, { useState, useEffect } from 'react';
import { MangaPlaylist, MangaChapter, MangaPage } from '../types';
import { 
  getAllPlaylists, 
  createPlaylist, 
  deletePlaylist, 
  deleteChapter, 
  renameChapter,
  updatePlaylist 
} from '../services/playlistStorageService';
import { 
  X, 
  BookmarkPlus, 
  FolderPlus, 
  BookOpen, 
  Trash2, 
  Edit3, 
  Layers, 
  Calendar, 
  Search, 
  Plus,
  ArrowRight,
  FolderOpen,
  Sparkles,
  Check,
  Archive
} from 'lucide-react';
import confetti from 'canvas-confetti';

const chapterTitleCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

interface PlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadChapter: (playlistId: string, chapterId: string, pages: MangaPage[], chapterTitle: string) => void;
  onOpenBackup?: (tab: 'export' | 'import') => void;
}

export const PlaylistModal: React.FC<PlaylistModalProps> = ({
  isOpen,
  onClose,
  onLoadChapter,
  onOpenBackup,
}) => {
  const [playlists, setPlaylists] = useState<MangaPlaylist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState<boolean>(false);
  const [newPlaylistName, setNewPlaylistName] = useState<string>('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editChapterTitle, setEditChapterTitle] = useState<string>('');

  const loadData = async () => {
    const list = await getAllPlaylists();
    setPlaylists(list);
    if (list.length > 0 && (!selectedPlaylistId || !list.some(p => p.id === selectedPlaylistId))) {
      setSelectedPlaylistId(list[0].id);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const activePlaylist = playlists.find(p => p.id === selectedPlaylistId) || playlists[0];

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) {
      alert('กรุณาระบุชื่อ Playlist');
      return;
    }
    const created = await createPlaylist(newPlaylistName, newPlaylistDesc);
    setNewPlaylistName('');
    setNewPlaylistDesc('');
    setIsCreatingPlaylist(false);
    await loadData();
    setSelectedPlaylistId(created.id);
  };

  const handleDeletePlaylist = async (playlistId: string, name: string) => {
    if (confirm(`คุณต้องการลบ Playlist "${name}" และทุกตอนข้างในหรือไม่?`)) {
      await deletePlaylist(playlistId);
      await loadData();
    }
  };

  const handleDeleteChapter = async (playlistId: string, chapterId: string, title: string) => {
    if (confirm(`คุณต้องการลบ "${title}" หรือไม่?`)) {
      await deleteChapter(playlistId, chapterId);
      await loadData();
    }
  };

  const handleSaveRenameChapter = async (playlistId: string, chapterId: string) => {
    if (!editChapterTitle.trim()) return;
    await renameChapter(playlistId, chapterId, editChapterTitle);
    setEditingChapterId(null);
    await loadData();
  };

  const handleSelectToLoad = (chapter: MangaChapter) => {
    if (!chapter.pages || chapter.pages.length === 0) {
      alert('ตอนนี้ไม่มีข้อมูลหน้ามังงะ');
      return;
    }
    if (!activePlaylist) return;
    onLoadChapter(activePlaylist.id, chapter.id, chapter.pages, chapter.chapterTitle);
    confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
    onClose();
  };

  const filteredChapters = (activePlaylist?.chapters || []).filter(c => 
    c.chapterTitle.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((left, right) => chapterTitleCollator.compare(left.chapterTitle, right.chapterTitle));

  return (
    <div className="modal-backdrop playlist-library-backdrop" onClick={onClose}>
      <div 
        className="modal-content playlist-library-modal"
        style={{ 
          padding: '0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div 
          className="playlist-library-header"
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            padding: '16px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(15, 20, 34, 0.95)'
          }}
        >
          <div className="playlist-library-title-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div 
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(168, 85, 247, 0.2))',
                border: '1px solid rgba(6, 182, 212, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-cyan)'
              }}
            >
              <BookOpen size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                คลังมังงะ & ซีรีส์ Playlist
                <span style={{ fontSize: '0.72rem', background: 'rgba(6, 182, 212, 0.15)', color: 'var(--accent-cyan)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
                  {playlists.length} ซีรีส์
                </span>
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0 }}>
                เปิดอ่าน แก้ไข หรือจัดระเบียบตอนมังงะที่บันทึกไว้ในเครื่อง
              </p>
            </div>
          </div>
          <div className="playlist-library-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {onOpenBackup && (
              <button
                className="btn-secondary"
                onClick={() => onOpenBackup('export')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.78rem',
                  padding: '5px 12px',
                  borderColor: 'rgba(168, 85, 247, 0.4)',
                  color: '#c084fc',
                  background: 'rgba(168, 85, 247, 0.08)',
                }}
                title="สำรองข้อมูลและส่งออก / นำเข้าคลัง Playlist ทั้งหมด"
              >
                <Archive size={14} />
                <span>สำรอง / นำเข้า</span>
              </button>
            )}
            <button 
              className="btn-icon"
              onClick={onClose}
              style={{ width: '32px', height: '32px' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Main Body: 2 Columns (Left Playlists / Right Chapters Grid) */}
        <div className="playlist-library-layout">
          
          {/* Left Column: Playlist Series List */}
          <div 
            className="playlist-library-sidebar"
            style={{ 
              background: 'rgba(10, 14, 26, 0.8)',
            }}
          >
            {/* Create Playlist Button */}
            <div className="playlist-library-create-action" style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <button
                className="btn-primary"
                onClick={() => setIsCreatingPlaylist(!isCreatingPlaylist)}
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.82rem', justifyContent: 'center' }}
              >
                <Plus size={15} /> {isCreatingPlaylist ? 'ยกเลิก' : 'สร้าง Playlist ใหม่'}
              </button>
            </div>

            {/* Create New Playlist Form */}
            {isCreatingPlaylist && (
              <div className="playlist-library-create-form" style={{ padding: '12px', background: 'rgba(6, 182, 212, 0.05)', borderBottom: '1px solid rgba(6, 182, 212, 0.2)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="ชื่อมังงะ / Playlist..."
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    background: '#0f172a',
                    border: '1px solid var(--accent-cyan)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '0.8rem',
                    outline: 'none'
                  }}
                  autoFocus
                />
                <input
                  type="text"
                  value={newPlaylistDesc}
                  onChange={(e) => setNewPlaylistDesc(e.target.value)}
                  placeholder="คำอธิบาย (ไม่บังคับ)"
                  style={{
                    width: '100%',
                    padding: '5px 10px',
                    background: '#0f172a',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '0.75rem',
                    outline: 'none'
                  }}
                />
                <button
                  className="btn-primary"
                  onClick={handleCreatePlaylist}
                  style={{ padding: '5px 10px', fontSize: '0.78rem', justifyContent: 'center', marginTop: '2px' }}
                >
                  <Check size={13} /> บันทึก Playlist
                </button>
              </div>
            )}

            {/* Playlists List */}
            <div className="playlist-library-playlists">
              {playlists.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-dim)', fontSize: '0.78rem' }}>
                  ยังไม่มี Playlist<br />กดปุ่มสร้างด้านบนได้เลย
                </div>
              ) : (
                playlists.map((pl) => {
                  const isSelected = selectedPlaylistId === pl.id;
                  return (
                    <div
                      key={pl.id}
                      className={`playlist-library-playlist${isSelected ? ' is-selected' : ''}`}
                      onClick={() => setSelectedPlaylistId(pl.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        marginBottom: '4px',
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                        border: isSelected ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid transparent',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ overflow: 'hidden', flex: 1 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: isSelected ? 700 : 500, color: isSelected ? '#38bdf8' : '#e2e8f0', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          📚 {pl.name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                          {pl.chapters.length} ตอน
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePlaylist(pl.id, pl.name);
                        }}
                        style={{ background: 'transparent', border: 'none', color: '#f87171', opacity: isSelected ? 0.9 : 0.3, cursor: 'pointer', padding: '4px' }}
                        title="ลบ Playlist นี้"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Chapters in Selected Playlist */}
          <div className="playlist-library-content">
            
            {activePlaylist ? (
              <>
                {/* Playlist Top Info Bar & Search */}
                <div 
                  className="playlist-library-detail-header"
                  style={{ 
                    padding: '14px 20px', 
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(15, 20, 34, 0.8)'
                  }}
                >
                  <div className="playlist-library-detail-info">
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                      {activePlaylist.name}
                    </h3>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                      {activePlaylist.description || 'ไม่มีคำอธิบาย'} • รวม <b>{activePlaylist.chapters.length}</b> ตอน
                    </div>
                  </div>

                  {/* Search Chapters */}
                  <div className="playlist-library-search">
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ค้นหาตอน..."
                      style={{
                        width: '100%',
                        padding: '6px 10px 6px 30px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '20px',
                        color: '#ffffff',
                        fontSize: '0.78rem',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                {/* Chapters Grid / List */}
                <div className="playlist-library-chapters">
                  {filteredChapters.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-dim)' }}>
                      <FolderOpen size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '4px' }}>
                        ยังไม่มีตอนใน Playlist นี้
                      </div>
                      <p style={{ fontSize: '0.8rem', maxWidth: '340px', margin: '0 auto' }}>
                        เมื่อคุณอัปโหลดและแปลมังงะที่หน้าแรก ให้กดปุ่ม <b>"💾 บันทึกลง Playlist"</b> เพื่อนำตอนมาเก็บไว้ที่นี่
                      </p>
                    </div>
                  ) : (
                    <div className="playlist-library-chapter-grid">
                      {filteredChapters.map((chapter) => {
                        const isEditingThis = editingChapterId === chapter.id;
                        return (
                          <div
                            key={chapter.id}
                            style={{
                              background: 'rgba(255, 255, 255, 0.03)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '12px',
                              overflow: 'hidden',
                              display: 'flex',
                              flexDirection: 'column',
                              transition: 'all 0.2s',
                              position: 'relative',
                            }}
                            className="chapter-card"
                          >
                            {/* Thumbnail */}
                            <div 
                              className="playlist-library-thumbnail"
                              style={{ 
                                height: '160px', 
                                background: '#0a0f1d', 
                                position: 'relative', 
                                overflow: 'hidden',
                                cursor: 'pointer' 
                              }}
                              onClick={() => handleSelectToLoad(chapter)}
                              title="คลิกเพื่อเปิดอ่าน / แก้ไขตอนนี้ใน Canvas"
                            >
                              {chapter.thumbnailUrl ? (
                                <img 
                                  src={chapter.thumbnailUrl} 
                                  alt={chapter.chapterTitle}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <BookOpen size={36} color="var(--text-dim)" />
                                </div>
                              )}

                              {/* Page Count Badge */}
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: '8px',
                                  right: '8px',
                                  background: 'rgba(0, 0, 0, 0.75)',
                                  backdropFilter: 'blur(4px)',
                                  color: '#ffffff',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                }}
                              >
                                {chapter.pageCount} หน้า
                              </div>
                            </div>

                            {/* Info */}
                            <div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {isEditingThis ? (
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <input
                                    type="text"
                                    value={editChapterTitle}
                                    onChange={(e) => setEditChapterTitle(e.target.value)}
                                    style={{
                                      flex: 1,
                                      padding: '4px 8px',
                                      background: '#0f172a',
                                      border: '1px solid var(--accent-cyan)',
                                      borderRadius: '4px',
                                      color: '#fff',
                                      fontSize: '0.8rem',
                                      outline: 'none'
                                    }}
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveRenameChapter(activePlaylist.id, chapter.id);
                                    }}
                                  />
                                  <button
                                    onClick={() => handleSaveRenameChapter(activePlaylist.id, chapter.id)}
                                    style={{ background: '#10b981', border: 'none', color: '#fff', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer' }}
                                  >
                                    <Check size={12} />
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <h4 
                                    style={{ 
                                      fontSize: '0.88rem', 
                                      fontWeight: 700, 
                                      color: '#ffffff', 
                                      margin: 0,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                    title={chapter.chapterTitle}
                                  >
                                    {chapter.chapterTitle}
                                  </h4>
                                  <button
                                    onClick={() => {
                                      setEditingChapterId(chapter.id);
                                      setEditChapterTitle(chapter.chapterTitle);
                                    }}
                                    style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px' }}
                                    title="เปลี่ยนชื่อตอน"
                                  >
                                    <Edit3 size={12} />
                                  </button>
                                </div>
                              )}

                              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                                💬 {chapter.translatedBubbleCount} ข้อความแปล
                              </div>

                              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                                🕒 {new Date(chapter.updatedAt).toLocaleDateString('th-TH')}
                              </div>

                              {/* Load Chapter Button */}
                              <button
                                className="btn-primary"
                                onClick={() => handleSelectToLoad(chapter)}
                                style={{ 
                                  marginTop: 'auto', 
                                  padding: '6px 10px', 
                                  fontSize: '0.78rem', 
                                  fontWeight: 700,
                                  justifyContent: 'center',
                                  width: '100%' 
                                }}
                              >
                                📖 เปิดอ่าน / แก้ไข
                              </button>

                              {/* Delete Chapter Button */}
                              <button
                                onClick={() => handleDeleteChapter(activePlaylist.id, chapter.id, chapter.chapterTitle)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#f87171',
                                  fontSize: '0.7rem',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                  padding: '3px',
                                  opacity: 0.7
                                }}
                              >
                                <Trash2 size={11} /> ลบตอนนี้
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)' }}>
                เลือก Playlist ทางด้านซ้ายเพื่อดูตอนทั้งหมด
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
