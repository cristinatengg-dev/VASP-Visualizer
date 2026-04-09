import React from 'react';
import { useStore } from '../../store/useStore';
import { Crown, ShieldCheck } from 'lucide-react';
import { clsx } from 'clsx';

export const AccountWidget: React.FC = () => {
  const { user } = useStore();

  if (!user) {
    return null;
  }

  const isVIP = user.tier === 'academic' || user.tier === 'enterprise';

  return (
    <div className="bg-white rounded-3xl p-6 shadow-soft flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-snap-text">My Account</h3>
        {isVIP && <Crown size={16} className="text-yellow-500 fill-yellow-500" />}
      </div>
      
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-snap-bg overflow-hidden border-2 border-white shadow-sm">
           <img 
             src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`} 
             alt="Avatar" 
           />
        </div>
        <div>
          <p className="text-sm font-bold text-snap-text">{user.email}</p>
          <div className="flex items-center gap-1 mt-1">
             <span className={clsx(
               "text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wide",
               user.tier === 'enterprise' ? "bg-black text-white" :
               user.tier === 'academic' ? "bg-yellow-100 text-yellow-700" :
               "bg-gray-100 text-gray-600"
             )}>
               {user.tier === 'enterprise' ? '企业端' : user.tier === 'academic' ? '高校端' : '个人端'}
             </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-snap-secondary bg-snap-pill p-3 rounded-2xl">
        <ShieldCheck size={14} />
        <span>IP Protection Active</span>
      </div>
    </div>
  );
};
