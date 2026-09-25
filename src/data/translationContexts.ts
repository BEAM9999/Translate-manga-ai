import { TranslationContextOption } from '../types';

export const TRANSLATION_CONTEXTS: TranslationContextOption[] = [
  {
    id: 'modern_era',
    title: '🏙️ ยุคปัจจุบัน / สมัยใหม่ (Modern Contemporary)',
    category: 'ยุคปัจจุบัน',
    description: 'ภาษาพูดคนยุคปัจจุบัน 100% (ฉัน, นาย, คุณ, พวกแก, เขา) กระชับ ตรงประเด็น เป็นธรรมชาติ แม้ตัวละครจะเป็นเซียนข้ามยุคมาก็ต้องพูดจาภาษาคนยุคปัจจุบัน (ชื่อวิชา/ทักษะใช้ทับศัพท์เฉพาะ)',
    promptGuidance: `STRICT CONTEXT: MODERN CONTEMPORARY ERA (ยุคปัจจุบันสมัยใหม่).
- All dialogue MUST strictly use 100% natural, contemporary modern Thai conversational speech (ฉัน, นาย, คุณ, พวกแก, เขา, เธอ, มึง, กู ตามระดับอารมณ์).
- DO NOT use ancient or archaic phrasing (DO NOT use "ข้า/เจ้า/แม่นาง/คารวะ" in regular dialogue).
- Even if a character is an ancient cultivator reborn or transmigrated into the modern world, they MUST speak modern Thai. Only martial arts techniques, cultivation ranks, pills, or artifacts retain their specific names (e.g. "พลังปราณ", "โอสถรักษา", "หมัดมังกรทลายฟ้า").
- Translate into ONE single, punchy, concise sentence per bubble. NO double translations, NO parentheses explanations.`
  },
  {
    id: 'ancient_cultivation',
    title: '📜 ยุคโบราณ / โลกเซียน / กำลังภายใน (Ancient Cultivation)',
    category: 'ยุคโบราณ / โลกเซียน',
    description: 'ภาษาแนวยุทธภพ/โลกเซียน 100% ใช้สรรพนาม ข้า, เจ้า, ท่าน, ศิษย์พี่, ผู้อาวุโส แปลเข้าใจง่าย ลื่นไหล น่าติดตาม ไม่ใช้คำโบราณจนฟังยาก',
    promptGuidance: `STRICT CONTEXT: ANCIENT XIANXIA / CULTIVATION WORLD (ยุคโบราณ/โลกเซียน).
- All dialogue MUST strictly use classic cultivation / wuxia phrasing (ข้า, เจ้า, ท่าน, ศิษย์พี่, ผู้อาวุโส, สำนัก, ประมุข).
- Flow smoothly and naturally in modern-readable scanlation Thai without excessively cryptic ancient poetry.
- Translate into ONE single, punchy, concise sentence per bubble. NO double translations, NO parentheses explanations.`
  },
  {
    id: 'game_system',
    title: '🎮 ยุคเกม / ระบบดันเจี้ยน / Level Up (Game System / Hunter)',
    category: 'มังงะระบบ / ดันเจี้ยน',
    description: 'มังงะแนวดันเจี้ยนเปิดในเมือง, Hunter, ระบบสเตตัส, เควสต์, สกิล, Level Up, ปาร์ตี้ลงดัน สำนวนเกมเมอร์กระชับ ตื่นเต้น',
    promptGuidance: `STRICT CONTEXT: GAME SYSTEM / HUNTER / LEVEL UP (ยุคเกม/ระบบดันเจี้ยน).
- All dialogue uses modern gamer/hunter terminology: เควสต์, สกิล, อัปเลเวล, ปาร์ตี้, ฮันเตอร์, บอส, ดันเจี้ยน, ไอเทม, ค่าสเตตัส.
- Fast-paced, concise, thrilling contemporary tone.
- Translate into ONE single, punchy, concise sentence per bubble. NO double translations, NO parentheses explanations.`
  },
  {
    id: 'custom_context',
    title: '✨ กำหนดบริบทเฉพาะทางเอง (Custom Context)',
    category: 'กำหนดเอง',
    description: 'พิมพ์คำอธิบายบริบทและสำนวนที่คุณต้องการให้ AI เข้าใจและใช้เพียงบริบทเดียว',
    promptGuidance: `Custom User-Defined Context Guidance.`
  }
];
