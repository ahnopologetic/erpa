import React from 'react';
import { Slider } from '~components/ui/slider';
import { Button } from '~components/ui/button';
import { Play } from 'lucide-react';

interface AccessibleSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  presets?: number[];
  label?: string;
  formatValue?: (value: number) => string;
  onTest?: () => void;
}

export const AccessibleSlider: React.FC<AccessibleSliderProps> = ({
  value,
  onChange,
  min = 0,
  max = 4,
  step = 0.05,
  presets = [],
  label,
  formatValue = (v) => v.toFixed(2),
  onTest
}) => {
  const handlePresetClick = (presetValue: number) => {
    onChange(presetValue);
  };

  return (
    <div className="flex items-start gap-2 sm:gap-4 w-full max-w-full flex-col sm:flex-row">
      <div className="flex-1 min-w-0 w-full">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-200">{label}</label>
          <div className="text-lg font-semibold text-white">
            {formatValue(value)}
          </div>
        </div>
        <Slider
          value={[value]}
          onValueChange={([newValue]) => onChange(newValue)}
          min={min}
          max={max}
          step={step}
          className="w-full"
        />
        {presets.length > 0 && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {presets.map((preset) => (
              <button
                key={preset}
                onClick={() => handlePresetClick(preset)}
                className={`
                  px-2 py-0.5 text-xs rounded transition-colors whitespace-nowrap
                  ${value === preset
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }
                `}
                aria-label={`Set to ${preset}`}
              >
                {formatValue(preset)}
              </button>
            ))}
          </div>
        )}
      </div>
      {onTest && (
        <Button
          size="sm"
          variant="outline"
          onClick={onTest}
          className="shrink-0 self-start"
          aria-label="Test speed"
        >
          <Play className="w-4 h-4 mr-1" />
          Test
        </Button>
      )}
    </div>
  );
};
