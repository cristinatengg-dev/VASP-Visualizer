import React from 'react';
import { ArrowLeft, ArrowRight, Database, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MATERIAL_EXPLORER_CARDS } from '../data/materialExplorerRegistry';

const libraryLabels: Record<string, { title: string; note: string }> = {
  battery: {
    title: '电池材料库',
    note: '正极、负极、固态电解质和常用结构候选。',
  },
  nuclear: {
    title: '核材料库',
    note: '燃料、包壳、辐照与核数据相关材料入口。',
  },
  supercapacitor: {
    title: '超级电容材料库',
    note: '多孔碳、氧化物、MXene 与赝电容材料。',
  },
  'hydrogen-storage': {
    title: '储氢材料库',
    note: '金属氢化物、合金、MOF 和吸附材料。',
  },
  'thermal-storage': {
    title: '热储能材料库',
    note: '熔盐、相变材料、热物性和陶瓷候选。',
  },
  'flow-battery': {
    title: '液流电池材料库',
    note: '氧化还原分子、电解液与支撑材料。',
  },
  aerospace: {
    title: '航天材料库',
    note: '热防护陶瓷、固体润滑、放气与空间环境数据。',
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
              title="返回工作台"
            >
              <ArrowLeft size={17} />
            </button>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">Materials Library</p>
              <h1 className="mt-1 text-xl font-bold text-[#0A1128]">资料库</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/workspace')}
            className="flex h-10 items-center gap-2 rounded-[32px] border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <Search size={16} />
            回到 Agent
          </button>
        </div>

        <div className="mb-6 rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-[#0A1128]">七个资料库都在这里</p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
                每个资料库进入后都使用同一套后台结构检索源，并保留各自领域的常用公式、建模提示和结果转 Modeling Agent 的路径。
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
