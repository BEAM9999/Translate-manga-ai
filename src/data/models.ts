import { ModelOption } from '../types';

export const GEMINI_MODELS: ModelOption[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    category: 'Recommended',
    description: 'สมดุลความเร็วและความแม่นยำสูงสุด เหมาะสำหรับการแปลการ์ตูนทั่วไปและ SFX',
    badge: 'Recommended'
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    category: 'Pro / Deep Context',
    description: 'ความเข้าใจบริบทลึกซึ้ง เหมาะกับบทสนทนาซับซ้อน มังงะแนวดราม่า/สืบสวน/วิทยาศาสตร์',
    badge: 'Deep Reasoning'
  },
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    category: 'Ultra Fast / Lite',
    description: 'ประหยัด Token และตอบสนองรวดเร็วมาก สำหรับการอ่านเร็ว',
    badge: 'Fast & Lite'
  },
  {
    id: 'gemini-3-flash',
    name: 'Gemini 3 Flash',
    category: 'Recommended',
    description: 'โมเดล Generation 3 ประมวลผลภาพมังงะและตรวจจับฟอนต์เอียง/SFX ละเอียดสูง',
    badge: 'Next Gen'
  },
  {
    id: 'gemini-3-pro',
    name: 'Gemini 3 Pro',
    category: 'Pro / Deep Context',
    description: 'โมเดล Pro Gen 3 ล่าสุด เข้าใจภาษาจีน/อังกฤษโบราณ คำแสลง และความหมายซ่อนเร้น',
    badge: 'Top Tier'
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    category: 'Ultra Fast / Lite',
    description: 'ความเร็วแสง ประหยัดแบนด์วิธ รองรับการประมวลผลหลายหน้าพร้อมกัน',
    badge: 'Speed'
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    category: 'Recommended',
    description: 'การมองเห็นความละเอียดพิเศษ ตรวจจับพิกัด Bounding Box ได้แม่นยำระดับพิกเซล',
    badge: 'Precision'
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash Lite',
    category: 'Ultra Fast / Lite',
    description: 'ประสิทธิภาพสูงในขนาดกะทัดรัด แปลได้รวดเร็วทันใจ',
    badge: 'Lite'
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    category: 'Recommended',
    description: 'ความสามารถด้าน OCR ฟอนต์ยาก ฟอนต์เอียง และ SFX ขั้นสูง',
    badge: 'Ultra Vision'
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    category: 'Recommended',
    description: 'โมเดล Flash ความเร็วสูง รองรับ Hybrid Reasoning และการมองเห็นมังงะละเอียดสูงสุด',
    badge: 'Hybrid Reasoning'
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    category: 'Recommended',
    description: 'โมเดล Flash เจเนอเรชันล่าสุด ตอบสนองเร็วเป็นเลิศ แม่นยำสูงทั้ง OCR มังงะและการแปลภาษา',
    badge: 'Latest & Flagship'
  },
  {
    id: 'gemini-2.5-flash-preview',
    name: 'Gemini 2.5 Flash (Preview)',
    category: 'Preview / Experimental',
    description: 'เวอร์ชันพรีวิวสำหรับทดสอบฟีเจอร์การตรวจจับภาพล่าสุด',
    badge: 'Preview'
  },
  {
    id: 'gemini-2.5-pro-preview',
    name: 'Gemini 2.5 Pro (Preview)',
    category: 'Preview / Experimental',
    description: 'เวอร์ชันพรีวิว Pro สำหรับการวิเคราะห์มังงะเชิงลึก',
    badge: 'Preview'
  },
  {
    id: 'gemini-2.5-flash-lite-preview',
    name: 'Gemini 2.5 Flash Lite (Preview)',
    category: 'Preview / Experimental',
    description: 'พรีวิวรุ่น Lite ความเร็วสูง',
    badge: 'Preview'
  },
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash (Preview)',
    category: 'Preview / Experimental',
    description: 'พรีวิวโมเดล Flash Gen 3 พร้อมสถาปัตยกรรม Multimodal แบบใหม่',
    badge: 'Preview'
  },
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro (Preview)',
    category: 'Preview / Experimental',
    description: 'พรีวิวโมเดล Pro Gen 3 สำหรับการทดสอบความสามารถขั้นสูง',
    badge: 'Preview'
  },
  {
    id: 'gemini-2-flash-exp',
    name: 'Gemini 2 Flash Exp',
    category: 'Preview / Experimental',
    description: 'โมเดลทดลอง Experimental สำหรับทดสอบความเร็วและการแยกแยะวัตถุ',
    badge: 'Experimental'
  },
  {
    id: 'gemini-2-pro-exp',
    name: 'Gemini 2 Pro Exp',
    category: 'Preview / Experimental',
    description: 'โมเดลทดลอง Pro Experimental',
    badge: 'Experimental'
  },
  {
    id: 'custom',
    name: 'Custom Model (ระบุชื่อโมเดลเอง)',
    category: 'Preview / Experimental',
    description: 'พิมพ์รหัสโมเดล Gemini ตามที่คุณต้องการเอง',
    badge: 'Custom'
  }
];
