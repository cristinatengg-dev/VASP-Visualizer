/**
 * StylePreferenceInput.tsx — Section D: Style Preference Input
 * 6 mood sliders + quick style tag buttons
 */

import React from 'react';
import { StylePreferences } from '../../types';
import { STYLE_MOOD_CONFIG } from '../../constants';

interface StylePreferenceInputProps {
  stylePreferences: StylePreferences;
  onChange: (prefs: StylePreferences) => void;
  additionalInstructions: string;
  onAdditionalInstructionsChange: (text: string) => void;
}

const StyleSlider: React.FC<{
  icon: string;
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
}> = ({ icon, label, description, value, onChange }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-semibold text-[#0A1128]">{label}</span>
      </div>
      <span className="text-[10px] font-mono text-gray-400">{value}</span>
    </div>
    <input
      type="range"
      min={0}
      max={100}
      step={5}
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value))}
      className="
        w-full h-1.5 rounded-full appearance-none cursor-pointer
        bg-gray-100
        [&::-webkit-slider-thumb]:appearance-none
        [&::-webkit-slider-thumb]:w-4
        [&::-webkit-slider-thumb]:h-4
        [&::-webkit-slider-thumb]:rounded-full
        [&::-webkit-slider-thumb]:bg-[#0A1128]
        [&::-webkit-slider-thumb]:shadow-sm
        [&::-webkit-slider-thumb]:cursor-pointer
      "
      style={{
        background: `linear-gradient(to right, #0A1128 ${value}%, #E5E7EB ${value}%)`,
      }}
    />
    <p className="text-[10px] text-gray-400">{description}</p>
  </div>
);

// Quick style presets
const QUICK_PRESETS = [
  { label: 'Nature Cover', values: { cinematic: 80, macro: 40, abstract: 30, realistic: 60, glass: 20, metallic: 10 } },
  { label: 'SEM Aesthetic', values: { cinematic: 20, macro: 90, abstract: 10, realistic: 85, glass: 5, metallic: 30 } },
  { label: 'Energy Drama', values: { cinematic: 90, macro: 20, abstract: 75, realistic: 20, glass: 40, metallic: 20 } },
  { label: 'Crystal Pure', values: { cinematic: 30, macro: 60, abstract: 20, realistic: 70, glass: 90, metallic: 15 } },
  { label: 'Metal Catalyst', values: { cinematic: 50, macro: 70, abstract: 20, realistic: 75, glass: 10, metallic: 85 } },
  { label: 'Cosmic Scale', values: { cinematic: 95, macro: 10, abstract: 80, realistic: 15, glass: 30, metallic: 10 } },
];

const StylePreferenceInput: React.FC<StylePreferenceInputProps> = ({
  stylePreferences,
  onChange,
  additionalInstructions,
  onAdditionalInstructionsChange,
}) => {
  const updatePref = (key: keyof StylePreferences, value: number) => {
    onChange({ ...stylePreferences, [key]: value });
  };

  const applyPreset = (values: StylePreferences) => {
    onChange(values);
  };

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">
          D · Style Preferences
        </p>
        <p className="text-xs text-gray-500">
          Adjust style mood sliders to guide the visual tone of the generated cover.
        </p>
      </div>

      {/* Quick presets */}
      <div className="space-y-2">
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
          Quick Presets
        </label>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset.values as StylePreferences)}
              className="
                px-3 py-1.5 rounded-[32px]
                text-[10px] font-semibold
                border border-gray-100 text-gray-600
                hover:border-gray-300 hover:bg-gray-50
                transition-all duration-150
              "
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Style sliders */}
      <div className="space-y-4">
        {STYLE_MOOD_CONFIG.map((config) => (
          <StyleSlider
            key={config.key}
            icon={config.icon}
            label={config.label}
            description={config.description}
            value={stylePreferences[config.key]}
            onChange={(v) => updatePref(config.key, v)}
          />
        ))}
      </div>

      {/* Additional instructions */}
      <div className="space-y-2">
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
          Additional Visual Instructions
        </label>
        <textarea
          value={additionalInstructions}
          onChange={(e) => onAdditionalInstructionsChange(e.target.value)}
          placeholder={`Optional: add specific visual requests...

Examples:
• "Incorporate liquid metal substrate"
• "Add ocean blue tones throughout"
• "More like a Nature Chemistry cover"
• "Keep the molecular structure but make it more abstract"
• "Reference the glass-like quality of the uploaded image"`}
          className="
            w-full h-28 p-3 text-xs
            border border-gray-100 rounded-[16px]
            font-mono text-gray-700 placeholder:text-gray-300
            focus:outline-none focus:border-gray-300
            focus:shadow-[0_4px_12px_rgba(0,0,0,0.05)]
            transition-all resize-none leading-relaxed
            bg-white
          "
        />
        <p className="text-[10px] text-gray-400 px-1">
          These instructions go through conflict checking before being merged into the final prompt.
        </p>
      </div>
    </div>
  );
};

export default StylePreferenceInput;
