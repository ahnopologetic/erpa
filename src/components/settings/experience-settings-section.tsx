import React from 'react';
import { SettingRow } from './setting-row';
import { Switch } from '~components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~components/ui/select';
import { useUserConfig, useExperienceSettings } from '~contexts/UserConfigContext';

export const ExperienceSettingsSection: React.FC = () => {
  const { updateConfig } = useUserConfig();
  const experience = useExperienceSettings();

  return (
    <div className="space-y-1 w-full max-w-full">
      <div className="px-4 py-2 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-gray-300">Experience</h3>
      </div>

      <SettingRow
        label="Auto summarization on sidepanel open"
        description="Automatically summarize the current page when opening the sidepanel"
      >
        <Switch
          checked={experience.autoSummarize}
          onCheckedChange={(checked) => updateConfig({ experience: { autoSummarize: checked } })}
        />
      </SettingRow>

      <SettingRow
        label="Auto TOC Generation"
        description="Automatically generate table of contents for the page"
      >
        <Switch
          checked={experience.autoTOC}
          onCheckedChange={(checked) => updateConfig({ experience: { autoTOC: checked } })}
        />
      </SettingRow>

      <SettingRow
        label="Theme"
        description="Choose your preferred theme"
      >
        <Select
          value={experience.theme}
          onValueChange={(value: 'dark' | 'light' | 'auto' | 'high-contrast') =>
            updateConfig({ experience: { theme: value } })
          }
        >
          <SelectTrigger className="w-[180px] max-w-[180px] bg-gray-800 border-gray-600">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-600">
            <SelectItem value="dark" className="text-white hover:bg-gray-700">Dark</SelectItem>
            <SelectItem value="light" className="text-white hover:bg-gray-700">Light</SelectItem>
            <SelectItem value="auto" className="text-white hover:bg-gray-700">Auto</SelectItem>
            <SelectItem value="high-contrast" className="text-white hover:bg-gray-700">High Contrast</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>

      <SettingRow
        label="Text Size"
        description="Adjust the text size for better readability"
      >
        <Select
          value={experience.textSize}
          onValueChange={(value: 'small' | 'medium' | 'large' | 'extra-large') =>
            updateConfig({ experience: { textSize: value } })
          }
        >
          <SelectTrigger className="w-[180px] max-w-[180px] bg-gray-800 border-gray-600">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-600">
            <SelectItem value="small" className="text-white hover:bg-gray-700">Small</SelectItem>
            <SelectItem value="medium" className="text-white hover:bg-gray-700">Medium</SelectItem>
            <SelectItem value="large" className="text-white hover:bg-gray-700">Large</SelectItem>
            <SelectItem value="extra-large" className="text-white hover:bg-gray-700">Extra Large</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>

      <SettingRow
        label="Show Progress Updates"
        description="Display agent iteration progress in the chat"
      >
        <Switch
          checked={experience.showProgress}
          onCheckedChange={(checked) => updateConfig({ experience: { showProgress: checked } })}
        />
      </SettingRow>

      <SettingRow
        label="Voice Feedback"
        description="Announce setting changes via text-to-speech"
      >
        <Switch
          checked={experience.voiceFeedback}
          onCheckedChange={(checked) => updateConfig({ experience: { voiceFeedback: checked } })}
        />
      </SettingRow>

      <SettingRow
        label="Reduce Motion"
        description="Disable animations for better accessibility"
      >
        <Switch
          checked={experience.reduceMotion}
          onCheckedChange={(checked) => updateConfig({ experience: { reduceMotion: checked } })}
        />
      </SettingRow>
    </div>
  );
};
