import React from 'react';
import { ModelingIntent } from '../../types/modeling';
import { Scene3D } from '../../../../components/Scene3D';
import { useStore } from '../../../../store/useStore';
import { saveAs } from 'file-saver';
import { exportToPOSCAR } from '../../../../utils/poscarExporter';

const CanvasPanel: React.FC<{ intent: ModelingIntent | null }> = ({ intent }) => {
  const molecularData = useStore(state => state.molecularData);
  const atomCount = molecularData?.atoms?.length ?? null;

  const handleExportPOSCAR = () => {
    if (!molecularData) return;
    const text = exportToPOSCAR(molecularData);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, 'POSCAR');
  };

  return (
    <div className="w-full h-full relative">
      {/* 3D 渲染占位 */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#111] to-[#050505] flex items-center justify-center">
        {!molecularData ? (
          <div className="text-center space-y-4 max-w-md px-6">
            <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
              </svg>
            </div>
            <h3 className="text-xl font-medium text-white/80">等待建模指令</h3>
            <p className="text-sm text-white/40 leading-relaxed">
              在左侧输入您想要构建的分子、晶体或表面体系。AI 将自动为您生成初步的 3D 模型结构。
            </p>
          </div>
        ) : (
          <div className="w-full h-full">
             <Scene3D />
          </div>
        )}
      </div>

      {/* 顶部工具栏 - 第一优先级功能 */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none">
        <div className="flex gap-2 pointer-events-auto">
          <div className="bg-white border border-gray-100 rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.08)] p-1 flex gap-1">
            <ToolbarButton icon="select" active />
            <ToolbarButton icon="move" />
            <ToolbarButton icon="rotate" />
            <ToolbarButton icon="scale" />
          </div>
          <div className="bg-white border border-gray-100 rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.08)] p-1 flex gap-1">
            <ToolbarButton icon="measure" />
            <ToolbarButton icon="angle" />
          </div>
        </div>

        <div className="flex gap-2 pointer-events-auto">
          <button
            className="px-4 py-3 bg-[#2E4A8E] text-white rounded-[32px] hover:bg-[#3D5BA6] transition-colors shadow-sm font-medium text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed flex items-center gap-2"
            onClick={handleExportPOSCAR}
            disabled={!molecularData}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            导出 POSCAR
          </button>
        </div>
      </div>

      {/* 右下角：快捷状态 */}
      {intent && (
        <div className="absolute bottom-4 right-4 bg-white border border-gray-100 rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.08)] p-3 text-[10px] font-mono text-gray-600 space-y-1">
          <div>ATOMS: {atomCount ?? '--'}</div>
          <div>LATTICE: {intent.substrate?.supercell?.join('x') || '1x1x1'}</div>
          <div>VACUUM: {intent.substrate?.vacuum || '0'} Å</div>
        </div>
      )}
    </div>
  );
};

const ToolbarButton: React.FC<{ icon: string; active?: boolean }> = ({ icon, active }) => (
  <button
    type="button"
    className={`h-8 flex items-center gap-2 px-3 rounded-[32px] transition-colors ${
      active
        ? 'bg-white text-[#0A1128] shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-black/5 font-semibold'
        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
    }`}
  >
    <span
      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
        active ? 'bg-[#0A1128] text-white' : 'bg-gray-200 text-gray-400'
      }`}
    >
      {icon.slice(0, 2).toUpperCase()}
    </span>
    <span className="text-[10px] uppercase tracking-wider">{icon}</span>
  </button>
);

export default CanvasPanel;
