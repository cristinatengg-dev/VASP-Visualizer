/**
 * OutputParamsInput.tsx — Section C: Output Parameters Input
 * Width, height, aspect ratio, journal preset, HD, watermark zone
 */

import React from 'react';
import { Settings2, CheckSquare, Square } from 'lucide-react';
import { OutputParams, JournalPreset, AspectRatio } from '../../types';
import { JOURNAL_PRESETS, ASPECT_RATIO_CONFIGS } from '../../constants';

interface OutputParamsInputProps {
  outputParams: OutputParams;
  onChange: (params: OutputParams) => void;
}

const JOURNALS: JournalPreset[] = [
  'Nature', 'Nature Catalysis', 'Nature Materials',
  'JACS', 'Angewandte Chemie', 'ACS Catalysis', 'Advanced Materials', 'Custom',
];

const ASPECT_RATIOS: AspectRatio[] = ['1:1', '3:4', '4:3', '2:3', '3:2', 'Custom'];

const OutputParamsInput: React.FC<OutputParamsInputProps> = ({ outputParams, onChange }) => {
  const journalConfig = JOURNAL_PRESETS[outputParams.journal];

  const handleJournalChange = (journal: JournalPreset) => {
    const config = JOURNAL_PRESETS[journal];
    onChange({
      ...outputParams,
      journal,
      aspectRatio: config.aspectRatio,
      customWidth: config.widthPx,
      customHeight: config.heightPx,
    });
  };

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">
          C · Output Parameters
        </p>
        <p className="text-xs text-gray-500">
          Set target journal, output dimensions, and export quality mode.
        </p>
      </div>

      {/* Journal Preset */}
      <div className="space-y-2">
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
          <Settings2 size={11} className="text-gray-400" />
          Target Journal
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {JOURNALS.map((journal) => {
            const config = JOURNAL_PRESETS[journal];
            const isSelected = outputParams.journal === journal;
            return (
              <button
                key={journal}
                onClick={() => handleJournalChange(journal)}
                className={`
                  flex items-center gap-2 px-3 py-2.5
                  rounded-[12px] text-left
                  border transition-all duration-150
                  ${isSelected
                    ? 'border-[#0A1128] bg-[#0A1128] text-white shadow-sm'
                    : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200 hover:bg-gray-50'
                  }
                `}
              >
                <span
                  className="flex-shrink-0 w-2 h-2 rounded-full"
                  style={{ backgroundColor: isSelected ? 'white' : config.color }}
                />
                <span className="text-[11px] font-semibold truncate">{config.displayName}</span>
              </button>
            );
          })}
        </div>
        {/* Journal info */}
        <div className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-[12px]">
          <p className="text-[10px] text-gray-500 leading-relaxed">
            <span className="font-semibold text-gray-700">{journalConfig.displayName}:</span>{' '}
            {journalConfig.description} · Default: {journalConfig.widthPx} × {journalConfig.heightPx} px
          </p>
        </div>
      </div>

      {/* Aspect Ratio */}
      <div className="space-y-2">
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
          Aspect Ratio
        </label>
        <div className="flex flex-wrap gap-1.5">
          {ASPECT_RATIOS.map((ratio) => {
            const config = ASPECT_RATIO_CONFIGS[ratio];
            return (
              <button
                key={ratio}
                onClick={() => onChange({ ...outputParams, aspectRatio: ratio })}
                className={`
                  px-3 py-1.5 rounded-[32px] text-[11px] font-semibold
                  border transition-all duration-150
                  ${outputParams.aspectRatio === ratio
                    ? 'border-[#0A1128] bg-[#0A1128] text-white'
                    : 'border-gray-100 text-gray-600 hover:border-gray-200 hover:bg-gray-50'
                  }
                `}
              >
                {config.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom dimensions (show only if Custom is selected) */}
      {outputParams.aspectRatio === 'Custom' && (
        <div className="space-y-2">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            Custom Dimensions (px)
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="text-[9px] text-gray-400 mb-1 block">Width</label>
              <input
                type="number"
                value={outputParams.customWidth}
                onChange={(e) => onChange({ ...outputParams, customWidth: parseInt(e.target.value) || 4800 })}
                className="
                  w-full px-3 py-2 text-xs font-mono
                  border border-gray-100 rounded-[12px]
                  focus:outline-none focus:border-gray-300
                  text-gray-700
                "
                min={512}
                max={8192}
                step={100}
              />
            </div>
            <span className="text-gray-300 mt-4">×</span>
            <div className="flex-1">
              <label className="text-[9px] text-gray-400 mb-1 block">Height</label>
              <input
                type="number"
                value={outputParams.customHeight}
                onChange={(e) => onChange({ ...outputParams, customHeight: parseInt(e.target.value) || 6400 })}
                className="
                  w-full px-3 py-2 text-xs font-mono
                  border border-gray-100 rounded-[12px]
                  focus:outline-none focus:border-gray-300
                  text-gray-700
                "
                min={512}
                max={8192}
                step={100}
              />
            </div>
          </div>
        </div>
      )}

      {/* Toggles */}
      <div className="space-y-2">
        {[
          {
            key: 'ultraHD' as const,
            label: 'Ultra HD Output',
            desc: 'Maximum pixel density — Seedream will generate at highest resolution',
          },
          {
            key: 'watermarkReserve' as const,
            label: 'Reserve Watermark Zone',
            desc: 'Keep bottom-right corner (15% × 8%) empty white for journal logo',
          },
        ].map(({ key, label, desc }) => (
          <button
            key={key}
            onClick={() => onChange({ ...outputParams, [key]: !outputParams[key] })}
            className="
              w-full flex items-start gap-3 px-4 py-3
              border border-gray-100 rounded-[16px]
              hover:bg-gray-50 transition-all duration-150 text-left
              bg-white
            "
          >
            <div className="flex-shrink-0 mt-0.5">
              {outputParams[key] ? (
                <CheckSquare size={15} className="text-[#0A1128]" strokeWidth={2} />
              ) : (
                <Square size={15} className="text-gray-300" strokeWidth={1.5} />
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-[#0A1128]">{label}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* DPI Note */}
      <div className="px-4 py-3 bg-amber-50 border border-amber-100 rounded-[16px]">
        <p className="text-[10px] text-amber-700 leading-relaxed">
          <span className="font-bold">📐 About 600 DPI:</span> Pixel dimensions determine print quality.
          The export engine writes 600 DPI print metadata to the final TIFF/JPEG file —
          this is separate from the AI generation step.
        </p>
      </div>
    </div>
  );
};

export default OutputParamsInput;
