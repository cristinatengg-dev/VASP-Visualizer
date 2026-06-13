import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ChatPanel from './components/ChatPanel';
import CanvasPanel from './components/CanvasPanel';
import { ModelingIntent } from './types/modeling';
import { useStore } from '../../store/useStore';
import type { MolecularStructure } from '../../types';

const MODELING_RETURN_KEY = 'sci-agent-modeling-return-v1';

const extractSupercell = (value: string | null) => {
  const match = String(value || '').match(/(\d+)\s*[x×X]\s*(\d+)(?:\s*[x×X]\s*(\d+))?/);
  if (!match) {
    return null;
  }
  return `${match[1]}x${match[2]}x${match[3] || 1}`;
};

const buildStructuredHandoffPrompt = ({
  material,
  mpid,
  modelType,
  supercell,
}: {
  material: string | null;
  mpid: string | null;
  modelType: string | null;
  supercell: string | null;
}) => {
  if (!material) {
    return null;
  }

  const sc = extractSupercell(supercell) || '1x1x1';
  const normalizedModelType = String(modelType || '').toLowerCase();
  if (normalizedModelType === 'slab' || normalizedModelType === 'surface') {
    return `Build a ${material}(001) slab with a ${sc} supercell and 15 A vacuum`;
  }

  return `Build a bulk ${material} crystal${mpid ? ` using Materials Project entry ${mpid}` : ''} with a ${sc} supercell`;
};

const cloneReturnStructure = (structure: MolecularStructure | null): MolecularStructure | null => {
  if (!structure) return null;
  return {
    id: String(structure.id || `modeling-return-${Date.now()}`),
    filename: String(structure.filename || 'modeling-edited-structure.vasp'),
    atoms: (structure.atoms || []).map((atom, index) => ({
      id: String(atom.id || `atom-${index}`),
      element: String(atom.element || 'C'),
      position: {
        x: Number(atom.position?.x || 0),
        y: Number(atom.position?.y || 0),
        z: Number(atom.position?.z || 0),
      },
      radius: Number(atom.radius || 1),
      color: String(atom.color || '#9CA3AF'),
      renderStyle: atom.renderStyle,
    })),
    bonds: (structure.bonds || []).map((bond, index) => ({
      id: String(bond.id || `bond-${index}`),
      atom1Id: String(bond.atom1Id),
      atom2Id: String(bond.atom2Id),
      length: Number(bond.length || 0),
      type: bond.type || 'single',
      order: Number(bond.order || 1),
    })),
    boundingBox: structure.boundingBox,
    latticeVectors: Array.isArray(structure.latticeVectors)
      ? structure.latticeVectors.map((row) => row.map((value) => Number(value)))
      : undefined,
  };
};

const ModelingAgent: React.FC = () => {
  const navigate = useNavigate();
  const [intent, setIntent] = useState<ModelingIntent | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const molecularData = useStore(state => state.molecularData);

  // Handle handoff from Idea Agent
  // Supports: ?prompt=... (full handoff_prompt) OR legacy ?material=...&source=...
  const handoffPrompt = searchParams.get('prompt');
  const handoffMaterial = searchParams.get('material');
  const handoffMpid = searchParams.get('mpid');
  const handoffModelType = searchParams.get('model_type');
  const handoffSupercell = searchParams.get('supercell');

  const [handoffSeed] = useState(() => ({
    prompt: buildStructuredHandoffPrompt({
      material: handoffMaterial,
      mpid: handoffMpid,
      modelType: handoffModelType,
      supercell: handoffSupercell,
    }) || handoffPrompt || null,
    autoSubmit: searchParams.get('auto') === '1' || searchParams.get('run') === '1',
  }));
  const [workflowReturnActive] = useState(() => searchParams.get('return') === 'agent-workflow');

  const handleConfirmWorkflowModel = () => {
    const structure = cloneReturnStructure(molecularData);
    if (!structure) return;
    window.sessionStorage.setItem(MODELING_RETURN_KEY, JSON.stringify({
      savedAt: Date.now(),
      structure,
    }));
    navigate('/workspace?resume=modeling');
  };

  // Clear handoff params from URL after reading them once
  useEffect(() => {
    if (handoffPrompt || handoffMaterial || workflowReturnActive) {
      setSearchParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen w-full bg-[#F5F5F0] p-6 gap-6 overflow-hidden">
      <div className="w-[400px] flex flex-col rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#0A1128]"></span>
            <h2 className="text-sm font-semibold text-[#0A1128]">MODELING AGENT</h2>
          </div>
          <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-widest bg-gray-50 border border-gray-200 px-2 py-1 rounded-[16px]">MVP v1.0</span>
        </div>

        <div className="flex-1 overflow-hidden">
          <ChatPanel
            onIntentChange={setIntent}
            currentIntent={intent}
            prefillPrompt={handoffSeed.prompt}
            autoSubmitPrefill={handoffSeed.autoSubmit}
          />
        </div>
      </div>

      <div className="flex-1 h-full relative rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5 overflow-hidden">
        <CanvasPanel
          intent={intent}
          workflowReturnActive={workflowReturnActive}
          onConfirmWorkflow={handleConfirmWorkflowModel}
        />
      </div>
    </div>
  );
};

export default ModelingAgent;
