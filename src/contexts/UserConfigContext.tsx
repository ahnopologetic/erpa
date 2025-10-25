import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { UserConfig, ConfigUpdate } from '~types/user-config';
import { userConfigManager } from '~lib/user-config-storage';

interface UserConfigContextType {
  config: UserConfig;
  updateConfig: (update: ConfigUpdate) => Promise<void>;
  resetConfig: () => Promise<void>;
  isLoading: boolean;
}

const UserConfigContext = createContext<UserConfigContextType | undefined>(undefined);

export const UserConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<UserConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load initial config
    userConfigManager.load().then(loadedConfig => {
      setConfig(loadedConfig);
      setIsLoading(false);
    });

    // Subscribe to config changes
    const unsubscribe = userConfigManager.subscribe(updatedConfig => {
      setConfig(updatedConfig);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const updateConfig = useCallback(async (update: ConfigUpdate) => {
    await userConfigManager.update(update);
    // Config update will be handled by the subscription
  }, []);

  const resetConfig = useCallback(async () => {
    await userConfigManager.reset();
    // Config update will be handled by the subscription
  }, []);

  if (isLoading || !config) {
    return null; // Or a loading spinner
  }

  return (
    <UserConfigContext.Provider value={{ config, updateConfig, resetConfig, isLoading }}>
      {children}
    </UserConfigContext.Provider>
  );
};

export const useUserConfig = (): UserConfigContextType => {
  const context = useContext(UserConfigContext);
  if (!context) {
    throw new Error('useUserConfig must be used within a UserConfigProvider');
  }
  return context;
};

export const useTTSSettings = () => {
  const { config } = useUserConfig();
  return config.tts;
};

export const useExperienceSettings = () => {
  const { config } = useUserConfig();
  return config.experience;
};

export const useAdvancedSettings = () => {
  const { config } = useUserConfig();
  return config.advanced;
};
