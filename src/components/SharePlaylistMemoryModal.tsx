import React, { useEffect, useState } from 'react';
import { Check, Share2, X } from 'lucide-react';
import { MangaPlaylist } from '../types';
import { getAllPlaylists, PlaylistMemoryShareResult, sharePlaylistMemoryEntries } from '../services/playlistStorageService';

interface SharePlaylistMemoryModalProps {
  isOpen: boolean;
  sourcePlaylist: MangaPlaylist | null;
  onClose: () => void;
  onShared: () => void | Promise<void>;
}

export const SharePlaylistMemoryModal: React.FC<SharePlaylistMemoryModalProps> = ({
  isOpen,
  sourcePlaylist,
  onClose,
  onShared,
}) => {
  const [playlists, setPlaylists] = useState<MangaPlaylist[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const [results, setResults] = useState<PlaylistMemoryShareResult[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !sourcePlaylist) return;

    let active = true;
    setSelectedIds([]);
    setResults(null);
    setError('');
    getAllPlaylists().then((list) => {
      if (active) setPlaylists(list.filter(playlist => playlist.id !== sourcePlaylist.id));
    }).catch(() => {
      if (active) setError('ไม่สามารถอ่านรายการ Playlist ปลายทางได้');
    });

    return () => {
      active = false;
    };
  }, [isOpen, sourcePlaylist]);

  if (!isOpen || !sourcePlaylist) return null;

  const togglePlaylist = (playlistId: string) => {
    setSelectedIds(current => current.includes(playlistId)
      ? current.filter(id => id !== playlistId)
      : [...current, playlistId]);
  };

  const handleShare = async () => {
    if (selectedIds.length === 0) {
      setError('กรุณาเลือก Playlist ปลายทางอย่างน้อยหนึ่งเรื่อง');
      return;
    }

    setIsSharing(true);
    setError('');
    try {
      const sharedResults = await sharePlaylistMemoryEntries(sourcePlaylist.id, selectedIds);
      setResults(sharedResults);
      await onShared();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถแชร์ข้อมูลได้');
    } finally {
      setIsSharing(false);
    }
  };

  const totalAdded = results?.reduce((sum, result) => sum + result.addedCount, 0) || 0;
  const totalSkipped = results?.reduce((sum, result) => sum + result.skippedCount, 0) || 0;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-content" onMouseDown={(event) => event.stopPropagation()} style={{ maxWidth: '560px', width: '94%', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={iconBoxStyle}><Share2 size={18} /></div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.05rem', color: '#ffffff' }}>แชร์ความจำของเรื่อง</h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.77rem', color: 'var(--text-dim)' }}>{sourcePlaylist.name} · {(sourcePlaylist.memoryEntries || []).length} รายการ</p>
            </div>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} title="ปิด"><X size={16} /></button>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: '54vh' }}>
          {playlists.length === 0 ? (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem', textAlign: 'center', padding: '26px 8px' }}>ยังไม่มี Playlist อื่นให้รับข้อมูล</p>
          ) : (
            playlists.map((playlist) => {
              const checked = selectedIds.includes(playlist.id);
              return (
                <label key={playlist.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={checked} onChange={() => togglePlaylist(playlist.id)} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', color: '#ffffff', fontWeight: 700, fontSize: '0.86rem', overflowWrap: 'anywhere' }}>{playlist.name}</span>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.73rem' }}>{(playlist.memoryEntries || []).length} รายการเดิม</span>
                  </span>
                  {checked && <Check size={16} color="var(--accent-cyan)" />}
                </label>
              );
            })
          )}

          {results && (
            <div style={{ marginTop: '16px', padding: '11px 12px', border: '1px solid rgba(16, 185, 129, 0.35)', background: 'rgba(16, 185, 129, 0.10)', borderRadius: '6px', color: '#a7f3d0', fontSize: '0.8rem' }}>
              เพิ่ม {totalAdded} รายการ · ข้าม {totalSkipped} รายการที่ชื่อซ้ำ โดยข้อมูลเดิมของปลายทางไม่ถูกแก้ไข
            </div>
          )}
          {error && <div style={{ marginTop: '12px', color: '#fca5a5', fontSize: '0.8rem' }}>{error}</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--border-subtle)' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>{results ? 'ปิด' : 'ยกเลิก'}</button>
          {!results && (
            <button type="button" className="btn-primary" onClick={handleShare} disabled={isSharing || playlists.length === 0}>
              <Share2 size={15} /> {isSharing ? 'กำลังแชร์...' : 'แชร์ไปยัง Playlist ที่เลือก'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const iconBoxStyle: React.CSSProperties = {
  width: '36px',
  height: '36px',
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#c084fc',
  background: 'rgba(192, 132, 252, 0.13)',
  border: '1px solid rgba(192, 132, 252, 0.32)',
};
