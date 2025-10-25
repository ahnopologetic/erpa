import React from 'react';
import { TTSSettingsSection } from './tts-settings-section';
import { ExperienceSettingsSection } from './experience-settings-section';
import { AdvancedSettingsSection } from './advanced-settings-section';
import { Button } from '~components/ui/button';
import { useUserConfig } from '~contexts/UserConfigContext';

export const SettingsContainer: React.FC = () => {
  const { resetConfig } = useUserConfig();
  const [showResetConfirm, setShowResetConfirm] = React.useState(false);

  const handleReset = async () => {
    await resetConfig();
    setShowResetConfirm(false);
  };

  return (
    <div className="w-full h-full flex flex-col bg-gray-900 text-white overflow-hidden">
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="space-y-8 p-6 max-w-full">
          <TTSSettingsSection />
          <ExperienceSettingsSection />
          <AdvancedSettingsSection />
        </div>
      </div>
      
      <div className="border-t border-gray-700 p-4 flex justify-end flex-shrink-0">
        {showResetConfirm ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">Reset all settings?</span>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleReset}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowResetConfirm(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowResetConfirm(true)}
          >
            Reset to Defaults
          </Button>
        )}
      </div>
    </div>
  );
};
