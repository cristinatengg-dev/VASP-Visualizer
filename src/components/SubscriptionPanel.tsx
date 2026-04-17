import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore';
import { Check, X, Shield, Zap, Crown, User, ChevronDown, ChevronUp, Phone } from 'lucide-react';
import { clsx } from 'clsx';

const PRICING_TABLE = [
    {
        tier: 'personal',
        name: '个人端',
        price: '¥99',
        period: '/月/Agent',
        features: [
            '单个 Agent 调用订阅',
            '目前开放 Rendering Agent',
            '目前开放 Cover Agent',
        ],
        quotaLabel: '按 Agent 订阅',
        extraLabel: '每月每个 Agent ¥99',
        color: 'bg-white/5',
        textColor: 'text-white',
        icon: User,
        buttonStyle: 'outline'
    },
    {
        tier: 'academic',
        name: '高校端',
        price: '¥3万',
        period: '/年',
        features: [
            '全平台 Agent 访问',
            '不包括基础算力调用',
            '校园批量授权',
        ],
        quotaLabel: '平台订阅',
        extraLabel: '基础算力另计',
        recommended: true,
        color: 'bg-white/10',
        textColor: 'text-white',
        icon: Zap,
        buttonStyle: 'primary',
        contactOnly: true,
        contactPhone: '18396102509',
    },
    {
        tier: 'enterprise',
        name: '企业端',
        price: '全定制',
        period: '',
        features: [
            '全定制化交付',
            '专属技术支持',
            '每年 15% 后期运维费用',
        ],
        quotaLabel: '定制化方案',
        extraLabel: '联系工程师获取报价',
        color: 'bg-white/5',
        textColor: 'text-amber-500',
        icon: Crown,
        buttonStyle: 'outline',
        contactOnly: true,
        contactPhone: '18396102509',
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

        // Enterprise tier: contact sales only, no payment flow
        if ((plan as any).contactOnly) return;

        // Parse price: "¥99" -> 99, "¥15万" -> 150000
        let priceStr = plan.price.replace(/[^0-9万]/g, '');
        let cost = 0;
        if (priceStr.includes('万')) {
            cost = parseInt(priceStr.replace('万', '')) * 10000;
        } else {
            cost = parseInt(priceStr) || 0;
        }

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
                        <h2 className="text-2xl font-bold text-white tracking-tight">订阅方案</h2>
                        <p className="text-slate-400 text-sm mt-1">选择适合您的订阅方案</p>
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
                                            推荐
                                        </div>
                                    )}
                                    
                                    <div className="p-8 flex-1">
                                        <div className="flex items-center gap-4 mb-6">
                                            <div className={clsx(
                                                "w-12 h-12 rounded-[16px] flex items-center justify-center shadow-inner border border-white/5", 
                                                plan.tier === 'academic' ? "bg-gradient-to-br from-slate-700 to-slate-900 text-white" :
                                                plan.tier === 'enterprise' ? "bg-gradient-to-br from-amber-900/40 to-amber-700/20 text-amber-400" :
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
                                                <span>查看详情</span>
                                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                            </button>
                                            
                                            <div className={clsx(
                                                "overflow-hidden transition-all duration-300 ease-in-out",
                                                isExpanded ? "max-h-40 opacity-100 mt-4" : "max-h-0 opacity-0"
                                            )}>
                                                <div className="space-y-3 text-xs bg-black/20 p-3 rounded-lg border border-white/5">
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">订阅模式</span>
                                                        <span className="text-slate-200 font-mono">{plan.quotaLabel}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">费用说明</span>
                                                        <span className="text-slate-200 font-mono">{plan.extraLabel}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-8 pt-0 mt-auto">
                                        {(plan as any).contactOnly ? (
                                            <a
                                                href={`tel:${(plan as any).contactPhone}`}
                                                className="w-full py-3.5 rounded-[24px] font-semibold transition-all flex items-center justify-center gap-2 text-sm border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:border-amber-400/50"
                                            >
                                                <Phone className="w-4 h-4" />
                                                联系工程师: {(plan as any).contactPhone}
                                            </a>
                                        ) : (
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
                                                "当前方案"
                                            ) : (
                                                "立即订阅"
                                            )}
                                        </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                
                <div className="p-4 border-t border-white/5 bg-black/20 text-center">
                    <p className="text-xs text-slate-500 flex items-center justify-center gap-2">
                        <Shield className="w-3 h-3" />
                        安全支付 · 随时取消 · 专属客服
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
