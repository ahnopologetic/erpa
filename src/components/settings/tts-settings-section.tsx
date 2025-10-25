import React, { useState } from 'react';
import { SettingRow } from './setting-row';
import { AccessibleSlider } from './accessible-slider';
import { Switch } from '~components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~components/ui/select';
import { useUserConfig, useTTSSettings } from '~contexts/UserConfigContext';
import { Button } from '~components/ui/button';
import { Volume2 } from 'lucide-react';

export const TTSSettingsSection: React.FC = () => {
  const { updateConfig } = useUserConfig();
  const tts = useTTSSettings();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  React.useEffect(() => {
    const loadVoices = () => {
      const availableVoices = speechSynthesis.getVoices();
      setVoices(availableVoices);
    };

    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);

    return () => {
      speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  const speedPresets = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4];

  const testSpeed = () => {
    const utterance = new SpeechSynthesisUtterance('This is a test of the speech rate.');
    utterance.rate = tts.speed;
    utterance.pitch = tts.pitch;
    utterance.volume = tts.volume;
    
    if (tts.voice) {
      const voice = voices.find(v => v.voiceURI === tts.voice);
      if (voice) {
        utterance.voice = voice;
      }
    }

    speechSynthesis.speak(utterance);
  };

  return (
    <div className="space-y-1 w-full max-w-full">
      <div className="px-4 py-2 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-gray-300">Playback / TTS</h3>
      </div>

      <SettingRow
        label="Speed"
        description="Adjust the speech playback speed"
      >
        <AccessibleSlider
          value={tts.speed}
          onChange={(value) => updateConfig({ tts: { speed: value } })}
          min={0.25}
          max={4}
          step={0.05}
          presets={speedPresets}
          formatValue={(v) => `${v}x`}
          onTest={testSpeed}
        />
      </SettingRow>

      <SettingRow
        label="Pitch"
        description="Adjust the pitch of the voice"
      >
        <AccessibleSlider
          value={tts.pitch}
          onChange={(value) => updateConfig({ tts: { pitch: value } })}
          min={0.5}
          max={2}
          step={0.1}
          formatValue={(v) => `${v}x`}
        />
      </SettingRow>

      <SettingRow
        label="Volume"
        description="Adjust the volume level"
      >
        <AccessibleSlider
          value={tts.volume}
          onChange={(value) => updateConfig({ tts: { volume: value } })}
          min={0}
          max={1}
          step={0.05}
          formatValue={(v) => `${Math.round(v * 100)}%`}
        />
      </SettingRow>

      <SettingRow
        label="Voice"
        description="Choose a voice for text-to-speech"
      >
        <Select
          value={tts.voice || 'default'}
          onValueChange={(value) => updateConfig({ tts: { voice: value === 'default' ? null : value } })}
        >
          <SelectTrigger className="w-[180px] max-w-[180px] bg-gray-800 border-gray-600">
            <SelectValue>
              {tts.voice
                ? voices.find(v => v.voiceURI === tts.voice)?.name || 'Custom'
                : 'Default System Voice'
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-600">
            <SelectItem value="default" className="text-white hover:bg-gray-700">
              Default System Voice
            </SelectItem>
            {voices.map((voice) => (
              <SelectItem
                key={voice.voiceURI}
                value={voice.voiceURI}
                className="text-white hover:bg-gray-700"
              >
                {voice.name} ({voice.lang})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>

      <SettingRow
        label="Auto agent response read aloud"
        description="Automatically read AI responses aloud when they appear"
      >
        <Switch
          checked={tts.autoReadAloud}
          onCheckedChange={(checked) => updateConfig({ tts: { autoReadAloud: checked } })}
        />
      </SettingRow>

      <SettingRow
        label="Turn off TTS on Hands Up"
        description="Automatically stop TTS when voice input is activated"
      >
        <Switch
          checked={tts.stopOnHandsUp}
          onCheckedChange={(checked) => updateConfig({ tts: { stopOnHandsUp: checked } })}
        />
      </SettingRow>
    </div>
  );
};
