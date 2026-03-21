import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Image as ImageIcon, Video, Download, CheckCircle2, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { PaymentModal } from '../PaymentModal'; // Reusing existing modal

export const ExportWidget: React.FC = () => {
  const { 
      setTriggerSquareExport, setTriggerVideoExport, setExportScale,
      isVideoExporting, videoExportProgress, user, checkExport,
      videoExportStep, setVideoExportStep
  } = useStore();

  const [paymentState, setPaymentState] = useState<{ show: boolean, cost: number, type: 'img' | 'vid' }>({ show: false, cost: 0, type: 'img' });

  const handleExportClick = async (type: 'img' | 'vid') => {
      if (!user) return;
      const { cost } = await checkExport(type);
      setPaymentState({ show: true, cost, type });
  };

  const confirmExport = () => {
      setPaymentState(prev => ({ ...prev, show: false }));
      if (paymentState.type === 'img') {
          setExportScale(4); // Force High Res
          setTriggerSquareExport(true);
      } else {
          setTriggerVideoExport(true);
      }
  };

  return (
    <div className="bg-white rounded-3xl p-6 shadow-soft h-full flex flex-col justify-between relative overflow-hidden">
      {/* Background decoration imitating album art blur? */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2 pointer-events-none" />

      <div className="flex justify-between items-start z-10">
        <div>
           <h3 className="font-semibold text-snap-text">Export</h3>
           <p className="text-xs text-snap-secondary">Render Output</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-snap-pill flex items-center justify-center">
            <Download size={14} className="text-snap-secondary" />
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-4 z-10">
         {/* Export Buttons */}
         <button 
           onClick={() => handleExportClick('img')}
           className="flex items-center justify-between p-3 bg-snap-bg rounded-2xl hover:bg-snap-pill transition-colors group"
         >
             <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                     <ImageIcon size={18} className="text-blue-500" />
                 </div>
                 <div className="text-left">
                     <p className="text-sm font-bold text-snap-text">Image</p>
                     <p className="text-[10px] text-snap-secondary">4K • 300 DPI</p>
                 </div>
             </div>
             <div className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center">
                 <CheckCircle2 size={14} className="text-gray-300" />
             </div>
         </button>

         {/* Sampling Control */}
         <div className="flex items-center justify-between px-2 py-1 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Sampling</span>
            <select 
                value={videoExportStep}
                onChange={(e) => setVideoExportStep(Number(e.target.value))}
                disabled={isVideoExporting}
                className="bg-transparent text-xs font-bold text-gray-700 outline-none cursor-pointer disabled:opacity-50"
            >
                <option value={1}>Full (1x)</option>
                <option value={2}>Fast (2x)</option>
                <option value={5}>Extreme (5x)</option>
                <option value={10}>Lightspeed (10x)</option>
                <option value={50}>Hyper (50x)</option>
                <option value={100}>Instant (100x)</option>
            </select>
         </div>

         <button 
           onClick={() => handleExportClick('vid')}
           disabled={isVideoExporting}
           className="flex items-center justify-between p-3 bg-snap-bg rounded-2xl hover:bg-snap-pill transition-colors group relative overflow-hidden"
         >
             {isVideoExporting && (
                 <div 
                    className="absolute left-0 top-0 bottom-0 bg-blue-100 opacity-50 transition-all duration-300"
                    style={{ width: `${videoExportProgress}%` }}
                 />
             )}
             
             <div className="flex items-center gap-3 relative z-10">
                 <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                     {isVideoExporting ? <Loader2 size={18} className="animate-spin text-blue-500" /> : <Video size={18} className="text-purple-500" />}
                 </div>
                 <div className="text-left">
                     <p className="text-sm font-bold text-snap-text">{isVideoExporting ? 'Rendering...' : 'Video'}</p>
                     <p className="text-[10px] text-snap-secondary">H.264 • 60 FPS</p>
                 </div>
             </div>
         </button>
      </div>

      {paymentState.show && (
          <PaymentModal 
              cost={paymentState.cost}
              type={paymentState.type}
              onClose={() => setPaymentState(prev => ({ ...prev, show: false }))}
              onConfirm={confirmExport}
          />
      )}
    </div>
  );
};
