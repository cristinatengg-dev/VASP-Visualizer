import React, { useState } from 'react';
import ChatPanel from './components/ChatPanel';
import CanvasPanel from './components/CanvasPanel';
import { ModelingIntent } from './types/modeling';

const ModelingAgent: React.FC = () => {
  const [intent, setIntent] = useState<ModelingIntent | null>(null);

  return (
    <div className="flex min-h-screen w-full bg-gray-50 p-6 gap-6 overflow-hidden">
      <div className="w-[400px] flex flex-col rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#0A1128]"></span>
            <h2 className="text-sm font-semibold text-[#0A1128]">MODELING AGENT</h2>
          </div>
          <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-widest bg-gray-50 border border-gray-200 px-2 py-1 rounded-[16px]">MVP v1.0</span>
        </div>

        <div className="flex-1 overflow-hidden">
          <ChatPanel onIntentChange={setIntent} currentIntent={intent} />
        </div>
      </div>

      <div className="flex-1 relative rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5 overflow-hidden">
        <CanvasPanel intent={intent} />
      </div>
    </div>
  );
};

export default ModelingAgent;
