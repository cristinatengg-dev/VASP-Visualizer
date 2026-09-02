import React from 'react';
import { ArrowLeft, ArrowRight, Database, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MATERIAL_EXPLORER_CARDS } from '../data/materialExplorerRegistry';

const libraryLabels: Record<string, { title: string; note: string }> = {
  battery: {
    title: 'Battery Materials Library',
    note: 'Cathodes, anodes, solid electrolytes, and common structure candidates.',
  },
  nuclear: {
    title: 'Nuclear Materials Library',
    note: 'Fuels, cladding, irradiation, and nuclear data-related materials portal.',
  },
  supercapacitor: {
    title: 'Supercapacitor Materials Library',
    note: 'Porous carbon, oxides, MXenes, and pseudocapacitive materials.',
  },
  'hydrogen-storage': {
    title: 'Hydrogen Storage Materials Library',
    note: 'Metal hydrides, alloys, MOFs, and adsorbent materials.',
  },
  'thermal-storage': {
    title: 'Thermal Energy Storage Materials Library',
    note: 'Molten salts, phase change materials, thermophysical properties, and ceramic candidates.',
  },
  'flow-battery': {
    title: 'Flow Battery Materials Library',
    note: 'Redox active molecules, electrolytes, and support materials.',
  },
  aerospace: {
    title: 'Commercial Space Materials Library',
    note: '30+ engineering candidates, task operating conditions, TRL, failure risks, and qualification pathways.',
  },
};

const MaterialsLibrary: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F5F5F0] px-4 py-8 text-gray-800">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/workspace')}
              className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50"
              title="Return to Agent Workspace"
            >
              <ArrowLeft size={17} />
            </button>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">Materials Library</p>
              <h1 className="mt-1 text-xl font-bold text-[#0A1128]">Library</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/workspace')}
            className="flex h-10 items-center gap-2 rounded-[32px] border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <Search size={16} />
            Back to Agent
          </button>
        </div>

        <div className="mb-6 rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-[#0A1128]">All seven libraries are here</p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
                Once inside, each library uses the same backend source retrieval structure while retaining field-specific formulas, modeling prompts, and paths to send results to the Modeling Agent.
              </p>
            </div>
            <div className="rounded-[16px] border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Libraries</p>
              <p className="mt-1 font-mono text-base font-bold text-[#0A1128]">{MATERIAL_EXPLORER_CARDS.length}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {MATERIAL_EXPLORER_CARDS.map((card) => {
            const Icon = card.icon;
            const label = libraryLabels[card.id] || { title: card.title, note: card.description };
            return (
              <button
                key={card.id}
                type="button"
                data-testid={`materials-library-card-${card.id}`}
                onClick={() => navigate(card.route)}
                className="group rounded-[24px] border border-gray-100 bg-white p-5 text-left shadow-[0_4px_30px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)]"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#0A1128] text-white">
                    <Icon size={21} />
                  </span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-[16px] border border-gray-200 text-gray-400 transition group-hover:border-[#0A1128] group-hover:text-[#0A1128]">
                    <ArrowRight size={16} />
                  </span>
                </div>
                <p className="text-base font-bold text-[#0A1128]">{label.title}</p>
                <p className="mt-2 min-h-[44px] text-sm leading-6 text-gray-600">{label.note}</p>
                <div className="mt-4 flex items-center gap-2 rounded-[16px] border border-gray-100 bg-gray-50 px-3 py-2">
                  <Database size={14} className="text-gray-400" />
                  <p className="line-clamp-1 text-xs text-gray-500">{card.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MaterialsLibrary;
