import { MangaPage } from '../types';

// High-definition SVG Manga Art Page 1 (Fantasy Cyberpunk Action - English)
const SAMPLE_PAGE_1_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" width="800" height="1200">
  <defs>
    <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="50%" stop-color="#1e1b4b" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
    <linearGradient id="neonGlow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#06b6d4" />
      <stop offset="100%" stop-color="#ec4899" />
    </linearGradient>
    <filter id="comicShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="3" dy="4" stdDeviation="2" flood-color="#000000" flood-opacity="0.8"/>
    </filter>
  </defs>

  <!-- Manga Page Background & Panels -->
  <rect width="800" height="1200" fill="#0b0f19"/>

  <!-- Panel 1: Top Wide Cinematic View -->
  <g transform="translate(30, 30)">
    <rect width="740" height="340" fill="url(#skyGrad)" stroke="#38bdf8" stroke-width="4" rx="6"/>
    <!-- Cyber City Background Lines -->
    <path d="M40,300 L90,140 L160,300 L240,110 L320,300 L450,80 L560,300 L680,150 L730,300" fill="none" stroke="#334155" stroke-width="3"/>
    <circle cx="580" cy="110" r="55" fill="#f43f5e" opacity="0.85"/>
    <text x="370" y="50" fill="#94a3b8" font-family="'Inter', sans-serif" font-size="14" letter-spacing="3" text-anchor="middle">EPISODE 01: THE AWAKENING PROTOCOL</text>
    
    <!-- Hero Silhouette -->
    <polygon points="120,290 140,210 165,190 180,215 175,290" fill="#020617"/>
    <path d="M165,190 Q190,170 210,185 Q190,210 165,190" fill="#38bdf8"/>

    <!-- Slanted Physics/Speed SFX: WHOOSH! -->
    <g transform="rotate(-12 360 210)">
      <text x="330" y="210" font-family="'Bangers', Impact" font-size="54" fill="#facc15" stroke="#000" stroke-width="3" filter="url(#comicShadow)">*WHOOOOSH!!*</text>
    </g>

    <!-- Narration Box (Top Left) -->
    <g transform="translate(20, 20)">
      <rect width="210" height="75" fill="#f8fafc" stroke="#000" stroke-width="2.5" rx="3"/>
      <text x="15" y="32" font-family="'Comic Neue', sans-serif" font-weight="bold" font-size="16" fill="#000">Neo-Bangkok, 2088...</text>
      <text x="15" y="56" font-family="'Comic Neue', sans-serif" font-size="14" fill="#334155">The energy core breached.</text>
    </g>

    <!-- Speech Bubble (Right Hero) -->
    <g transform="translate(480, 160)">
      <path d="M 0,40 Q 0,0 40,0 L 190,0 Q 230,0 230,40 L 230,70 Q 230,100 190,100 L 80,100 L 50,125 L 65,100 L 40,100 Q 0,100 0,40 Z" fill="#ffffff" stroke="#000000" stroke-width="3"/>
      <text x="115" y="42" font-family="'Comic Neue', sans-serif" font-weight="bold" font-size="17" fill="#0f172a" text-anchor="middle">Is this power...</text>
      <text x="115" y="70" font-family="'Comic Neue', sans-serif" font-weight="bold" font-size="17" fill="#0f172a" text-anchor="middle">truly unlimited?!</text>
    </g>
  </g>

  <!-- Panel 2: Bottom Left - Villain / Cyborg confrontation -->
  <g transform="translate(30, 390)">
    <rect width="360" height="420" fill="#18181b" stroke="#f43f5e" stroke-width="4" rx="6"/>
    <!-- Glowing Red Eye Target -->
    <circle cx="180" cy="240" r="80" fill="#27272a"/>
    <circle cx="180" cy="240" r="18" fill="#ef4444"/>
    <line x1="60" y1="240" x2="300" y2="240" stroke="#ef4444" stroke-width="2" stroke-dasharray="6,6"/>

    <!-- Angular Spiky Shout Bubble -->
    <g transform="translate(25, 30)">
      <polygon points="10,35 60,10 180,5 290,20 310,75 280,120 180,130 110,135 70,165 80,130 15,115" fill="#ffffff" stroke="#ef4444" stroke-width="3.5"/>
      <text x="155" y="60" font-family="'Bangers', Impact" font-size="22" fill="#991b1b" text-anchor="middle">DON'T TOUCH THE CORE,</text>
      <text x="155" y="95" font-family="'Bangers', Impact" font-size="24" fill="#dc2626" text-anchor="middle">YOU FOOLISH HUMAN!!</text>
    </g>
  </g>

  <!-- Panel 3: Bottom Right - Physics & Energy Explosion -->
  <g transform="translate(410, 390)">
    <rect width="360" height="420" fill="#0c4a6e" stroke="#38bdf8" stroke-width="4" rx="6"/>
    <!-- Energy Sparks -->
    <path d="M180,180 L220,130 L200,200 L270,170 L210,240 L260,260 L170,260 L140,320 L160,240 L100,220 Z" fill="#38bdf8" opacity="0.7"/>
    
    <!-- Physics Equation / Diagram SFX -->
    <g transform="rotate(8 180 320)">
      <rect x="50" y="295" width="260" height="45" rx="5" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5"/>
      <text x="180" y="325" font-family="'Courier New', monospace" font-weight="bold" font-size="16" fill="#7dd3fc" text-anchor="middle">ΔE = mc² [CRITICAL RESONANCE]</text>
    </g>

    <!-- Thought Bubble -->
    <g transform="translate(40, 40)">
      <ellipse cx="140" cy="65" rx="125" ry="50" fill="#ffffff" stroke="#000000" stroke-width="2.5"/>
      <circle cx="70" cy="125" r="10" fill="#ffffff" stroke="#000000" stroke-width="2"/>
      <circle cx="55" cy="142" r="5" fill="#ffffff" stroke="#000000" stroke-width="2"/>
      <text x="140" y="58" font-family="'Comic Neue', sans-serif" font-size="15" fill="#1e293b" text-anchor="middle">My neural link...</text>
      <text x="140" y="82" font-family="'Comic Neue', sans-serif" font-weight="bold" font-size="15" fill="#0284c7" text-anchor="middle">it's synchronizing perfectly!</text>
    </g>
  </g>

  <!-- Panel 4: Bottom Climax Panel -->
  <g transform="translate(30, 830)">
    <rect width="740" height="340" fill="#111827" stroke="#fbbf24" stroke-width="4" rx="6"/>
    <!-- Power Aura -->
    <circle cx="370" cy="200" r="120" fill="#fbbf24" opacity="0.15"/>
    
    <!-- Curved Big SFX: *KABOOOM* -->
    <g transform="rotate(-6 370 110)">
      <text x="370" y="110" font-family="'Bangers', Impact" font-size="76" fill="#f97316" stroke="#ffffff" stroke-width="3" text-anchor="middle" filter="url(#comicShadow)">*KRRRRZZZZ-BOOM!!*</text>
    </g>

    <!-- Final Speech Bubble -->
    <g transform="translate(220, 160)">
      <path d="M 0,35 Q 0,0 35,0 L 265,0 Q 300,0 300,35 L 300,75 Q 300,110 265,110 L 170,110 L 150,140 L 140,110 L 35,110 Q 0,110 0,35 Z" fill="#ffffff" stroke="#000000" stroke-width="3"/>
      <text x="150" y="45" font-family="'Comic Neue', sans-serif" font-weight="bold" font-size="18" fill="#000" text-anchor="middle">Let the new world order</text>
      <text x="150" y="78" font-family="'Comic Neue', sans-serif" font-weight="bold" font-size="20" fill="#b91c1c" text-anchor="middle">BEGIN RIGHT NOW!!</text>
    </g>
  </g>
</svg>
`)}`;

// High-definition SVG Manga Art Page 2 (Chinese Cultivation / Martial Arts Manga with Vertical & Slanted Text)
const SAMPLE_PAGE_2_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" width="800" height="1200">
  <defs>
    <linearGradient id="cloudGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1c1917" />
      <stop offset="50%" stop-color="#292524" />
      <stop offset="100%" stop-color="#0c0a09" />
    </linearGradient>
    <filter id="goldGlow">
      <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#eab308" flood-opacity="0.9"/>
    </filter>
  </defs>

  <rect width="800" height="1200" fill="#0c0a09"/>

  <!-- Panel 1: Top Mountain Peak / Sword Qi -->
  <g transform="translate(30, 30)">
    <rect width="740" height="380" fill="url(#cloudGrad)" stroke="#d97706" stroke-width="4" rx="6"/>
    <!-- Moon & Mountains -->
    <circle cx="620" cy="110" r="60" fill="#fef08a" opacity="0.9" filter="url(#goldGlow)"/>
    <path d="M0,350 L180,120 L320,290 L480,90 L650,330 L740,240 L740,380 L0,380 Z" fill="#1c1917"/>
    
    <!-- Chinese Title / Caption Box -->
    <g transform="translate(20, 20)">
      <rect width="180" height="65" fill="#fef3c7" stroke="#78350f" stroke-width="2" rx="4"/>
      <text x="90" y="30" font-family="'Noto Sans SC', sans-serif" font-weight="bold" font-size="15" fill="#78350f" text-anchor="middle">第二回 · 天道神剑</text>
      <text x="90" y="52" font-family="'Noto Sans SC', sans-serif" font-size="12" fill="#92400e" text-anchor="middle">Chapter 2: Heavenly Sword</text>
    </g>

    <!-- Vertical Chinese Dialogue Bubble (Master) -->
    <g transform="translate(480, 160)">
      <path d="M 0,30 Q 0,0 30,0 L 160,0 Q 190,0 190,30 L 190,140 Q 190,170 160,170 L 60,170 L 30,195 L 45,170 L 30,170 Q 0,170 0,140 Z" fill="#ffffff" stroke="#000000" stroke-width="3"/>
      <text x="95" y="42" font-family="'Noto Sans SC', sans-serif" font-weight="bold" font-size="20" fill="#0f172a" text-anchor="middle">九幽龙脉已经苏醒！</text>
      <text x="95" y="78" font-family="'Noto Sans SC', sans-serif" font-weight="bold" font-size="18" fill="#b45309" text-anchor="middle">徒儿，拔出你的神剑！</text>
      <text x="95" y="115" font-family="'Noto Sans SC', sans-serif" font-size="15" fill="#475569" text-anchor="middle">切莫让妖王得逞！</text>
    </g>

    <!-- Slanted Sword Sound Effect: 铮! (CLANG!) -->
    <g transform="rotate(-15 280 230)">
      <text x="240" y="230" font-family="'Noto Sans SC', sans-serif" font-weight="900" font-size="64" fill="#fbbf24" stroke="#000" stroke-width="3">铮——！</text>
    </g>
  </g>

  <!-- Panel 2: Bottom Left - Disciple's Determination -->
  <g transform="translate(30, 430)">
    <rect width="360" height="360" fill="#1e1b4b" stroke="#818cf8" stroke-width="4" rx="6"/>
    <!-- Aura Rays -->
    <line x1="180" y1="180" x2="30" y2="40" stroke="#818cf8" stroke-width="3" opacity="0.4"/>
    <line x1="180" y1="180" x2="330" y2="80" stroke="#818cf8" stroke-width="3" opacity="0.4"/>

    <!-- Speech Bubble (Disciple) -->
    <g transform="translate(30, 40)">
      <path d="M 0,30 Q 0,0 30,0 L 270,0 Q 300,0 300,30 L 300,100 Q 300,130 270,130 L 180,130 L 160,155 L 150,130 L 30,130 Q 0,130 0,100 Z" fill="#ffffff" stroke="#000000" stroke-width="3"/>
      <text x="150" y="45" font-family="'Noto Sans SC', sans-serif" font-weight="bold" font-size="20" fill="#1e1b4b" text-anchor="middle">弟子遵命！</text>
      <text x="150" y="80" font-family="'Noto Sans SC', sans-serif" font-weight="bold" font-size="17" fill="#4338ca" text-anchor="middle">今日定斩妖除魔！</text>
      <text x="150" y="110" font-family="'Noto Sans SC', sans-serif" font-size="14" fill="#64748b" text-anchor="middle">不负师尊教诲！</text>
    </g>
  </g>

  <!-- Panel 3: Bottom Right - Demonic Roar -->
  <g transform="translate(410, 430)">
    <rect width="360" height="360" fill="#450a0a" stroke="#ef4444" stroke-width="4" rx="6"/>
    
    <!-- Jagged Demon Roar Bubble -->
    <g transform="translate(20, 50)">
      <polygon points="10,40 50,10 160,5 280,15 315,65 295,140 210,150 150,190 140,150 20,135" fill="#000000" stroke="#ef4444" stroke-width="3"/>
      <text x="160" y="65" font-family="'Noto Sans SC', sans-serif" font-weight="900" font-size="22" fill="#fca5a5" text-anchor="middle">狂妄小儿！</text>
      <text x="160" y="105" font-family="'Noto Sans SC', sans-serif" font-weight="900" font-size="24" fill="#ef4444" text-anchor="middle">受死吧！！吼！！</text>
    </g>

    <!-- Monster SFX: 轰隆! (BOOM!) -->
    <text x="180" y="290" font-family="'Noto Sans SC', sans-serif" font-weight="900" font-size="52" fill="#ef4444" stroke="#ffffff" stroke-width="2" text-anchor="middle">轰隆——！</text>
  </g>

  <!-- Panel 4: Wide Sword Strike Action -->
  <g transform="translate(30, 810)">
    <rect width="740" height="360" fill="#172554" stroke="#60a5fa" stroke-width="4" rx="6"/>
    <!-- Slash Line -->
    <path d="M40,300 Q370,120 700,50" fill="none" stroke="#93c5fd" stroke-width="12" opacity="0.8"/>
    <path d="M40,300 Q370,120 700,50" fill="none" stroke="#ffffff" stroke-width="4"/>

    <!-- Martial Arts Technique Shout -->
    <g transform="translate(240, 140)">
      <polygon points="15,30 50,5 230,10 265,55 245,115 160,125 120,155 125,125 15,100" fill="#ffffff" stroke="#2563eb" stroke-width="3"/>
      <text x="140" y="52" font-family="'Noto Sans SC', sans-serif" font-weight="bold" font-size="22" fill="#1e3a8a" text-anchor="middle">万剑归宗 · 破！</text>
      <text x="140" y="88" font-family="'Noto Sans SC', sans-serif" font-size="16" fill="#2563eb" text-anchor="middle">(Ten Thousand Swords Strike!)</text>
    </g>
  </g>
</svg>
`)}`;

export const SAMPLE_PAGES: MangaPage[] = [
  {
    id: 'sample_page_1',
    originalImageUrl: SAMPLE_PAGE_1_SVG,
    width: 800,
    height: 1200,
    isTranslating: false,
    isTranslated: true,
    orderIndex: 1,
    ocrResults: [
      {
        id: 'p1_b1',
        box_2d: [42, 63, 104, 325], // Narration Box (Top Left)
        source_text: 'Neo-Bangkok, 2088... The energy core breached.',
        translated_text: 'นีโอ-กรุงเทพฯ ปี 2088... แกนพลังงานเกิดการรั่วไหลอย่างรุนแรง!',
        speaker: 'Narrator (ผู้บรรยาย)',
        bubble_type: 'narration',
        text_orientation: 'horizontal',
        emotion: 'serious',
        bg_color: '#f8fafc',
        reading_order: 1
      },
      {
        id: 'p1_b2',
        box_2d: [142, 375, 208, 625], // Slanted WHOOSH SFX
        source_text: '*WHOOOOSH!!*',
        translated_text: '*ฟู่วววววว!! (เสียงพุ่งผ่าน)*',
        speaker: 'SFX เสียงลม/ความเร็ว',
        bubble_type: 'sfx',
        text_orientation: 'slanted',
        emotion: 'excited',
        bg_color: 'transparent',
        reading_order: 2
      },
      {
        id: 'p1_b3',
        box_2d: [158, 637, 267, 925], // Hero Speech Bubble
        source_text: 'Is this power... truly unlimited?!',
        translated_text: 'พลังมหาศาลนี่มัน... ไร้ขีดจำกัดจริง ๆ งั้นเหรอเนี่ย?!',
        speaker: 'Protagonist (พระเอก)',
        bubble_type: 'speech',
        text_orientation: 'horizontal',
        emotion: 'shocked',
        bg_color: '#ffffff',
        reading_order: 3
      },
      {
        id: 'p1_b4',
        box_2d: [350, 69, 458, 456], // Villain Spiky Shout
        source_text: "DON'T TOUCH THE CORE, YOU FOOLISH HUMAN!!",
        translated_text: 'อย่าแตะต้องแกนพลังงานนะ เจ้ามนุษย์หน้าโง่!!',
        speaker: 'Villain Cyborg (วายร้ายไซบอร์ก)',
        bubble_type: 'shout',
        text_orientation: 'horizontal',
        emotion: 'angry',
        bg_color: '#ffffff',
        reading_order: 4
      },
      {
        id: 'p1_b5',
        box_2d: [358, 563, 475, 875], // Thought Bubble
        source_text: "My neural link... it's synchronizing perfectly!",
        translated_text: 'ระบบเชื่อมต่อประสาทของฉัน... กำลังผสานกันได้อย่างสมบูรณ์แบบ!',
        speaker: 'Protagonist (เสียงในใจ)',
        bubble_type: 'thought',
        text_orientation: 'horizontal',
        emotion: 'excited',
        bg_color: '#ffffff',
        reading_order: 5
      },
      {
        id: 'p1_b6',
        box_2d: [575, 575, 625, 900], // Physics Equation SFX
        source_text: 'ΔE = mc² [CRITICAL RESONANCE]',
        translated_text: 'ΔE = mc² [การสั่นพ้องขั้นวิกฤต]',
        speaker: 'Physics Data (ระบบวิเคราะห์พลังงาน)',
        bubble_type: 'physics_label',
        text_orientation: 'horizontal',
        emotion: 'neutral',
        bg_color: '#0f172a',
        reading_order: 6
      },
      {
        id: 'p1_b7',
        box_2d: [700, 250, 783, 750], // Huge SFX
        source_text: '*KRRRRZZZZ-BOOM!!*',
        translated_text: '*เปรี้ยงงงงงงง-บึ้มมมม!!*',
        speaker: 'SFX เสียงระเบิดสายฟ้า',
        bubble_type: 'sfx',
        text_orientation: 'slanted',
        emotion: 'shocked',
        bg_color: 'transparent',
        reading_order: 7
      },
      {
        id: 'p1_b8',
        box_2d: [825, 312, 942, 688], // Final Speech Bubble
        source_text: 'Let the new world order BEGIN RIGHT NOW!!',
        translated_text: 'ระเบียบโลกใหม่... จงเริ่มต้นขึ้น ณ บัดนี้!!',
        speaker: 'Protagonist (พระเอก)',
        bubble_type: 'shout',
        text_orientation: 'horizontal',
        emotion: 'excited',
        bg_color: '#ffffff',
        reading_order: 8
      }
    ]
  },
  {
    id: 'sample_page_2',
    originalImageUrl: SAMPLE_PAGE_2_SVG,
    width: 800,
    height: 1200,
    isTranslating: false,
    isTranslated: true,
    orderIndex: 2,
    ocrResults: [
      {
        id: 'p2_b1',
        box_2d: [42, 63, 96, 288], // Chapter Title
        source_text: '第二回 · 天道神剑 (Chapter 2: Heavenly Sword)',
        translated_text: 'ตอนที่ 2 · ดาบเทพสวรรค์สะท้านพิภพ',
        speaker: 'Title / Caption',
        bubble_type: 'narration',
        text_orientation: 'horizontal',
        emotion: 'neutral',
        bg_color: '#fef3c7',
        reading_order: 1
      },
      {
        id: 'p2_b2',
        box_2d: [158, 637, 308, 875], // Master Speech
        source_text: '九幽龙脉已经苏醒！徒儿，拔出你的神剑！切莫让妖王得逞！',
        translated_text: 'ชีพจรมังกรเก้าภพตื่นขึ้นแล้ว! ศิษย์ข้า จงชักกระบี่เทพของเจ้าออกมา! อย่าให้ราชาปีศาจทำสำเร็จเด็ดขาด!',
        speaker: 'Master (ท่านอาจารย์)',
        bubble_type: 'speech',
        text_orientation: 'vertical',
        emotion: 'serious',
        bg_color: '#ffffff',
        reading_order: 2
      },
      {
        id: 'p2_b3',
        box_2d: [167, 300, 242, 475], // Sword Clang SFX
        source_text: '铮——！(CLANG!)',
        translated_text: '*เคร้งงงงงงง! (เสียงดาบกระทบ)*',
        speaker: 'SFX ดาบปะทะ',
        bubble_type: 'sfx',
        text_orientation: 'slanted',
        emotion: 'excited',
        bg_color: 'transparent',
        reading_order: 3
      },
      {
        id: 'p2_b4',
        box_2d: [392, 75, 525, 450], // Disciple Speech
        source_text: '弟子遵命！今日定斩妖除魔！不负师尊教诲！',
        translated_text: 'ศิษย์น้อมรับบัญชา! วันนี้ข้าจะกวาดล้างเหล่าปีศาจ ไม่ให้เสียชื่อที่อาจารย์สั่งสอนมา!',
        speaker: 'Disciple (ศิษย์เอก)',
        bubble_type: 'speech',
        text_orientation: 'horizontal',
        emotion: 'excited',
        bg_color: '#ffffff',
        reading_order: 4
      },
      {
        id: 'p2_b5',
        box_2d: [400, 538, 542, 938], // Demon Roar
        source_text: '狂妄小儿！受死吧！！吼！！',
        translated_text: 'เจ้าเด็กโอหัง! จงรับความตายซะเถอะ!! โฮกกกก!!',
        speaker: 'Demon Lord (พญาปีศาจ)',
        bubble_type: 'shout',
        text_orientation: 'horizontal',
        emotion: 'angry',
        bg_color: '#000000',
        reading_order: 5
      },
      {
        id: 'p2_b6',
        box_2d: [592, 563, 675, 913], // Monster Boom SFX
        source_text: '轰隆——！(BOOM!)',
        translated_text: '*ครืนนนนนนนน!!*',
        speaker: 'SFX เสียงคำรามสะเทือนฟ้า',
        bubble_type: 'sfx',
        text_orientation: 'horizontal',
        emotion: 'shocked',
        bg_color: 'transparent',
        reading_order: 6
      },
      {
        id: 'p2_b7',
        box_2d: [792, 338, 925, 675], // Martial Arts Technique
        source_text: '万剑归宗 · 破！',
        translated_text: 'หมื่นกระบี่คืนสู่ต้นกำเนิด · ทลายสิ้น!!',
        speaker: 'Disciple (ศิษย์เอก)',
        bubble_type: 'shout',
        text_orientation: 'horizontal',
        emotion: 'excited',
        bg_color: '#ffffff',
        reading_order: 7
      }
    ]
  }
];
