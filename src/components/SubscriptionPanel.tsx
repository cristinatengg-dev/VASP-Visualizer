import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore';
import { Check, X, Shield, Zap, Crown, LayoutDashboard, ChevronDown, ChevronUp } from 'lucide-react';
import { clsx } from 'clsx';

const PRICING_TABLE = [
    {
        tier: 'normal',
        name: 'Standard',
        price: 'Free',
        features: ['Basic Support', 'Standard Speed'],
        quotaLabel: 'Pay-as-you-go',
        extraLabel: '¥10/image, ¥50/video',
        color: 'bg-white/5',
        textColor: 'text-gray-400',
        icon: LayoutDashboard,
        buttonStyle: 'outline'
    },
    {
        tier: 'vip',
        name: 'Professional',
        price: '¥3000',
        period: '/mo',
        features: ['Priority Queue', '2K Export', 'Email Support'],
        quotaLabel: '368 images / 30 videos per month',
        extraLabel: '¥8/image, ¥40/video beyond quota',
        recommended: true,
        color: 'bg-white/10',
        textColor: 'text-white',
        icon: Zap,
        buttonStyle: 'primary'
    },
    {
        tier: 'svip',
        name: 'Enterprise',
        price: '¥5000',
        period: '/mo',
        features: ['Dedicated Server', '4K Export', '24/7 Support'],
        quotaLabel: '750 images / 200 videos per month',
        extraLabel: '¥6/image, ¥30/video beyond quota',
        color: 'bg-white/5',
        textColor: 'text-amber-500',
        icon: Crown,
        buttonStyle: 'outline'
    },
];

import { PaymentModal } from './PaymentModal';

export const SubscriptionPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { user, refreshUser } = useStore();
    const [processingTier, setProcessingTier] = useState<string | null>(null);
    const [expandedTier, setExpandedTier] = useState<string | null>(null);
    const [paymentModal, setPaymentModal] = useState<{ tier: string, cost: number, name: string } | null>(null);

    const handleSubscribe = (tier: string) => {
        const plan = PRICING_TABLE.find(p => p.tier === tier);
        if (!plan) return;

        // Parse price: "¥3000" -> 3000
        const priceStr = plan.price.replace(/[^0-9]/g, '');
        const cost = parseInt(priceStr) || 0;

        setPaymentModal({ tier, cost, name: plan.name });
    };

    const handlePaymentSuccess = async () => {
        if (!paymentModal) return;

        setProcessingTier(paymentModal.tier);
        await refreshUser();
        setProcessingTier(null);
        setPaymentModal(null);
    };

    const toggleExpand = (tier: string) => {
        setExpandedTier(expandedTier === tier ? null : tier);
    };

    return createPortal(
        <>
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-[#050b14]/80 backdrop-blur-[8px] z-[9998]" 
                onClick={onClose}
            />
            
            {/* Modal */}
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] w-[960px] max-w-[95vw] max-h-[90vh] bg-[#0f172a]/90 border border-white/10 rounded-[32px] shadow-2xl overflow-hidden flex flex-col text-slate-200">
                <div className="p-8 border-b border-white/5 flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold text-white tracking-tight">Subscription Plans</h2>
                        <p className="text-slate-400 text-sm mt-1">Upgrade your experience with premium features</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-10 overflow-y-auto custom-scrollbar">
                    <div className="grid md:grid-cols-3 gap-6">
                        {PRICING_TABLE.map((plan) => {
                            const isCurrent = user?.tier === plan.tier;
                            const Icon = plan.icon;
                            const isExpanded = expandedTier === plan.tier;
                            
                            return (
                                <div 
                                    key={plan.tier} 
                                    className={clsx(
                                        "relative rounded-[24px] flex flex-col transition-all duration-300 backdrop-blur-md border",
                                        plan.recommended 
                                            ? "bg-white/10 border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)] ring-1 ring-white/10" 
                                            : "bg-white/5 border-white/5 shadow-lg hover:border-white/10"
                                    )}
                                >
                                    {plan.recommended && (
                                        <div className="absolute top-4 right-4 bg-white/10 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wide border border-white/10 backdrop-blur-sm shadow-sm">
                                            Team Choice
                                        </div>
                                    )}
                                    
                                    <div className="p-8 flex-1">
                                        <div className="flex items-center gap-4 mb-6">
                                            <div className={clsx(
                                                "w-12 h-12 rounded-[16px] flex items-center justify-center shadow-inner border border-white/5", 
                                                plan.tier === 'vip' ? "bg-gradient-to-br from-slate-700 to-slate-900 text-white" :
                                                plan.tier === 'svip' ? "bg-gradient-to-br from-amber-900/40 to-amber-700/20 text-amber-400" :
                                                "bg-white/5 text-slate-400"
                                            )}>
                                                <Icon className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h3 className={clsx("text-lg font-bold", plan.textColor)}>{plan.name}</h3>
                                                {isCurrent && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">Current Plan</span>}
                                            </div>
                                        </div>
                                        
                                        <div className="mb-8">
                                            <div className="flex items-baseline">
                                                <span className="text-3xl font-bold text-white tracking-tight">{plan.price}</span>
                                                {plan.period && <span className="text-slate-500 ml-2 text-sm font-medium">{plan.period}</span>}
                                            </div>
                                        </div>

                                        <ul className="space-y-3 mb-8">
                                            {plan.features.map((feature, i) => (
                                                <li key={i} className="flex items-start text-sm text-slate-300 font-medium">
                                                    <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center mr-3 shrink-0">
                                                        <Check className="w-3 h-3 text-white" />
                                                    </div>
                                                    {feature}
                                                </li>
                                            ))}
                                        </ul>

                                        <div className="border-t border-white/5 pt-4">
                                            <button 
                                                onClick={() => toggleExpand(plan.tier)}
                                                className="flex items-center justify-between w-full text-xs text-slate-500 hover:text-slate-300 transition-colors group"
                                            >
                                                <span>View Usage & Billing Details</span>
                                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                            </button>
                                            
                                            <div className={clsx(
                                                "overflow-hidden transition-all duration-300 ease-in-out",
                                                isExpanded ? "max-h-40 opacity-100 mt-4" : "max-h-0 opacity-0"
                                            )}>
                                                <div className="space-y-3 text-xs bg-black/20 p-3 rounded-lg border border-white/5">
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Monthly Quota</span>
                                                        <span className="text-slate-200 font-mono">{plan.quotaLabel}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Extra Cost</span>
                                                        <span className="text-slate-200 font-mono">{plan.extraLabel}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-8 pt-0 mt-auto">
                                        <button
                                            onClick={() => !isCurrent && handleSubscribe(plan.tier)}
                                            disabled={!!processingTier || isCurrent}
                                            className={clsx(
                                                "w-full py-3.5 rounded-[24px] font-semibold transition-all flex items-center justify-center gap-2 text-sm",
                                                isCurrent 
                                                    ? "bg-white/5 text-slate-500 cursor-default border border-white/5" 
                                                    : plan.buttonStyle === 'primary'
                                                        ? "bg-gradient-to-r from-slate-200 to-white text-slate-900 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)] hover:scale-[1.02] active:scale-[0.98]"
                                                        : "border border-white/20 text-slate-300 hover:bg-white/5 hover:text-white hover:border-white/40"
                                            )}
                                        >
                                            {processingTier === plan.tier ? (
                                                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                            ) : isCurrent ? (
                                                "Active Plan"
                                            ) : (
                                                "Choose Plan"
                                            )}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                
                <div className="p-4 border-t border-white/5 bg-black/20 text-center">
                    <p className="text-xs text-slate-500 flex items-center justify-center gap-2">
                        <Shield className="w-3 h-3" />
                        Secure Payment • Cancel Anytime • Premium Support
                    </p>
                </div>
            </div>
            
            {paymentModal && (
                <PaymentModal
                    cost={paymentModal.cost}
                    type="subscription"
                    planName={paymentModal.name}
                    tier={paymentModal.tier}
                    onConfirm={handlePaymentSuccess}
                    onClose={() => setPaymentModal(null)}
                />
            )}
        </>,
        document.body
    );
};
