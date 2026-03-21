/**
 * AdvancedSwitches.tsx — Section E: Advanced Switches
 * 5 precision toggles for power users
 */

import React from 'react';
import { AdvancedSwitches as AdvancedSwitchesType } from '../../types';
import { FlaskConical, Target, Paintbrush, Image, BookOpen } from 'lucide-react';

interface AdvancedSwitchesProps {
  switches: AdvancedSwitchesType;
  onChange: (switches: AdvancedSwitchesType) => void;
}

const SWITCH_CONFIG = [
  {
    key: 'strictChemicalStructure' as const,
    icon: <FlaskConical size={14} strokeWidth={1.5} />,
    label: 'Strict Chemical Structure Mode',
    description: 'Enforces maximum molecular accuracy — all atoms, bonds, and geometry must be chemically valid. Rejected images with structural errors.',
    badge: 'SCIENCE FIRST',
    badgeColor: 'bg-blue-50 text-blue-600 border-blue-100',
  },
  {
    key: 'prioritizeAccuracy' as const,
    icon: <Target size={14} strokeWidth={1.5} />,
    label: 'Prioritize Structural Accuracy',
    description: 'When conflicts arise between visual appeal and scientific correctness, always choose accuracy. Overrides artistic style requests if they compromise chemistry.',
    badge: 'ACCURACY',
    badgeColor: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  },
  {
    key: 'prioritizeArt' as const,
    icon: <Paintbrush size={14} strokeWidth={1.5} />,
    label: 'Prioritize Artistic Expression',
    description: 'Allow greater freedom in visual interpretation. Structural metaphors are acceptable over strict chemical accuracy. Ideal for top journal "wow factor" submissions.',
    badge: 'ART FIRST',
    badgeColor: 'bg-purple-50 text-purple-600 border-purple-100',
  },
  {
    key: 'useReferenceConstraint' as const,
    icon: <Image size={14} strokeWidth={1.5} />,
    label: 'Apply Reference Image Constraint',
    description: 'Use uploaded reference images as strong compositional and style constraints during generation. Requires at least one reference image in Section B.',
    badge: 'REF GUIDED',
    badgeColor: 'bg-orange-50 text-orange-600 border-orange-100',
  },
  {
    key: 'publishExportMode' as const,
    icon: <BookOpen size={14} strokeWidth={1.5} />,
    label: 'Enable Publication Export Mode',
    description: 'After generation, automatically process the final image: write 600 DPI print metadata, export TIFF and high-quality JPEG, embed ICC color profile.',
    badge: 'EXPORT',
    badgeColor: 'bg-gray-50 text-gray-600 border-gray-200',
  },
];

const AdvancedSwitches: React.FC<AdvancedSwitchesProps> = ({ switches, onChange }) => {
  const toggle = (key: keyof AdvancedSwitchesType) => {
    // Mutually exclusive: accuracy vs art
    if (key === 'prioritizeAccuracy' && !switches.prioritizeAccuracy) {
      onChange({ ...switches, prioritizeAccuracy: true, prioritizeArt: false });
      return;
    }
    if (key === 'prioritizeArt' && !switches.prioritizeArt) {
      onChange({ ...switches, prioritizeArt: true, prioritizeAccuracy: false });
      return;
    }
    onChange({ ...switches, [key]: !switches[key] });
  };

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">
          E · Advanced Switches
        </p>
        <p className="text-xs text-gray-500">
          Precision controls for expert users. Affects how the Rule Engine resolves conflicts.
        </p>
      </div>

      {/* Switches */}
      <div className="space-y-2">
        {SWITCH_CONFIG.map(({ key, icon, label, description, badge, badgeColor }) => {
          const isOn = switches[key];
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={`
                w-full flex items-start gap-3 p-4 text-left
                border rounded-[16px]
                transition-all duration-200
                ${isOn
                  ? 'border-[#0A1128] bg-[#0A1128]/[0.03] shadow-[0_2px_8px_rgba(10,17,40,0.06)]'
                  : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
                }
              `}
            >
              {/* Toggle visual */}
              <div className={`
                flex-shrink-0 mt-0.5
                w-8 h-4.5 rounded-full relative
                transition-colors duration-200
                ${isOn ? 'bg-[#0A1128]' : 'bg-gray-200'}
              `}
                style={{ height: '18px', width: '32px' }}
              >
                <div className={`
                  absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm
                  transition-transform duration-200
                  ${isOn ? 'translate-x-[14px]' : 'translate-x-0.5'}
                `} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`${isOn ? 'text-[#0A1128]' : 'text-gray-500'}`}>
                    {icon}
                  </span>
                  <span className={`text-xs font-bold ${isOn ? 'text-[#0A1128]' : 'text-gray-600'}`}>
                    {label}
                  </span>
                  <span className={`
                    text-[8px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5
                    rounded-[6px] border ${badgeColor}
                  `}>
                    {badge}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                  {description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Conflict note */}
      {switches.prioritizeAccuracy && switches.prioritizeArt && (
        <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-[16px]">
          <p className="text-[10px] text-red-600 font-semibold">
            ⚠️ Conflict: "Prioritize Accuracy" and "Prioritize Art" are mutually exclusive.
            Please choose one.
          </p>
        </div>
      )}

      {switches.useReferenceConstraint && (
        <div className="px-4 py-3 bg-orange-50 border border-orange-100 rounded-[16px]">
          <p className="text-[10px] text-orange-600 leading-relaxed">
            📌 Reference constraint is active. Make sure to upload at least one reference image in Section B.
          </p>
        </div>
      )}
    </div>
  );
};

export default AdvancedSwitches;
