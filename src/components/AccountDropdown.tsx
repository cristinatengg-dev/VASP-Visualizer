import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { User, LogOut, CreditCard, ChevronDown, User as UserIcon, Crown, Zap, LogIn } from 'lucide-react';
import { clsx } from 'clsx';
import { SubscriptionPanel } from './SubscriptionPanel';

const ProfileModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { user } = useStore();
    if (!user) return null;

    // Calculate Remaining Quotas based on Tier
    // VIP: 368 images, 30 videos
    // SVIP: 750 images, 200 videos
    // Normal: 0 (Pay as you go)
    
    let imgQuotaTotal = 0;
    let vidQuotaTotal = 0;
    
    if (user.tier === 'vip') {
        imgQuotaTotal = 368;
        vidQuotaTotal = 30;
    } else if (user.tier === 'svip') {
        imgQuotaTotal = 750;
        vidQuotaTotal = 200;
    }
    
    // Remaining = Total - Used
    // Note: Used includes trial usage? 
    // Usually quota is separate from trial. But for simplicity, let's assume 'used_img' counts against quota after trial.
    // The current backend increments 'used_img' only when NOT trial.
    // So 'used_img' IS the amount consumed from the quota.
    
    const imgRemaining = Math.max(0, imgQuotaTotal - user.used_img);
    const vidRemaining = Math.max(0, vidQuotaTotal - user.used_vid);
    const prepaidImgLeft = user.prepaid_img ?? 0;
    const prepaidVidLeft = user.prepaid_vid ?? 0;
    
    const isLowQuota = (remaining: number, total: number) => total > 0 && (remaining / total) < 0.2;
    const showWarning = isLowQuota(imgRemaining, imgQuotaTotal) || isLowQuota(vidRemaining, vidQuotaTotal);
    
    const [inviteCode, setInviteCode] = useState('');
    const [redeemStatus, setRedeemStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [redeemMsg, setRedeemMsg] = useState('');
    const { redeemCode } = useStore();

    const handleRedeem = async () => {
        if (!inviteCode.trim()) return;
        setRedeemStatus('loading');
        try {
            await redeemCode(inviteCode);
            setRedeemStatus('success');
            setInviteCode('');
            setRedeemMsg('Success! You are now SVIP.');
            setTimeout(() => setRedeemStatus('idle'), 3000);
        } catch (e: any) {
            setRedeemStatus('error');
            setRedeemMsg(e.message || 'Invalid code');
        }
    };

    return (
        <div className="fixed inset-0 bg-[#F4F4F4]/50 flex items-center justify-center z-[9999] backdrop-blur-md" onClick={onClose}>
            <div className="bg-white rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.05)] p-10 w-[420px] max-w-full ring-1 ring-black/5 relative overflow-hidden" onClick={e => e.stopPropagation()}>
                
                {showWarning && (
                    <div className="absolute top-0 left-0 right-0 bg-red-50 text-red-600 text-[10px] py-1.5 text-center font-bold uppercase tracking-wider border-b border-red-100">
                        Your annual quota is running low. Please check.
                    </div>
                )}
                
                <div className="flex justify-between items-center mb-8 border-b border-gray-100 pb-6 mt-2">
                    <h3 className="text-2xl font-bold text-gray-800 tracking-tight">Personal Center</h3>
                    <div className={clsx(
                        "px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide shadow-sm",
                        user.tier === 'normal' ? "bg-gray-100 text-gray-600" : 
                        user.tier === 'vip' ? "bg-slate-100 text-slate-700 ring-1 ring-slate-200" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                    )}>
                        {user.tier === 'svip' ? 'SVIP' : user.tier === 'vip' ? 'VIP' : 'Free'}
                    </div>
                </div>
                
                <div className="space-y-6">
                    <div className="bg-gray-50/50 p-4 rounded-[24px] border border-gray-100">
                        <div className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Account ID</div>
                        <div className="font-mono text-lg text-gray-700 font-medium tracking-tight">{(user as any).id || (user as any)._id || user.email}</div>
                    </div>
                    
                    {/* Invitation Code Redeem */}
                    <div className="bg-white p-1 rounded-[24px] border border-gray-100 flex items-center shadow-sm relative">
                         <input 
                             type="text" 
                             placeholder="Enter Invitation Code"
                             value={inviteCode}
                             onChange={(e) => setInviteCode(e.target.value)}
                             className="flex-1 pl-5 pr-2 py-3 text-sm font-medium text-gray-800 placeholder-gray-400 outline-none bg-transparent"
                         />
                         <button 
                            onClick={handleRedeem}
                            disabled={redeemStatus === 'loading' || !inviteCode}
                            className={clsx(
                                "px-5 py-2.5 rounded-[20px] text-xs font-bold uppercase tracking-wide text-white transition-all",
                                redeemStatus === 'success' ? "bg-green-500" :
                                redeemStatus === 'error' ? "bg-red-500" :
                                "bg-blue-600 hover:bg-blue-700"
                            )}
                         >
                            {redeemStatus === 'loading' ? '...' : 
                             redeemStatus === 'success' ? 'OK' : 
                             redeemStatus === 'error' ? 'Retry' : 'Redeem'}
                         </button>
                         
                         {/* Status Message Toast */}
                         {(redeemStatus === 'success' || redeemStatus === 'error') && (
                             <div className={clsx(
                                 "absolute top-full left-0 mt-2 text-xs font-medium px-3 py-1 rounded-lg animate-in fade-in slide-in-from-top-1",
                                 redeemStatus === 'success' ? "text-green-600 bg-green-50" : "text-red-600 bg-red-50"
                             )}>
                                 {redeemMsg}
                             </div>
                         )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-blue-50/50 p-4 rounded-[24px] border border-blue-100/50 transition-all hover:shadow-sm">
                            <div className="text-xs text-blue-600/80 uppercase font-bold tracking-wider mb-1">Trial Images</div>
                            <div className="text-2xl font-bold text-blue-900">{user.trial_img_left} <span className="text-xs font-medium text-blue-400 ml-0.5">left</span></div>
                        </div>
                        <div className="bg-purple-50/50 p-4 rounded-[24px] border border-purple-100/50 transition-all hover:shadow-sm">
                            <div className="text-xs text-purple-600/80 uppercase font-bold tracking-wider mb-1">Trial Videos</div>
                            <div className="text-2xl font-bold text-purple-900">{user.trial_vid_left} <span className="text-xs font-medium text-purple-400 ml-0.5">left</span></div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-emerald-50/50 p-4 rounded-[24px] border border-emerald-100/50 transition-all hover:shadow-sm">
                            <div className="text-xs text-emerald-700/80 uppercase font-bold tracking-wider mb-1">Prepaid Images</div>
                            <div className="text-2xl font-bold text-emerald-900">{prepaidImgLeft} <span className="text-xs font-medium text-emerald-500 ml-0.5">left</span></div>
                        </div>
                        <div className="bg-amber-50/50 p-4 rounded-[24px] border border-amber-100/50 transition-all hover:shadow-sm">
                            <div className="text-xs text-amber-700/80 uppercase font-bold tracking-wider mb-1">Prepaid Videos</div>
                            <div className="text-2xl font-bold text-amber-900">{prepaidVidLeft} <span className="text-xs font-medium text-amber-500 ml-0.5">left</span></div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                        <div className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-4">Quota & Usage</div>
                        
                        {user.tier === 'normal' ? (
                             <div className="space-y-4">
                                <div className="flex justify-between text-sm items-center">
                                    <span className="text-gray-600 font-medium">Prepaid Images Left</span>
                                    <span className="font-mono font-bold text-gray-900 bg-gray-50 px-2 py-0.5 rounded-lg">{prepaidImgLeft}</span>
                                </div>
                                <div className="flex justify-between text-sm items-center">
                                    <span className="text-gray-600 font-medium">Prepaid Videos Left</span>
                                    <span className="font-mono font-bold text-gray-900 bg-gray-50 px-2 py-0.5 rounded-lg">{prepaidVidLeft}</span>
                                </div>
                                <div className="flex justify-between text-sm items-center">
                                    <span className="text-gray-600 font-medium">Images Exported</span>
                                    <span className="font-mono font-bold text-gray-900 bg-gray-50 px-2 py-0.5 rounded-lg">{user.used_img}</span>
                                </div>
                                <div className="flex justify-between text-sm items-center">
                                    <span className="text-gray-600 font-medium">Videos Exported</span>
                                    <span className="font-mono font-bold text-gray-900 bg-gray-50 px-2 py-0.5 rounded-lg">{user.used_vid}</span>
                                </div>
                                <div className="text-[10px] text-gray-400 mt-2 italic text-right">Pay as you go plan</div>
                             </div>
                        ) : (
                             <div className="space-y-5">
                                <div>
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className={clsx("font-medium", isLowQuota(imgRemaining, imgQuotaTotal) ? "text-red-600" : "text-gray-600")}>
                                            Remaining Images
                                        </span>
                                        <span className={clsx("font-mono font-bold", isLowQuota(imgRemaining, imgQuotaTotal) ? "text-red-600" : "text-gray-800")}>
                                            {imgRemaining} <span className="text-gray-300 font-normal mx-1">/</span> {imgQuotaTotal}
                                        </span>
                                    </div>
                                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div 
                                            className={clsx("h-full rounded-full transition-all duration-500", isLowQuota(imgRemaining, imgQuotaTotal) ? "bg-red-500" : "bg-slate-700")} 
                                            style={{ width: `${(imgRemaining / imgQuotaTotal) * 100}%` }}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className={clsx("font-medium", isLowQuota(vidRemaining, vidQuotaTotal) ? "text-red-600" : "text-gray-600")}>
                                            Remaining Videos
                                        </span>
                                        <span className={clsx("font-mono font-bold", isLowQuota(vidRemaining, vidQuotaTotal) ? "text-red-600" : "text-gray-800")}>
                                            {vidRemaining} <span className="text-gray-300 font-normal mx-1">/</span> {vidQuotaTotal}
                                        </span>
                                    </div>
                                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div 
                                            className={clsx("h-full rounded-full transition-all duration-500", isLowQuota(vidRemaining, vidQuotaTotal) ? "bg-red-500" : "bg-slate-700")} 
                                            style={{ width: `${(vidRemaining / vidQuotaTotal) * 100}%` }}
                                        />
                                    </div>
                                </div>
                             </div>
                        )}
                    </div>
                </div>
                
                <button onClick={onClose} className="mt-8 w-full py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-[24px] text-sm font-bold transition-all active:scale-[0.98]">
                    Close
                </button>
            </div>
        </div>
    );
};

export const AccountDropdown: React.FC = () => {
    const { user, logout } = useStore();
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [showSubscription, setShowSubscription] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Refresh user data when profile is opened or dropdown is toggled
    const refreshUser = useStore(state => state.refreshUser);
    useEffect(() => {
        if (isOpen || showProfile) {
            refreshUser();
        }
    }, [isOpen, showProfile, refreshUser]);

    // Mask email: t***t@example.com
    const maskedPhone = user?.id ? user.id.replace(/(.{1}).+(@.+)/, '$1****$2') : 'Guest';

    if (!user) {
        return (
            <div className="absolute top-6 right-6 z-50">
                <button
                    onClick={() => navigate('/login')}
                    className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-[32px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-gray-100 hover:shadow-[0_8px_25px_rgba(0,0,0,0.08)] transition-all group ring-1 ring-black/5 text-[#0A1128] text-sm font-semibold"
                >
                    <LogIn className="w-4 h-4 text-[#2E4A8E]" />
                    登录
                </button>
            </div>
        );
    }

    return (
        <div className="absolute top-6 right-6 z-50" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-[32px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-gray-100 hover:shadow-[0_8px_25px_rgba(0,0,0,0.08)] transition-all group ring-1 ring-black/5"
            >
                <div className={clsx(
                    "w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm ring-2 ring-offset-1 transition-all",
                    user.tier === 'normal' ? "bg-gray-400 ring-gray-200" : 
                    user.tier === 'vip' ? "bg-gradient-to-br from-slate-700 to-slate-900 ring-slate-300" : // VIP: Silver-ish Dark
                    "bg-gradient-to-br from-amber-400 to-yellow-600 ring-yellow-200" // SVIP: Gold
                )}>
                    {user.tier === 'svip' ? <Crown className="w-4 h-4 text-white drop-shadow-sm" /> : 
                     user.tier === 'vip' ? <Zap className="w-4 h-4 text-white drop-shadow-sm" /> :
                     <User className="w-4 h-4" />}
                </div>
                
                <div className="flex flex-col items-start mr-2">
                    <span className="text-sm font-bold text-[#0A1128] leading-none">{maskedPhone}</span>
                    <span className={clsx(
                        "text-[10px] uppercase font-bold tracking-wider leading-none mt-1 px-1.5 py-0.5 rounded-full",
                        user.tier === 'normal' ? "text-gray-400 bg-gray-100" : 
                        user.tier === 'vip' ? "text-slate-100 bg-slate-800 shadow-[0_2px_4px_rgba(0,0,0,0.2)]" : // VIP Badge
                        "text-yellow-900 bg-yellow-300 shadow-[0_2px_4px_rgba(234,179,8,0.3)]" // SVIP Badge
                    )}>
                        {user.tier === 'svip' ? 'SVIP' : user.tier === 'vip' ? 'VIP' : 'Free'}
                    </span>
                </div>
                
                <ChevronDown className={clsx("w-4 h-4 text-gray-400 transition-transform duration-300", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-3 w-64 bg-white rounded-[24px] shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 p-2">
                    <div className="space-y-1">
                        <button 
                            onClick={() => { setShowProfile(true); setIsOpen(false); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-[24px] transition-colors"
                        >
                            <UserIcon className="w-4 h-4 text-gray-400" />
                            Personal Center
                        </button>
                        
                        <button 
                            onClick={() => { setShowSubscription(true); setIsOpen(false); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-[24px] transition-colors"
                        >
                            <CreditCard className="w-4 h-4 text-gray-400" />
                            Subscription
                        </button>
                    </div>
                    
                    <div className="h-px bg-gray-100 mx-2 my-2" />
                    
                    <div>
                        <button 
                            onClick={() => { logout(); setIsOpen(false); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-[24px] transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                            Logout
                        </button>
                    </div>
                </div>
            )}

            {showSubscription && <SubscriptionPanel onClose={() => setShowSubscription(false)} />}
            {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
        </div>
    );
};
