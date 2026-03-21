/**
 * PlanCards/index.tsx — Phase 3: Three Visual Plan Cards
 *
 * Card A: Structural Realism
 * Card B: Mechanism Metaphor
 * Card C: Macro Narrative
 *
 * Each card shows: name, tagline, colors, focus, composition, scale, risk warning
 */

import React from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  AlertTriangle,
  Layers,
  Zap,
  Globe,
  ArrowRight,
  Image,
} from 'lucide-react';
import { PlanCard } from '../../types';

interface PlanCardsProps {
  plans: PlanCard[];
  selectedPlanId: string | null;
  onSelectPlan: (id: string) => void;
}

// Icon per plan type
const PLAN_ICONS = {
  'structural-realism': <Layers size={18} strokeWidth={1.5} />,
  'mechanism-metaphor': <Zap size={18} strokeWidth={1.5} />,
  'macro-narrative': <Globe size={18} strokeWidth={1.5} />,
};

const PLAN_LABELS = {
  'structural-realism': 'A',
  'mechanism-metaphor': 'B',
  'macro-narrative': 'C',
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: 'easeOut' as const },
  },
};

const PlanCardItem: React.FC<{
  plan: PlanCard;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ plan, isSelected, onSelect }) => {
  const planLabel = PLAN_LABELS[plan.type];
  const planIcon = PLAN_ICONS[plan.type];

  return (
    <motion.div variants={cardVariants}>
      <button
        onClick={onSelect}
        className={`
          group w-full text-left
          border rounded-[20px] overflow-hidden
          transition-all duration-250
          ${isSelected
            ? 'border-[#0A1128] shadow-[0_6px_24px_rgba(10,17,40,0.15)] ring-1 ring-[#0A1128]/10'
            : 'border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] hover:border-gray-200 hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)]'
          }
          bg-white
        `}
      >
        {/* Color gradient preview strip */}
        <div
          className="h-24 w-full relative flex items-center justify-center overflow-hidden"
          style={{ background: plan.previewGradient }}
        >
          {/* Plan letter badge */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5">
            <span className="
              px-2 py-0.5 rounded-[8px]
              text-[9px] font-mono font-bold tracking-widest uppercase
              bg-white/20 text-white border border-white/30
            ">
              PLAN {planLabel}
            </span>
          </div>

          {/* Selected indicator */}
          {isSelected && (
            <div className="absolute top-3 right-3">
              <CheckCircle2 size={18} className="text-white drop-shadow" strokeWidth={2} />
            </div>
          )}

          {/* Icon */}
          <div className="text-white/60 group-hover:text-white/80 transition-colors">
            {React.cloneElement(planIcon as React.ReactElement, { size: 32, strokeWidth: 1 })}
          </div>

          {/* Color dots */}
          <div className="absolute bottom-3 right-3 flex gap-1">
            {plan.primaryColors.slice(0, 4).map((color, i) => (
              <span
                key={i}
                className="w-3 h-3 rounded-full border border-white/30 shadow-sm"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        {/* Card body */}
        <div className="p-4 space-y-3">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#0A1128]">{plan.name}</h3>
              <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{plan.tagline}</p>
            </div>
            <ArrowRight
              size={14}
              strokeWidth={2}
              className={`
                flex-shrink-0 mt-0.5 transition-all duration-200
                ${isSelected
                  ? 'text-[#0A1128] translate-x-0.5'
                  : 'text-gray-300 group-hover:text-gray-400 group-hover:translate-x-0.5'
                }
              `}
            />
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { label: 'Visual Focus', value: plan.focalObject },
              { label: 'Composition', value: plan.compositionType },
              { label: 'Scale Level', value: plan.scaleLevel },
              { label: 'Background', value: plan.background },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="px-2 py-1.5 bg-gray-50 rounded-[10px] border border-gray-50"
              >
                <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                  {label}
                </p>
                <p className="text-[10px] text-gray-600 leading-snug line-clamp-2">
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* Visual metaphor */}
          <div className="px-3 py-2 bg-gray-50/80 rounded-[12px] border border-gray-100/80">
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
              Visual Metaphor
            </p>
            <p className="text-[10px] text-gray-600 italic leading-relaxed">
              "{plan.visualMetaphor}"
            </p>
          </div>

          {/* Reference image compatibility */}
          <div className="flex items-center gap-1.5">
            <Image size={10} className={plan.suitableForRefImage ? 'text-emerald-500' : 'text-gray-300'} />
            <span className={`text-[9px] font-semibold ${plan.suitableForRefImage ? 'text-emerald-600' : 'text-gray-400'}`}>
              {plan.suitableForRefImage ? 'Compatible with reference image constraint' : 'Best without reference constraint'}
            </span>
          </div>

          {/* Risk warning */}
          <div className={`
            flex items-start gap-2 px-3 py-2 rounded-[10px]
            ${plan.type === 'structural-realism'
              ? 'bg-blue-50 border border-blue-100'
              : plan.type === 'mechanism-metaphor'
                ? 'bg-amber-50 border border-amber-100'
                : 'bg-purple-50 border border-purple-100'
            }
          `}>
            <AlertTriangle
              size={10}
              strokeWidth={2}
              className={`
                flex-shrink-0 mt-0.5
                ${plan.type === 'structural-realism' ? 'text-blue-400' :
                  plan.type === 'mechanism-metaphor' ? 'text-amber-400' : 'text-purple-400'}
              `}
            />
            <p className={`
              text-[9px] leading-relaxed
              ${plan.type === 'structural-realism' ? 'text-blue-600' :
                plan.type === 'mechanism-metaphor' ? 'text-amber-600' : 'text-purple-600'}
            `}>
              {plan.riskWarning}
            </p>
          </div>

          {/* Model recommendation */}
          <div className="flex items-center justify-between pt-1 border-t border-gray-50">
            <span className="text-[9px] text-gray-400 font-mono">Pipeline:</span>
            <span className="text-[9px] font-mono font-semibold text-gray-600">
              {plan.recommendedModel}
            </span>
          </div>

          {/* Select button state */}
          <div className={`
            w-full py-2 rounded-[12px] text-center
            text-[10px] font-bold transition-colors duration-150
            ${isSelected
              ? 'bg-[#0A1128] text-white'
              : 'bg-gray-50 text-gray-500 group-hover:bg-gray-100 border border-gray-100'
            }
          `}>
            {isSelected ? '✓ Selected — Proceed to Prompt Review' : 'Select This Plan'}
          </div>
        </div>
      </button>
    </motion.div>
  );
};

const PlanCards: React.FC<PlanCardsProps> = ({ plans, selectedPlanId, onSelectPlan }) => {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
          Phase 3 · Visual Plan Selection
        </p>
        <h2 className="text-lg font-black text-[#0A1128] leading-tight">
          Choose Your Visual Direction
        </h2>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          Three concept directions have been generated based on your research.
          Select one to proceed to prompt compilation.
        </p>
      </div>

      {/* Cards */}
      <motion.div
        className="grid grid-cols-1 gap-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {plans.map((plan) => (
          <PlanCardItem
            key={plan.id}
            plan={plan}
            isSelected={selectedPlanId === plan.id}
            onSelect={() => onSelectPlan(plan.id)}
          />
        ))}
      </motion.div>

      {/* Note */}
      <p className="text-[10px] text-gray-400 text-center">
        Plans A–C are templates — the final prompt is always compiled from your actual science data.
      </p>
    </div>
  );
};

export default PlanCards;
