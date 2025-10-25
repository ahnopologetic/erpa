export interface TTSSettings {
  speed: number;
  pitch: number;
  volume: number;
  voice: string | null;
  autoReadAloud: boolean;
  stopOnHandsUp: boolean;
}

export interface ExperienceSettings {
  autoSummarize: boolean;
  autoTOC: boolean;
  theme: 'dark' | 'light' | 'auto' | 'high-contrast';
  textSize: 'small' | 'medium' | 'large' | 'extra-large';
  showProgress: boolean;
  voiceFeedback: boolean;
  reduceMotion: boolean;
}

export interface AdvancedSettings {
  maxIterations: number;
  debugLogging: boolean;
  cacheTTL: number;
}

export interface UserConfig {
  version: number;
  tts: TTSSettings;
  experience: ExperienceSettings;
  advanced: AdvancedSettings;
}

export const DEFAULT_CONFIG: UserConfig = {
  version: 1,
  tts: {
    speed: 1.0,
    pitch: 1.0,
    volume: 1.0,
    voice: null, // Use system default
    autoReadAloud: false,
    stopOnHandsUp: true,
  },
  experience: {
    autoSummarize: false,
    autoTOC: false,
    theme: 'dark',
    textSize: 'medium',
    showProgress: true,
    voiceFeedback: false,
    reduceMotion: false,
  },
  advanced: {
    maxIterations: 10,
    debugLogging: false,
    cacheTTL: 24,
  },
};

export type ConfigUpdate = Partial<{
  tts: Partial<TTSSettings>;
  experience: Partial<ExperienceSettings>;
  advanced: Partial<AdvancedSettings>;
}>;

export function validateConfig(config: unknown): config is UserConfig {
  if (!config || typeof config !== 'object') return false;
  
  const c = config as any;
  
  // Check version
  if (typeof c.version !== 'number') return false;
  
  // Check TTS settings
  if (!c.tts || typeof c.tts !== 'object') return false;
  if (typeof c.tts.speed !== 'number' || c.tts.speed < 0.25 || c.tts.speed > 4) return false;
  if (typeof c.tts.pitch !== 'number' || c.tts.pitch < 0.5 || c.tts.pitch > 2) return false;
  if (typeof c.tts.volume !== 'number' || c.tts.volume < 0 || c.tts.volume > 1) return false;
  if (typeof c.tts.autoReadAloud !== 'boolean') return false;
  if (typeof c.tts.stopOnHandsUp !== 'boolean') return false;
  
  // Check Experience settings
  if (!c.experience || typeof c.experience !== 'object') return false;
  if (typeof c.experience.autoSummarize !== 'boolean') return false;
  if (typeof c.experience.autoTOC !== 'boolean') return false;
  if (!['dark', 'light', 'auto', 'high-contrast'].includes(c.experience.theme)) return false;
  if (!['small', 'medium', 'large', 'extra-large'].includes(c.experience.textSize)) return false;
  if (typeof c.experience.showProgress !== 'boolean') return false;
  if (typeof c.experience.voiceFeedback !== 'boolean') return false;
  if (typeof c.experience.reduceMotion !== 'boolean') return false;
  
  // Check Advanced settings
  if (!c.advanced || typeof c.advanced !== 'object') return false;
  if (typeof c.advanced.maxIterations !== 'number' || c.advanced.maxIterations < 1 || c.advanced.maxIterations > 20) return false;
  if (typeof c.advanced.debugLogging !== 'boolean') return false;
  if (typeof c.advanced.cacheTTL !== 'number' || c.advanced.cacheTTL < 1) return false;
  
  return true;
}
