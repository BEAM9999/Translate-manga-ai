// High-Definition Neural Voice TTS Engine (Optimized for Microsoft Edge Natural Voices & Google Neural TTS)
class TTSService {
  private synth: SpeechSynthesis | null = null;
  private isSpeaking = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private availableVoices: SpeechSynthesisVoice[] = [];

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.loadVoices();
      if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  private loadVoices() {
    if (!this.synth) return;
    this.availableVoices = this.synth.getVoices();
  }

  public getVoices(): SpeechSynthesisVoice[] {
    if (this.availableVoices.length === 0 && this.synth) {
      this.availableVoices = this.synth.getVoices();
    }
    return this.availableVoices;
  }

  /**
   * Finds the most natural, high-definition voice available in the browser (prioritizing Edge Natural Voices)
   */
  public findBestVoice(langPrefix = 'th', preferredVoiceName?: string): SpeechSynthesisVoice | null {
    const voices = this.getVoices();
    if (voices.length === 0) return null;

    // 1. Exact preferred name match
    if (preferredVoiceName) {
      const match = voices.find(v => v.name.toLowerCase() === preferredVoiceName.toLowerCase());
      if (match) return match;
    }

    // 2. Microsoft Edge Natural Voices (Premium AI Neural Voices)
    const edgeNatural = voices.find(v => 
      v.lang.toLowerCase().startsWith(langPrefix.toLowerCase()) && 
      (v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Neural'))
    );
    if (edgeNatural) return edgeNatural;

    // 3. Google Neural Voices
    const googleVoice = voices.find(v => 
      v.lang.toLowerCase().startsWith(langPrefix.toLowerCase()) && 
      v.name.toLowerCase().includes('google')
    );
    if (googleVoice) return googleVoice;

    // 4. Any voice matching language
    const langVoice = voices.find(v => v.lang.toLowerCase().startsWith(langPrefix.toLowerCase()));
    if (langVoice) return langVoice;

    return voices[0] || null;
  }

  public speak(
    text: string, 
    lang = 'th-TH', 
    speakerRole = 'normal', 
    preferredVoiceName?: string,
    onEnd?: () => void
  ) {
    if (!this.synth) {
      console.warn('Speech synthesis not supported in this browser.');
      if (onEnd) onEnd();
      return;
    }

    this.stop();

    const utterance = new SpeechSynthesisUtterance(text);
    this.currentUtterance = utterance;

    // Detect language code
    let langCode = 'th';
    if (/[\u0E00-\u0E7F]/.test(text)) {
      utterance.lang = 'th-TH';
      langCode = 'th';
    } else if (/[\u4e00-\u9fa5]/.test(text)) {
      utterance.lang = 'zh-CN';
      langCode = 'zh';
    } else if (/[\u3040-\u30ff]/.test(text)) {
      utterance.lang = 'ja-JP';
      langCode = 'ja';
    } else {
      utterance.lang = lang;
      langCode = lang.slice(0, 2);
    }

    // Select the best Microsoft Edge Natural or Google Neural voice
    const bestVoice = this.findBestVoice(langCode, preferredVoiceName);
    if (bestVoice) {
      utterance.voice = bestVoice;
    }

    // Natural Role-based modulation
    switch (speakerRole.toLowerCase()) {
      case 'villain':
      case 'demon':
      case 'boss':
      case 'พญาปีศาจ':
      case 'วายร้าย':
        utterance.pitch = 0.85;
        utterance.rate = 0.95;
        break;
      case 'shout':
      case 'angry':
      case 'ตะโกน':
        utterance.pitch = 1.1;
        utterance.rate = 1.1;
        break;
      case 'whisper':
      case 'กระซิบ':
        utterance.pitch = 0.95;
        utterance.rate = 0.9;
        break;
      case 'narrator':
      case 'ผู้บรรยาย':
        utterance.pitch = 1.0;
        utterance.rate = 1.0;
        break;
      case 'sfx':
        utterance.pitch = 1.15;
        utterance.rate = 1.2;
        break;
      default:
        utterance.pitch = 1.0;
        utterance.rate = 1.05;
        break;
    }

    utterance.onend = () => {
      this.isSpeaking = false;
      this.currentUtterance = null;
      if (onEnd) onEnd();
    };

    utterance.onerror = () => {
      this.isSpeaking = false;
      this.currentUtterance = null;
      if (onEnd) onEnd();
    };

    this.isSpeaking = true;
    this.synth.speak(utterance);
  }

  public stop() {
    if (this.synth) {
      this.synth.cancel();
      this.isSpeaking = false;
      this.currentUtterance = null;
    }
  }

  public getSpeakingState() {
    return this.isSpeaking;
  }
}

export const tts = new TTSService();
