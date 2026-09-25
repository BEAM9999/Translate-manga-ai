import React, { useEffect, useState } from 'react';
import { BookOpen, Check, FolderPlus, ListPlus, Pencil, X } from 'lucide-react';
import { MangaPlaylist, PlaylistMemoryEntry } from '../types';
import { createPlaylist, getAllPlaylists, savePlaylistMemoryEntry } from '../services/playlistStorageService';

interface PlaylistContextModalProps {
  isOpen: boolean;
  selectedPlaylistId: string | null;
  onClose: () => void;
  onConfirm: (playlist: MangaPlaylist) => void | Promise<void>;
}

const CATEGORY_LABELS: Record<string, string> = {
  character: 'ตัวละคร',
  organization: 'องค์กร',
  university: 'มหาวิทยาลัย',
  school: 'โรงเรียน',
  pronoun: 'สรรพนาม/ตำแหน่ง',
  power_rank: 'ระดับพลัง',
  skill: 'สกิล/วิชา',
  character_level: 'เลเวลตัวละคร',
  location: 'สถานที่ (ประเทศ/เมือง)',
  item: 'ไอเทม',
  other: 'อื่น ๆ',
};

function sortEntries(entries: PlaylistMemoryEntry[]): PlaylistMemoryEntry[] {
  return [...entries].sort((left, right) => left.category.localeCompare(right.category) || left.sourceName.localeCompare(right.sourceName));
}

export const PlaylistContextModal: React.FC<PlaylistContextModalProps> = ({
  isOpen,
  selectedPlaylistId,
  onClose,
  onConfirm,
}) => {
  const [playlists, setPlaylists] = useState<MangaPlaylist[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingEntry, setEditingEntry] = useState<PlaylistMemoryEntry | null>(null);
  const [editingSourceName, setEditingSourceName] = useState('');
  const [editingThaiName, setEditingThaiName] = useState('');
  const [editError, setEditError] = useState('');

  const loadPlaylists = async () => {
    const list = await getAllPlaylists();
    setPlaylists(list);
    return list;
  };

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setError('');
    setNewName('');
    setNewDescription('');

    loadPlaylists().then((list) => {
      if (!active) return;
      const preferredId = selectedPlaylistId && list.some(playlist => playlist.id === selectedPlaylistId)
        ? selectedPlaylistId
        : list[0]?.id || '';
      setSelectedId(preferredId);
      setIsCreating(list.length === 0);
    }).catch(() => {
      if (active) setError('ไม่สามารถอ่านรายการ Playlist ในเครื่องได้');
    });

    return () => {
      active = false;
    };
  }, [isOpen, selectedPlaylistId]);

  if (!isOpen) return null;

  const selectedPlaylist = playlists.find(playlist => playlist.id === selectedId) || null;
  const memoryEntries = sortEntries(selectedPlaylist?.memoryEntries || []);

  const handleEditEntry = (entry: PlaylistMemoryEntry) => {
    setEditingEntry(entry);
    setEditingSourceName(entry.sourceName);
    setEditingThaiName(entry.thaiName);
    setEditError('');
  };

  const handleSaveEntry = async () => {
    if (!selectedPlaylist || !editingEntry) return;

    setIsSaving(true);
    setEditError('');
    try {
      await savePlaylistMemoryEntry(selectedPlaylist.id, {
        ...editingEntry,
        sourceName: editingSourceName,
        thaiName: editingThaiName,
      });
      await loadPlaylists();
      setEditingEntry(null);
    } catch (err: any) {
      setEditError(err.message || 'ไม่สามารถบันทึกชื่อบริบทนี้ได้');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      setError('กรุณาระบุชื่อ Playlist');
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      const created = await createPlaylist(newName, newDescription);
      const list = await loadPlaylists();
      setSelectedId(created.id);
      setIsCreating(false);
      setNewName('');
      setNewDescription('');
      if (!list.some(playlist => playlist.id === created.id)) {
        setPlaylists(current => [...current, created]);
      }
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถสร้าง Playlist ได้');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedPlaylist) {
      setError('กรุณาเลือกหรือสร้าง Playlist ก่อนเริ่มแปล');
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      await onConfirm(selectedPlaylist);
      onClose();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถเลือก Playlist นี้ได้');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop playlist-context-backdrop" onMouseDown={onClose}>
      <div
        className="modal-content playlist-context-modal"
        onMouseDown={(event) => event.stopPropagation()}
        style={{ padding: 0 }}
      >
        <div className="playlist-context-modal-header">
          <div className="playlist-context-modal-heading-group">
            <div style={iconBoxStyle}><BookOpen size={19} /></div>
            <div className="playlist-context-modal-heading">
              <h2 style={{ margin: 0, color: '#ffffff', fontSize: '1.12rem' }}>เลือกบริบทของเรื่อง</h2>
              <p style={{ margin: '2px 0 0', color: 'var(--text-dim)', fontSize: '0.78rem' }}>คำแปลครั้งนี้จะใช้และบันทึกความจำใน Playlist ที่เลือกเท่านั้น</p>
            </div>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} title="ปิด"><X size={16} /></button>
        </div>

        <div className="playlist-context-layout">
          <section className="playlist-context-playlist-panel">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setIsCreating(current => !current); setError(''); }}
              style={{ width: '100%', justifyContent: 'center', marginBottom: '12px' }}
            >
              <FolderPlus size={15} /> {isCreating ? 'กลับไปเลือก Playlist' : 'สร้าง Playlist ใหม่'}
            </button>

            {isCreating && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderRadius: '8px', background: 'rgba(6, 182, 212, 0.07)', border: '1px solid rgba(6, 182, 212, 0.25)', marginBottom: '12px' }}>
                <input
                  autoFocus
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="ชื่อเรื่อง / Playlist"
                  style={inputStyle}
                />
                <input
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                  placeholder="คำอธิบาย (ไม่บังคับ)"
                  style={inputStyle}
                />
                <button type="button" className="btn-primary" onClick={handleCreate} disabled={isSaving} style={{ justifyContent: 'center' }}>
                  <Check size={14} /> สร้าง Playlist
                </button>
              </div>
            )}

            {playlists.length === 0 && !isCreating ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', textAlign: 'center', padding: '30px 12px' }}>ยังไม่มี Playlist สำหรับใช้เป็นบริบท</p>
            ) : (
              playlists.map((playlist) => {
                const isSelected = selectedId === playlist.id;
                return (
                  <button
                    key={playlist.id}
                    type="button"
                    className="playlist-context-playlist-button"
                    onClick={() => { setSelectedId(playlist.id); setIsCreating(false); setError(''); }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: isSelected ? '1px solid var(--accent-cyan)' : '1px solid transparent',
                      background: isSelected ? 'rgba(6, 182, 212, 0.13)' : 'transparent',
                      color: '#ffffff',
                      borderRadius: '6px',
                      padding: '10px',
                      cursor: 'pointer',
                      marginBottom: '5px',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', fontWeight: 700, fontSize: '0.84rem' }}>
                      <span>{playlist.name}</span>
                      {isSelected && <Check size={14} color="var(--accent-cyan)" />}
                    </span>
                    <span style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.72rem', marginTop: '3px' }}>
                      {(playlist.memoryEntries || []).length} รายการความจำ · {playlist.chapters.length} ตอน
                    </span>
                  </button>
                );
              })
            )}
          </section>

          <section className="playlist-context-memory-panel">
            <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
              {selectedPlaylist ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-cyan)' }}>
                    <ListPlus size={16} />
                    <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{selectedPlaylist.name}</span>
                  </div>
                  <p style={{ margin: '5px 0 0', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                    รายการที่ AI จะยึดเป็นชื่อตายตัวและบริบทของเรื่องนี้
                  </p>
                </>
              ) : (
                <p style={{ margin: 0, color: 'var(--text-dim)' }}>เลือก Playlist ทางซ้ายเพื่อดูความจำของเรื่อง</p>
              )}
            </div>

            <div className="playlist-context-memory-list">
              {selectedPlaylist && memoryEntries.length === 0 && (
                <div style={{ color: 'var(--text-dim)', fontSize: '0.82rem', padding: '38px 14px', textAlign: 'center' }}>เรื่องนี้ยังไม่มีชื่อหรือคำศัพท์ที่บันทึกไว้</div>
              )}
              {memoryEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="playlist-context-memory-entry"
                  onClick={() => handleEditEntry(entry)}
                  title="คลิกเพื่อแก้ไขชื่อภาษาอังกฤษและภาษาไทย"
                >
                  <span style={{ color: '#ffffff', fontSize: '0.83rem', overflowWrap: 'anywhere' }}>{entry.sourceName}</span>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>→</span>
                  <span style={{ color: 'var(--accent-cyan)', fontSize: '0.84rem', fontWeight: 700, overflowWrap: 'anywhere' }}>{entry.thaiName}</span>
                  <span style={{ gridColumn: '1 / -1', color: 'var(--text-dim)', fontSize: '0.68rem' }}>{CATEGORY_LABELS[entry.category] || 'อื่น ๆ'}{entry.notes ? ` · ${entry.notes}` : ''}</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        {error && <div style={{ color: '#fca5a5', fontSize: '0.8rem', padding: '10px 22px', background: 'rgba(239, 68, 68, 0.1)' }}>{error}</div>}

        <div className="playlist-context-modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button type="button" className="btn-primary" onClick={handleConfirm} disabled={!selectedPlaylist || isSaving}>
            <Check size={15} /> ใช้ Playlist นี้และเริ่มแปล
          </button>
        </div>
      </div>

      {editingEntry && (
        <div className="modal-backdrop playlist-context-edit-backdrop" onMouseDown={() => setEditingEntry(null)}>
          <div className="modal-content playlist-context-edit-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="playlist-context-edit-header">
              <div className="playlist-context-edit-title"><Pencil size={16} /> แก้ไขชื่อบริบท</div>
              <button type="button" className="btn-icon" onClick={() => setEditingEntry(null)} title="ปิด"><X size={16} /></button>
            </div>
            <div className="playlist-context-edit-fields">
              <label>
                ชื่อภาษาอังกฤษ / ชื่อต้นฉบับ
                <input autoFocus className="input-text" value={editingSourceName} onChange={(event) => setEditingSourceName(event.target.value)} />
              </label>
              <label>
                ชื่อภาษาไทย
                <input className="input-text" value={editingThaiName} onChange={(event) => setEditingThaiName(event.target.value)} />
              </label>
              {editError && <p className="playlist-context-edit-error">{editError}</p>}
            </div>
            <div className="playlist-context-edit-footer">
              <button type="button" className="btn-secondary" onClick={() => setEditingEntry(null)}>ยกเลิก</button>
              <button type="button" className="btn-primary" onClick={handleSaveEntry} disabled={isSaving}>
                <Check size={15} /> {isSaving ? 'กำลังบันทึก...' : 'บันทึกชื่อ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const iconBoxStyle: React.CSSProperties = {
  width: '38px',
  height: '38px',
  borderRadius: '8px',
  color: 'var(--accent-cyan)',
  background: 'rgba(6, 182, 212, 0.14)',
  border: '1px solid rgba(6, 182, 212, 0.32)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(15, 20, 34, 0.9)',
  border: '1px solid rgba(255, 255, 255, 0.14)',
  borderRadius: '6px',
  color: '#ffffff',
  padding: '8px 10px',
  outline: 'none',
  fontSize: '0.82rem',
};
