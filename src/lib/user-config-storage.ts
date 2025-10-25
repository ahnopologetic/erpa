import { DEFAULT_CONFIG, UserConfig, validateConfig, ConfigUpdate } from '~types/user-config';

const STORAGE_KEY = 'erpa_user_config';
const CURRENT_VERSION = 1;

type Subscriber = (config: UserConfig) => void;
type Unsubscribe = () => void;

export class UserConfigManager {
  private subscribers: Set<Subscriber> = new Set();
  private cachedConfig: UserConfig | null = null;

  async load(): Promise<UserConfig> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const stored = result[STORAGE_KEY];

      if (stored && validateConfig(stored)) {
        // Check version and migrate if needed
        const config = this.migrateConfig(stored as UserConfig);
        this.cachedConfig = config;
        return config;
      }
    } catch (error) {
      console.error('[UserConfig] Failed to load config:', error);
    }

    // Return default config if loading fails or no config exists
    this.cachedConfig = DEFAULT_CONFIG;
    await this.save(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  async save(config: UserConfig): Promise<void> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: config });
      this.cachedConfig = config;
      this.notifySubscribers(config);
    } catch (error) {
      console.error('[UserConfig] Failed to save config:', error);
      throw error;
    }
  }

  async update(update: ConfigUpdate): Promise<UserConfig> {
    const current = await this.load();
    const updated: UserConfig = {
      ...current,
      ...(update.tts && { tts: { ...current.tts, ...update.tts } }),
      ...(update.experience && { experience: { ...current.experience, ...update.experience } }),
      ...(update.advanced && { advanced: { ...current.advanced, ...update.advanced } }),
    };

    await this.save(updated);
    return updated;
  }

  async reset(): Promise<UserConfig> {
    await this.save(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  subscribe(callback: Subscriber): Unsubscribe {
    this.subscribers.add(callback);
    
    // Immediately call with current config
    this.load().then(callback);

    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notifySubscribers(config: UserConfig): void {
    this.subscribers.forEach(callback => {
      try {
        callback(config);
      } catch (error) {
        console.error('[UserConfig] Error in subscriber:', error);
      }
    });
  }

  private migrateConfig(config: UserConfig): UserConfig {
    // For now, version 1 is the latest
    // Future versions can add migration logic here
    if (config.version < CURRENT_VERSION) {
      // Migrate from old versions
      console.log(`[UserConfig] Migrating config from version ${config.version} to ${CURRENT_VERSION}`);
      
      // Reset to defaults for now (can implement actual migration later)
      return DEFAULT_CONFIG;
    }
    
    return config;
  }

  async exportConfig(): Promise<string> {
    const config = await this.load();
    return JSON.stringify(config, null, 2);
  }

  async importConfig(json: string): Promise<UserConfig> {
    try {
      const parsed = JSON.parse(json);
      if (validateConfig(parsed)) {
        await this.save(parsed as UserConfig);
        return parsed as UserConfig;
      }
      throw new Error('Invalid config format');
    } catch (error) {
      console.error('[UserConfig] Failed to import config:', error);
      throw new Error('Invalid or corrupted config file');
    }
  }
}

// Singleton instance
export const userConfigManager = new UserConfigManager();
