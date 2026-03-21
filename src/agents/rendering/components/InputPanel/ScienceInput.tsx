/**
 * ScienceInput.tsx — Section A: Scientific Content Input
 * PDF upload / abstract paste / manual topic entry
 */

import React, { useRef } from 'react';
import { FileText, AlignLeft, PenLine, Upload, X } from 'lucide-react';

interface ScienceInputProps {
  abstractText: string;
  onAbstractChange: (text: string) => void;
  pdfFile: File | null;
  onPdfChange: (file: File | null) => void;
}

const ScienceInput: React.FC<ScienceInputProps> = ({
  abstractText,
  onAbstractChange,
  pdfFile,
  onPdfChange,
}) => {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = React.useState<'pdf' | 'abstract' | 'manual'>('abstract');

  const handlePdfDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      onPdfChange(file);
      setActiveTab('pdf');
    }
  };

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onPdfChange(file);
      setActiveTab('pdf');
    }
  };

  const tabs = [
    { id: 'abstract' as const, label: 'Paste Abstract', icon: <AlignLeft size={13} strokeWidth={2} /> },
    { id: 'pdf' as const, label: 'Upload PDF', icon: <FileText size={13} strokeWidth={2} /> },
    { id: 'manual' as const, label: 'Manual Input', icon: <PenLine size={13} strokeWidth={2} /> },
  ];

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">
          A · Science Content
        </p>
        <p className="text-xs text-gray-500">
          Provide your research content — the agent will extract entities automatically.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-gray-50 rounded-[16px] border border-gray-100">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex-1 flex items-center justify-center gap-1.5
              px-3 py-2 rounded-[12px]
              text-[11px] font-semibold
              transition-all duration-150
              ${activeTab === tab.id
                ? 'bg-white text-[#0A1128] shadow-[0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-black/5'
                : 'text-gray-500 hover:text-gray-700'
              }
            `}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'abstract' && (
        <div className="space-y-2">
          <textarea
            value={abstractText}
            onChange={(e) => onAbstractChange(e.target.value)}
            placeholder="Paste your paper abstract here...

Example: We report a single-atom Ni catalyst supported on CeO₂ for CO oxidation at room temperature. The active Ni site coordinates with four oxygen atoms forming a square-planar geometry, enabling efficient electron transfer to adsorbed CO molecules..."
            className="
              w-full h-40 p-4 text-xs
              border border-gray-100 rounded-[16px]
              font-mono text-gray-700 placeholder:text-gray-300
              focus:outline-none focus:border-gray-300
              focus:shadow-[0_4px_12px_rgba(0,0,0,0.05)]
              transition-all resize-none leading-relaxed
              bg-white
            "
          />
          <div className="flex justify-between items-center px-1">
            <span className="text-[10px] text-gray-400">
              {abstractText.length} characters
            </span>
            {abstractText.length > 0 && (
              <button
                onClick={() => onAbstractChange('')}
                className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {activeTab === 'pdf' && (
        <div>
          {pdfFile ? (
            <div className="
              flex items-center gap-3 p-4
              bg-emerald-50 border border-emerald-100
              rounded-[16px]
            ">
              <div className="w-10 h-10 rounded-[12px] bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <FileText size={18} className="text-emerald-600" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[#0A1128] truncate">{pdfFile.name}</p>
                <p className="text-[10px] text-emerald-600 mt-0.5">
                  {(pdfFile.size / 1024 / 1024).toFixed(2)} MB · Ready to parse
                </p>
              </div>
              <button
                onClick={() => onPdfChange(null)}
                className="flex-shrink-0 w-7 h-7 rounded-full bg-white flex items-center justify-center hover:bg-gray-100 transition-colors"
              >
                <X size={12} className="text-gray-500" />
              </button>
            </div>
          ) : (
            <div
              onDrop={handlePdfDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => pdfInputRef.current?.click()}
              className="
                flex flex-col items-center justify-center
                h-36 border-2 border-dashed border-gray-200
                rounded-[16px] cursor-pointer
                hover:border-gray-300 hover:bg-gray-50
                transition-all duration-200
                group
              "
            >
              <Upload
                size={24}
                strokeWidth={1.5}
                className="text-gray-300 group-hover:text-gray-400 transition-colors mb-2"
              />
              <p className="text-xs font-semibold text-gray-400 group-hover:text-gray-500">
                Drop PDF here or click to browse
              </p>
              <p className="text-[10px] text-gray-300 mt-1">
                PDF · Max 50 MB
              </p>
            </div>
          )}
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf"
            onChange={handlePdfSelect}
            className="hidden"
          />
        </div>
      )}

      {activeTab === 'manual' && (
        <div className="space-y-3">
          <textarea
            value={abstractText}
            onChange={(e) => onAbstractChange(e.target.value)}
            placeholder="Describe your research topic manually...

Format suggestions:
• Research topic: [your topic]
• Core material/molecule: [e.g., Ni single-atom catalyst]
• Key reaction: [e.g., CO oxidation]
• Scientific significance: [e.g., room-temperature activation]
• Target journal: [e.g., Nature Catalysis]"
            className="
              w-full h-44 p-4 text-xs
              border border-gray-100 rounded-[16px]
              font-mono text-gray-700 placeholder:text-gray-300
              focus:outline-none focus:border-gray-300
              focus:shadow-[0_4px_12px_rgba(0,0,0,0.05)]
              transition-all resize-none leading-relaxed
              bg-white
            "
          />
          <p className="text-[10px] text-gray-400 px-1">
            Tip: The more detail you provide, the more accurate the entity extraction and visual plans will be.
          </p>
        </div>
      )}
    </div>
  );
};

export default ScienceInput;
