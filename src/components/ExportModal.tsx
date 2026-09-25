import React, { useState } from 'react';
import { MangaPage } from '../types';
import { 
  X, 
  Download, 
  FileText, 
  FileImage, 
  FileCode, 
  Check, 
  Loader2,
  Scissors,
  Sparkles,
  Layers,
  Settings2,
  PackageCheck,
  Archive,
  Image as ImageIcon
} from 'lucide-react';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { renderMangaPageToCanvas } from '../utils/mangaCanvasRenderer';
import { computePageSlices } from '../utils/slicingEngine';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  pages: MangaPage[];
}

export type ExportImageFormat = 'image/png' | 'image/webp' | 'image/jpeg';
export type ExportSplitMode = 'as_is' | 'smart_slice';

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  pages,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<ExportImageFormat>('image/png');
  const [splitMode, setSplitMode] = useState<ExportSplitMode>('as_is'); // 'as_is' (DEFAULT 1:1) or 'smart_slice'
  const [sliceCountPerLongPage, setSliceCountPerLongPage] = useState<number>(0); // 0 = Auto
  const [imageQuality, setImageQuality] = useState<number>(0.96);

  if (!isOpen) return null;

  const getFormatExtension = (format: ExportImageFormat) => {
    switch (format) {
      case 'image/webp': return 'webp';
      case 'image/jpeg': return 'jpg';
      default: return 'png';
    }
  };

  // Trigger browser download for a blob or dataUrl
  const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Export All Pages as a Single ZIP File (.zip)
  const handleExportZIP = async () => {
    if (pages.length === 0) return;
    setIsExporting(true);
    setExportProgress('กำลังเตรียมสร้างไฟล์ ZIP รวมรูปภาพ...');

    try {
      const zip = new JSZip();
      const ext = getFormatExtension(selectedFormat);
      let globalFileIndex = 1;

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        setExportProgress(`กำลังเรนเดอร์หน้า ${i + 1} จาก ${pages.length}...`);

        const renderedCanvas = await renderMangaPageToCanvas(page, 0.88);

        if (splitMode === 'as_is') {
          // 1:1 Exact Page Output (DEFAULT)
          const dataUrl = renderedCanvas.toDataURL(selectedFormat, imageQuality);
          const base64Data = dataUrl.split(',')[1];
          const fileNumPrefix = String(i + 1).padStart(3, '0'); // e.g. 001, 002, 003
          const fileName = `${fileNumPrefix}_Manga_Page_${i + 1}.${ext}`;
          zip.file(fileName, base64Data, { base64: true });
        } else {
          // Smart Slicing into multiple parts per page
          const sliceResult = computePageSlices(
            renderedCanvas.width,
            renderedCanvas.height,
            page.ocrResults,
            sliceCountPerLongPage > 0 ? sliceCountPerLongPage : undefined
          );

          for (let s = 0; s < sliceResult.slices.length; s++) {
            const slice = sliceResult.slices[s];
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = renderedCanvas.width;
            sliceCanvas.height = slice.heightPx;
            const sliceCtx = sliceCanvas.getContext('2d');
            if (!sliceCtx) continue;

            sliceCtx.drawImage(
              renderedCanvas,
              0, slice.startYPx, renderedCanvas.width, slice.heightPx,
              0, 0, renderedCanvas.width, slice.heightPx
            );

            const sliceDataUrl = sliceCanvas.toDataURL(selectedFormat, imageQuality);
            const base64Slice = sliceDataUrl.split(',')[1];
            const fileNumPrefix = String(globalFileIndex).padStart(3, '0');
            const sliceSuffix = sliceResult.slices.length > 1 ? `_part${s + 1}` : '';
            const fileName = `${fileNumPrefix}_Manga_Page_${i + 1}${sliceSuffix}.${ext}`;
            zip.file(fileName, base64Slice, { base64: true });
            globalFileIndex++;
          }
        }
      }

      setExportProgress('กำลังบีบอัดไฟล์ ZIP...');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = URL.createObjectURL(zipBlob);
      triggerDownload(zipUrl, `C2_Sub_Auto_AI_Manga_Chapter_${Date.now()}.zip`);
      setTimeout(() => URL.revokeObjectURL(zipUrl), 5000);
    } catch (e) {
      console.error('Export ZIP error:', e);
      alert('เกิดข้อผิดพลาดในการสร้างไฟล์ ZIP');
    } finally {
      setIsExporting(false);
      setExportProgress('');
    }
  };

  // Export All Pages as Individual Image Files
  const handleExportIndividualImages = async () => {
    if (pages.length === 0) return;
    setIsExporting(true);

    try {
      const ext = getFormatExtension(selectedFormat);
      let globalFileIndex = 1;

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        setExportProgress(`กำลังบันทึกภาพหน้า ${i + 1} จาก ${pages.length}...`);

        const renderedCanvas = await renderMangaPageToCanvas(page, 0.88);

        if (splitMode === 'as_is') {
          // 1:1 Page Output with 3-digit prefix (001, 002, 003...)
          const dataUrl = renderedCanvas.toDataURL(selectedFormat, imageQuality);
          const fileNumPrefix = String(i + 1).padStart(3, '0');
          const fileName = `${fileNumPrefix}_Manga_Page_${i + 1}.${ext}`;
          triggerDownload(dataUrl, fileName);
          await new Promise(r => setTimeout(r, 200));
        } else {
          // Sliced parts with 3-digit prefix
          const sliceResult = computePageSlices(
            renderedCanvas.width,
            renderedCanvas.height,
            page.ocrResults,
            sliceCountPerLongPage > 0 ? sliceCountPerLongPage : undefined
          );

          for (let s = 0; s < sliceResult.slices.length; s++) {
            const slice = sliceResult.slices[s];
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = renderedCanvas.width;
            sliceCanvas.height = slice.heightPx;
            const sliceCtx = sliceCanvas.getContext('2d');
            if (!sliceCtx) continue;

            sliceCtx.drawImage(
              renderedCanvas,
              0, slice.startYPx, renderedCanvas.width, slice.heightPx,
              0, 0, renderedCanvas.width, slice.heightPx
            );

            const sliceDataUrl = sliceCanvas.toDataURL(selectedFormat, imageQuality);
            const fileNumPrefix = String(globalFileIndex).padStart(3, '0');
            const sliceSuffix = sliceResult.slices.length > 1 ? `_part${s + 1}` : '';
            const fileName = `${fileNumPrefix}_Manga_Page_${i + 1}${sliceSuffix}.${ext}`;
            triggerDownload(sliceDataUrl, fileName);
            globalFileIndex++;
            await new Promise(r => setTimeout(r, 200));
          }
        }
      }
    } catch (e) {
      console.error('Export individual error:', e);
      alert('เกิดข้อผิดพลาดในการบันทึกรูปภาพ');
    } finally {
      setIsExporting(false);
      setExportProgress('');
    }
  };

  // Export Full Chapter as PDF Document
  const handleExportPDF = async () => {
    if (pages.length === 0) return;
    setIsExporting(true);
    setExportProgress('กำลังประมวลผล PDF...');

    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < pages.length; i++) {
        setExportProgress(`กำลังสร้าง PDF หน้าที่ ${i + 1}/${pages.length}...`);
        const page = pages[i];

        const renderedCanvas = await renderMangaPageToCanvas(page, 0.88);
        const imgData = renderedCanvas.toDataURL('image/jpeg', 0.92);

        if (i > 0) {
          pdf.addPage();
        }

        const imgRatio = renderedCanvas.width / renderedCanvas.height;
        const pageRatio = pdfWidth / pdfHeight;

        let renderW = pdfWidth;
        let renderH = pdfWidth / imgRatio;

        if (renderH > pdfHeight) {
          renderH = pdfHeight;
          renderW = pdfHeight * imgRatio;
        }

        const posX = (pdfWidth - renderW) / 2;
        const posY = (pdfHeight - renderH) / 2;

        pdf.addImage(imgData, 'JPEG', posX, posY, renderW, renderH);
      }

      pdf.save(`C2_Sub_Auto_AI_Manga_Chapter_${Date.now()}.pdf`);
    } catch (e) {
      console.error('Export PDF error:', e);
      alert('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF');
    } finally {
      setIsExporting(false);
      setExportProgress('');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 998 }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '660px' }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Download size={20} color="var(--accent-cyan)" />
            <h2>ส่งออกรูปภาพมังงะแปลเสร็จ (Export Studio)</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Section 1: Export Split Strategy (Default 1:1 vs Slicing) */}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <ImageIcon size={14} color="var(--accent-cyan)" />
              รูปแบบการส่งออกจำนวนรูปภาพ (Export Strategy)
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {/* Strategy 1: As-Is (DEFAULT) */}
              <div
                onClick={() => setSplitMode('as_is')}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: splitMode === 'as_is' ? '2px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                  background: splitMode === 'as_is' ? 'rgba(6, 182, 212, 0.14)' : 'var(--bg-surface)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: splitMode === 'as_is' ? 'var(--accent-cyan)' : '#ffffff' }}>
                    🌟 1 รูป ต่อ 1 หน้า (ค่าเริ่มต้น)
                  </span>
                  <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', color: '#34d399' }}>
                    Default
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  ส่งออกรูปภาพตามจำนวนหน้าที่แสดงอยู่บนหน้าเว็บจริง ({pages.length} รูป) ไม่ตัดท่อน คงขนาดดั้งเดิม 100%
                </p>
              </div>

              {/* Strategy 2: Smart Slicing */}
              <div
                onClick={() => setSplitMode('smart_slice')}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: splitMode === 'smart_slice' ? '2px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                  background: splitMode === 'smart_slice' ? 'rgba(6, 182, 212, 0.14)' : 'var(--bg-surface)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: splitMode === 'smart_slice' ? 'var(--accent-cyan)' : '#ffffff' }}>
                    ✂️ ตัดแบ่งเป็นท่อนๆ (Webtoon)
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  สำหรับรูปภาพยาวมาก กะระยะตัดแบ่งเป็นท่อนๆ อัตโนมัติ โดยหลบบอลลูนคำพูดเพื่อไม่ให้ผ่ากลางตัวหนังสือ
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Image Format (.png, .webp, .jpg) */}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <FileImage size={14} color="#f59e0b" />
              นามสกุลไฟล์รูปภาพปลายทาง (Output File Format)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setSelectedFormat('image/png')}
                style={{
                  padding: '10px 8px',
                  borderRadius: '6px',
                  border: selectedFormat === 'image/png' ? '2px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                  background: selectedFormat === 'image/png' ? 'rgba(6, 182, 212, 0.15)' : 'var(--bg-surface)',
                  color: '#ffffff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px'
                }}
              >
                <span>.PNG</span>
                <span style={{ fontSize: '0.68rem', color: '#34d399' }}>ความชัดสูงสุด Lossless</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedFormat('image/webp')}
                style={{
                  padding: '10px 8px',
                  borderRadius: '6px',
                  border: selectedFormat === 'image/webp' ? '2px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                  background: selectedFormat === 'image/webp' ? 'rgba(6, 182, 212, 0.15)' : 'var(--bg-surface)',
                  color: '#ffffff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px'
                }}
              >
                <span>.WebP</span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>ไฟล์เบา คมชัดสูง</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedFormat('image/jpeg')}
                style={{
                  padding: '10px 8px',
                  borderRadius: '6px',
                  border: selectedFormat === 'image/jpeg' ? '2px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                  background: selectedFormat === 'image/jpeg' ? 'rgba(6, 182, 212, 0.15)' : 'var(--bg-surface)',
                  color: '#ffffff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px'
                }}
              >
                <span>.JPG / JPEG</span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>มาตรฐานทั่วไป</span>
              </button>
            </div>
          </div>

          {/* Section 3: Summary Info Card */}
          <div 
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.82rem',
              color: 'var(--text-muted)'
            }}
          >
            <div>
              <span>จำนวนหน้าที่พร้อมส่งออก: </span>
              <strong style={{ color: '#ffffff' }}>{pages.length} หน้า</strong>
            </div>
            <div>
              <span>โหมดส่งออก: </span>
              <strong style={{ color: 'var(--accent-cyan)' }}>
                {splitMode === 'as_is' ? `ส่งออก 1:1 (${pages.length} รูป)` : 'ตัดแบ่งท่อนอัจฉริยะ'}
              </strong>
            </div>
          </div>

          {/* Progress Banner */}
          {isExporting && (
            <div 
              style={{
                marginTop: '16px',
                padding: '12px',
                borderRadius: '8px',
                background: 'rgba(6, 182, 212, 0.15)',
                border: '1px solid var(--accent-cyan)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: '#ffffff',
                fontSize: '0.84rem'
              }}
            >
              <Loader2 size={18} className="spinner" />
              <span>{exportProgress || 'กำลังเรนเดอร์ภาพ...'}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
          <button className="btn-secondary" onClick={onClose} disabled={isExporting}>
            ปิด
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Export PDF */}
            <button
              className="btn-secondary"
              onClick={handleExportPDF}
              disabled={isExporting || pages.length === 0}
              title="ส่งออกเป็นเอกสาร PDF รวมทุกหน้า"
            >
              <FileText size={14} /> บันทึกเป็น PDF
            </button>

            {/* Direct Download Images */}
            <button
              className="btn-secondary"
              onClick={handleExportIndividualImages}
              disabled={isExporting || pages.length === 0}
              title="ดาวน์โหลดแยกทีละไฟล์"
            >
              <FileImage size={14} /> ดาวน์โหลดแยกรูป ({pages.length})
            </button>

            {/* Primary Action: Download All in One ZIP */}
            <button
              className="btn-primary"
              onClick={handleExportZIP}
              disabled={isExporting || pages.length === 0}
              style={{
                background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))',
                boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)',
                fontWeight: 700
              }}
            >
              <Archive size={15} /> ดาวน์โหลด ZIP รวม ({pages.length} รูป)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
