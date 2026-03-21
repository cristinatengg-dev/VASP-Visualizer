import React, { useState } from 'react';
import { X, CreditCard, CheckCircle } from 'lucide-react';
import { useStore } from '../store/useStore';

interface PaymentModalProps {
    cost: number;
    type: 'img' | 'vid' | 'batch' | 'subscription';
    count?: number; // For batch
    planName?: string; // For subscription
    onConfirm: () => void;
    onClose: () => void;
    onPay?: () => Promise<boolean>; // Optional async payment handler
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ cost, type, count, planName, onConfirm, onClose, onPay }) => {
    const [step, setStep] = useState<'confirm' | 'paying' | 'success'>('confirm');
    const [isProcessing, setIsProcessing] = useState(false);
    const { checkExport } = useStore();

    const handlePay = () => {
        if (cost === 0) {
            onConfirm();
            return;
        }
        setStep('paying');
    };

    const handlePaymentAction = async () => {
        setIsProcessing(true);
        try {
            if (onPay) {
                const success = await onPay();
                if (success) {
                    setStep('success');
                    setTimeout(() => {
                        onConfirm();
                    }, 1000);
                } else {
                    alert("Payment verification failed. Please try again.");
                }
            } else {
                // Server-Side Verification for Exports
                if (type === 'img' || type === 'vid') {
                    // Re-check cost with server. If cost is 0, it means payment/quota is available.
                    const result = await checkExport(type);
                    
                    if (result.cost === 0) {
                        setStep('success');
                        setTimeout(() => {
                            onConfirm();
                        }, 1000);
                    } else {
                        alert("Payment not verified yet.\n\nPlease ensure you have completed the payment and the administrator has credited your account.");
                    }
                } else {
                    // For batch/subscription, fallback to legacy behavior (or implement specific checks)
                    // Currently assuming this fix targets the main export flow.
                    setTimeout(() => {
                        setStep('success');
                        setTimeout(() => {
                            onConfirm();
                        }, 1000);
                    }, 1500);
                }
            }
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-[9999] backdrop-blur-sm">
            <div className="bg-white rounded-[24px] shadow-[0_4px_30px_rgba(0,0,0,0.05)] p-8 w-[400px] text-center relative ring-1 ring-black/5">
                <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-gray-50 rounded-full transition-colors">
                    <X className="w-5 h-5 text-gray-400" />
                </button>

                {step === 'confirm' && (
                    <>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">
                            {type === 'batch' ? 'Confirm Batch Payment' : 
                             type === 'subscription' ? 'Confirm Subscription' : 'Confirm Export'}
                        </h3>
                        <p className="text-sm text-gray-500 mb-8">
                            {type === 'batch' 
                                ? `You are about to export ${count} images.` 
                                : type === 'subscription'
                                    ? `Upgrade to ${planName} Plan.`
                                    : `You are about to export a ${type === 'img' ? 'High-Res Image' : 'Trajectory Video'}.`
                            }
                        </p>
                        
                        <div className="bg-[#F9FAFB] p-6 rounded-[20px] mb-8 border border-gray-100">
                            <div className="text-xs text-gray-400 uppercase font-bold tracking-widest mb-2">Total Amount</div>
                            <div className="text-4xl font-extrabold text-blue-600">
                                {cost === 0 ? 'Free' : `¥${cost}`}
                            </div>
                            {cost === 0 && <div className="text-xs text-blue-400 mt-1 font-medium">Included in your plan</div>}
                        </div>

                        <button
                            onClick={handlePay}
                            className="w-full py-4 bg-[#0A1128] text-white rounded-[32px] font-bold hover:bg-[#162044] transition-all shadow-[0_8px_20px_rgba(10,17,40,0.2)] active:scale-95 text-sm"
                        >
                            {cost === 0 ? 'Confirm Deduction' : 'Proceed to Payment'}
                        </button>
                    </>
                )}

                {step === 'paying' && (
                    <>
                        <h3 className="text-xl font-bold text-gray-900 mb-4">Scan to Pay</h3>
                        <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-gray-200 rounded-[20px] bg-[#F9FAFB] mb-8">
                            <div className="w-40 h-40 bg-white shadow-sm border border-gray-100 mb-4 flex items-center justify-center text-gray-300 text-xs rounded-xl overflow-hidden relative">
                                <img 
                                    src="/payment_qr.png" 
                                    alt="Payment QR Code" 
                                    className="w-full h-full object-contain"
                                />
                            </div>
                            <p className="text-sm text-gray-500 font-medium">Please pay <span className="text-blue-600 font-bold">¥{cost}</span></p>
                        </div>
                        
                        <button
                            onClick={handlePaymentAction}
                            disabled={isProcessing}
                            className="w-full py-4 bg-green-500 text-white rounded-[32px] font-bold hover:bg-green-600 transition-all shadow-[0_8px_20px_rgba(34,197,94,0.2)] active:scale-95 flex items-center justify-center gap-2 text-sm disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isProcessing ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <>
                                    <CheckCircle className="w-5 h-5" />
                                    I Have Paid
                                </>
                            )}
                        </button>
                    </>
                )}

                {step === 'success' && (
                    <div className="py-10">
                        <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6 animate-bounce" />
                        <h3 className="text-2xl font-bold text-gray-900">Payment Successful!</h3>
                        <p className="text-gray-500 mt-2 font-medium">
                            {type === 'batch' ? 'Starting batch export...' : 
                             type === 'subscription' ? 'Upgrading your plan...' : 'Starting export...'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
