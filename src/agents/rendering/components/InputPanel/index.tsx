/**
 * InputPanel/index.tsx — Five-Section Input Panel Container
 *
 * Sections:
 *   A. Science Content (ScienceInput)
 *   B. Visual Reference (VisualReferenceInput)
 *   C. Output Parameters (OutputParamsInput)
 *   D. Style Preferences (StylePreferenceInput)
 *   E. Advanced Switches (AdvancedSwitches)
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import ScienceInput from './ScienceInput';
import VisualReferenceInput from './VisualReferenceInput';
import OutputParamsInput from './OutputParamsInput';
import StylePreferenceInput from './StylePreferenceInput';
import AdvancedSwitchesSection from './AdvancedSwitches';
import {
  StylePreferences,
  AdvancedSwitches,
  OutputParams,
} from '../../types';

interface InputPanelProps {
  // Science
  abstractText: string;
  onAbstractChange: (text: string) => void;
  pdfFile: File | null;
  onPdfChange: (file: File | null) => void;
  // Visual reference
  referenceImages: File[];
  onReferenceImagesChange: (files: File[]) => void;
  structureBaseImage: File | null;
  onStructureBaseImageChange: (file: File | null) => void;
  // Output
  outputParams: OutputParams;
  onOutputParamsChange: (params: OutputParams) => void;
  // Style
  stylePreferences: StylePreferences;
  onStylePreferencesChange: (prefs: StylePreferences) => void;
  additionalInstructions: string;
  onAdditionalInstructionsChange: (text: string) => void;
  // Advanced
  advancedSwitches: AdvancedSwitches;
  onAdvancedSwitchesChange: (switches: AdvancedSwitches) => void;
  // Action
  onGenerate: () => void;
  isGenerating: boolean;
  canGenerate: boolean;
}

interface SectionProps {
  id: string;
  label: string;
  sublabel: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: string;
  badgeColor?: string;
}

const Section: React.FC<SectionProps> = ({
  id,
  label,
  sublabel,
  isOpen,
  onToggle,
  children,
  badge,
  badgeColor = 'bg-gray-100 text-gray-500',
}) => (
  <div className="border border-gray-100 rounded-[20px] overflow-hidden bg-white">
    <button
      onClick={onToggle}
      className="
        w-full flex items-center gap-3 px-5 py-4 text-left
        hover:bg-gray-50 transition-colors duration-150
      "
    >
      {/* Section indicator */}
      <div className={`
        flex-shrink-0 w-6 h-6 rounded-full
        flex items-center justify-center
        text-[9px] font-bold font-mono
        ${isOpen ? 'bg-[#0A1128] text-white' : 'bg-gray-100 text-gray-500'}
        transition-colors duration-200
      `}>
        {id}
      </div>
      {/* Labels */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${isOpen ? 'text-[#0A1128]' : 'text-gray-600'}`}>
            {label}
          </span>
          {badge && (
            <span className={`text-[8px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-[6px] ${badgeColor}`}>
              {badge}
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-400">{sublabel}</span>
      </div>
      {/* Chevron */}
      <div className="flex-shrink-0 text-gray-300">
        {isOpen
          ? <ChevronDown size={14} strokeWidth={2} />
          : <ChevronRight size={14} strokeWidth={2} />
        }
      </div>
    </button>

    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
        >
          <div className="px-5 pb-5 pt-1 border-t border-gray-50">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

const InputPanel: React.FC<InputPanelProps> = ({
  abstractText,
  onAbstractChange,
  pdfFile,
  onPdfChange,
  referenceImages,
  onReferenceImagesChange,
  structureBaseImage,
  onStructureBaseImageChange,
  outputParams,
  onOutputParamsChange,
  stylePreferences,
  onStylePreferencesChange,
  additionalInstructions,
  onAdditionalInstructionsChange,
  advancedSwitches,
  onAdvancedSwitchesChange,
  onGenerate,
  isGenerating,
  canGenerate,
}) => {
  const [openSection, setOpenSection] = useState<string>('A');

  const toggle = (id: string) => {
    setOpenSection((prev) => (prev === id ? '' : id));
  };

  const sections = [
    { id: 'A', label: 'Science Content', sublabel: 'PDF · Abstract · Manual description' },
    { id: 'B', label: 'Visual Reference', sublabel: 'Reference images · Structure base image' },
    { id: 'C', label: 'Output Parameters', sublabel: 'Journal · Dimensions · Export quality' },
    { id: 'D', label: 'Style Preferences', sublabel: 'Mood sliders · Visual tone · Extra instructions' },
    { id: 'E', label: 'Advanced Switches', sublabel: 'Chemical accuracy · Artistic mode · Export pipeline', badge: 'EXPERT', badgeColor: 'bg-gray-100 text-gray-500 border border-gray-200' },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Section A */}
      <Section
        id="A"
        label={sections[0].label}
        sublabel={sections[0].sublabel}
        isOpen={openSection === 'A'}
        onToggle={() => toggle('A')}
      >
        <ScienceInput
          abstractText={abstractText}
          onAbstractChange={onAbstractChange}
          pdfFile={pdfFile}
          onPdfChange={onPdfChange}
        />
      </Section>

      {/* Section B */}
      <Section
        id="B"
        label={sections[1].label}
        sublabel={sections[1].sublabel}
        isOpen={openSection === 'B'}
        onToggle={() => toggle('B')}
      >
        <VisualReferenceInput
          referenceImages={referenceImages}
          onReferenceImagesChange={onReferenceImagesChange}
          structureBaseImage={structureBaseImage}
          onStructureBaseImageChange={onStructureBaseImageChange}
        />
      </Section>

      {/* Section C */}
      <Section
        id="C"
        label={sections[2].label}
        sublabel={sections[2].sublabel}
        isOpen={openSection === 'C'}
        onToggle={() => toggle('C')}
      >
        <OutputParamsInput
          outputParams={outputParams}
          onChange={onOutputParamsChange}
        />
      </Section>

      {/* Section D */}
      <Section
        id="D"
        label={sections[3].label}
        sublabel={sections[3].sublabel}
        isOpen={openSection === 'D'}
        onToggle={() => toggle('D')}
      >
        <StylePreferenceInput
          stylePreferences={stylePreferences}
          onChange={onStylePreferencesChange}
          additionalInstructions={additionalInstructions}
          onAdditionalInstructionsChange={onAdditionalInstructionsChange}
        />
      </Section>

      {/* Section E */}
      <Section
        id="E"
        label={sections[4].label}
        sublabel={sections[4].sublabel}
        isOpen={openSection === 'E'}
        onToggle={() => toggle('E')}
        badge={sections[4].badge}
        badgeColor={sections[4].badgeColor}
      >
        <AdvancedSwitchesSection
          switches={advancedSwitches}
          onChange={onAdvancedSwitchesChange}
        />
      </Section>

      {/* Generate Button */}
      <button
        onClick={onGenerate}
        disabled={!canGenerate || isGenerating}
        className={`
          w-full flex items-center justify-center gap-2.5
          px-6 py-4
          rounded-[24px]
          text-sm font-bold
          transition-all duration-200
          ${canGenerate && !isGenerating
            ? 'bg-[#0A1128] text-white shadow-[0_4px_20px_rgba(10,17,40,0.25)] hover:bg-[#162044] hover:-translate-y-0.5 active:translate-y-0'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }
        `}
      >
        {isGenerating ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Analyzing & Generating Plans...
          </>
        ) : (
          <>
            <Sparkles size={14} strokeWidth={2} />
            Analyze & Generate Visual Plans
          </>
        )}
      </button>

      {!canGenerate && !isGenerating && (
        <p className="text-[10px] text-gray-400 text-center -mt-1">
          Add scientific content in Section A to get started
        </p>
      )}
    </div>
  );
};

export default InputPanel;
