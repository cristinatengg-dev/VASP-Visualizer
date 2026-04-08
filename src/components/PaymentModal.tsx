import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { useStore } from '../store/useStore';

interface PaymentModalProps {
    cost: number;
    type: 'img' | 'vid' | 'batch' | 'subscription';
    count?: number;
    planName?: string;
    tier?: string;
    onConfirm: () => void;
    onClose: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ cost, type, count, planName, tier, onConfirm, onClose }) => {
    const [step, setStep] = useState<'confirm' | 'creating' | 'paying' | 'success' | 'error'>('confirm');
    const [orderId, setOrderId] = useState<string | null>(null);
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string>('');
    const [isChecking, setIsChecking] = useState(false);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const { createPayment, pollPayment } = useStore();

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, []);

    // Start polling when entering paying step
    useEffect(() => {
        if (step !== 'paying' || !orderId) return;

        pollingRef.current = setInterval(async () => {
            const paid = await pollPayment(orderId);
            if (paid) {
                if (pollingRef.current) clearInterval(pollingRef.current);
                setStep('success');
                setTimeout(() => onConfirm(), 1000);
            }
        }, 3000);

        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [step, orderId, pollPayment, onConfirm]);

    const handlePay = useCallback(async () => {
        if (cost === 0) {
            onConfirm();
            return;
        }

        setStep('creating');

        const result = await createPayment(type, tier, count);

        if (!result || !result.success) {
            setErrorMsg(result?.orderId ? 'Order creation failed' : 'Network error');
            setStep('error');
            return;
        }

        // Free after server-side check
        if (result.free) {
            setStep('success');
            setTimeout(() => onConfirm(), 1000);
            return;
        }

        setOrderId(result.orderId!);
        setQrCode(result.qrCode || null);
        setStep('paying');
    }, [cost, type, tier, count, createPayment, onConfirm]);

    const handleManualCheck = async () => {
        if (!orderId || isChecking) return;
        setIsChecking(true);
        try {
            const paid = await pollPayment(orderId);
            if (paid) {
                if (pollingRef.current) clearInterval(pollingRef.current);
                setStep('success');
                setTimeout(() => onConfirm(), 1000);
            }
        } finally {
            setIsChecking(false);
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

                {step === 'creating' && (
                    <div className="py-10">
                        <Loader2 className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-spin" />
                        <h3 className="text-lg font-bold text-gray-900">Creating Order...</h3>
                        <p className="text-sm text-gray-400 mt-1">Please wait</p>
                    </div>
                )}

                {step === 'paying' && (
                    <>
                        <h3 className="text-xl font-bold text-gray-900 mb-4">Scan to Pay</h3>
                        <div className="flex flex-col items-center justify-center py-6 border-2 border-dashed border-gray-200 rounded-[20px] bg-[#F9FAFB] mb-6">
                            <div className="w-44 h-44 bg-white shadow-sm border border-gray-100 mb-4 flex items-center justify-center text-gray-300 text-xs rounded-xl overflow-hidden relative">
                                {qrCode ? (
                                    <img
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qrCode)}`}
                                        alt="Payment QR Code"
                                        className="w-full h-full object-contain"
                                    />
                                ) : (
                                    <img
                                        src="/payment_qr.png"
                                        alt="Payment QR Code"
                                        className="w-full h-full object-contain"
                                    />
                                )}
                            </div>
                            <p className="text-sm text-gray-500 font-medium">
                                Please pay <span className="text-blue-600 font-bold">¥{cost}</span>
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                                Use Alipay to scan the QR code
                            </p>
                        </div>

                        <div className="flex items-center justify-center gap-2 mb-4 text-xs text-gray-400">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Auto-detecting payment...</span>
                        </div>

                        <button
                            onClick={handleManualCheck}
                            disabled={isChecking}
                            className="w-full py-4 bg-green-500 text-white rounded-[32px] font-bold hover:bg-green-600 transition-all shadow-[0_8px_20px_rgba(34,197,94,0.2)] active:scale-95 flex items-center justify-center gap-2 text-sm disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isChecking ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
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

                {step === 'error' && (
                    <div className="py-10">
                        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Order Failed</h3>
                        <p className="text-sm text-gray-500 mb-6">{errorMsg || 'Please try again later.'}</p>
                        <button
                            onClick={() => setStep('confirm')}
                            className="w-full py-3 bg-gray-100 text-gray-700 rounded-[24px] font-semibold hover:bg-gray-200 transition-all text-sm"
                        >
                            Try Again
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
