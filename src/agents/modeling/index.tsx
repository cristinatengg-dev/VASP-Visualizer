import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ChatPanel from './components/ChatPanel';
import CanvasPanel from './components/CanvasPanel';
import { ModelingIntent } from './types/modeling';

const ModelingAgent: React.FC = () => {
  const [intent, setIntent] = useState<ModelingIntent | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle handoff from Idea Agent
  // Supports: ?prompt=... (full handoff_prompt) OR legacy ?material=...&source=...
  const handoffPrompt = searchParams.get('prompt');
  const handoffMaterial = searchParams.get('material');
  const handoffMpid = searchParams.get('mpid');
  const handoffPhase = searchParams.get('phase');

  const prefillPrompt = handoffPrompt
    || (handoffMaterial
      ? `Build a bulk ${handoffMaterial} crystal${handoffPhase ? ` (${handoffPhase})` : ''}${handoffMpid ? ` using Materials Project entry ${handoffMpid}` : ''}`
      : null);

  // Clear handoff params from URL after reading them once
  useEffect(() => {
    if (handoffPrompt || handoffMaterial) {
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
          <ChatPanel onIntentChange={setIntent} currentIntent={intent} prefillPrompt={prefillPrompt} />
        </div>
      </div>

      <div className="flex-1 h-full relative rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5 overflow-hidden">
        <CanvasPanel intent={intent} />
      </div>
    </div>
  );
};

export default ModelingAgent;
