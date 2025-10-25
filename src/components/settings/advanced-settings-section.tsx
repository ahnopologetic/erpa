import React from 'react';
import { SettingRow } from './setting-row';
import { Switch } from '~components/ui/switch';
import { Input } from '~components/ui/input';
import { useUserConfig, useAdvancedSettings } from '~contexts/UserConfigContext';

export const AdvancedSettingsSection: React.FC = () => {
  const { updateConfig } = useUserConfig();
  const advanced = useAdvancedSettings();

  return (
    <div className="space-y-1 w-full max-w-full">
      <div className="px-4 py-2 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-gray-300">Advanced</h3>
      </div>

      <SettingRow
        label="Max Agent Iterations"
        description="Maximum number of agent iterations before stopping (1-20)"
      >
        <Input
          type="number"
          min={1}
          max={20}
          value={advanced.maxIterations}
          onChange={(e) => {
            const value = parseInt(e.target.value);
            if (!isNaN(value) && value >= 1 && value <= 20) {
              updateConfig({ advanced: { maxIterations: value } });
            }
          }}
          className="w-24 bg-gray-800 border-gray-600 text-white"
        />
      </SettingRow>

      <SettingRow
        label="Enable Debug Logging"
        description="Enable verbose console logging for debugging"
      >
        <Switch
          checked={advanced.debugLogging}
          onCheckedChange={(checked) => updateConfig({ advanced: { debugLogging: checked } })}
        />
      </SettingRow>

      <SettingRow
        label="Cache TTL (hours)"
        description="Time-to-live for semantic search cache"
      >
        <Input
          type="number"
          min={1}
          value={advanced.cacheTTL}
          onChange={(e) => {
            const value = parseInt(e.target.value);
            if (!isNaN(value) && value >= 1) {
              updateConfig({ advanced: { cacheTTL: value } });
            }
          }}
          className="w-24 bg-gray-800 border-gray-600 text-white"
        />
      </SettingRow>
    </div>
  );
};
