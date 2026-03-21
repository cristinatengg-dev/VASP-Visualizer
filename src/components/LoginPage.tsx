import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Mail, Lock, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { useNavigate } from 'react-router-dom';

export const LoginPage: React.FC = () => {
    const { login } = useStore();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (countdown > 0) {
            timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        }
        return () => clearTimeout(timer);
    }, [countdown]);

    const handleSendCode = async () => {
        if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
            setError('Please enter a valid email address');
            return;
        }
        
        setError('');
        setIsSending(true);
        try {
            const res = await fetch(`${API_BASE_URL}/auth/send-email-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const contentType = res.headers.get('content-type') || '';
            const isJson = contentType.includes('application/json');
            const data = isJson ? await res.json() : null;
            if (!res.ok) {
                if (isJson) throw new Error(data?.error || `HTTP ${res.status}`);
                const text = await res.text().catch(() => '');
                throw new Error(text || `HTTP ${res.status}`);
            }
            
            if (data.success) {
                setCountdown(60);
                setSuccessMessage(data.message || 'Verification code sent to your email.');
            } else {
                setError(data.error || 'Failed to send code');
            }
        } catch (e: any) {
            setError(e?.message || 'Network error');
        } finally {
            setIsSending(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !code) return;
        
        setError('');
        setIsLoggingIn(true);
        try {
            await login(email, code);
            // Login successful — navigate to main app
            navigate('/app', { replace: true });
        } catch (e: any) {
            setError(e.message || 'Login failed');
        } finally {
            setIsLoggingIn(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-[32px] shadow-[0_4px_30px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col ring-1 ring-black/5">
                <div className="p-8 text-center bg-white border-b border-gray-50">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ShieldCheck className="w-8 h-8 text-[#0A1128]" />
                    </div>
                    <h1 className="text-2xl font-bold text-[#0A1128] mb-1">SCI Visualizer</h1>
                    <p className="text-gray-400 text-sm">Secure Research Platform</p>
                </div>

                <div className="p-10">
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2 ml-1">Email Address</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                                        <Mail className="h-4 w-4 text-gray-500" />
                                    </div>
                                </div>
                                <input
                                    type="email"
                                    className="block w-full pl-14 pr-4 py-3.5 border border-gray-200 rounded-[24px] bg-gray-50 focus:ring-2 focus:ring-[#0A1128]/20 focus:border-[#0A1128] transition-all outline-none text-gray-800 placeholder-gray-400"
                                    placeholder="Enter your email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2 ml-1">Verification Code</label>
                            <div className="flex gap-3">
                                <div className="relative flex-1">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                                            <Lock className="h-4 w-4 text-gray-500" />
                                        </div>
                                    </div>
                                    <input
                                        type="text"
                                        className="block w-full pl-14 pr-4 py-3.5 border border-gray-200 rounded-[24px] bg-gray-50 focus:ring-2 focus:ring-[#0A1128]/20 focus:border-[#0A1128] transition-all outline-none text-gray-800 placeholder-gray-400"
                                        placeholder="6-digit code"
                                        value={code}
                                        onChange={(e) => setCode(e.target.value)}
                                        maxLength={6}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleSendCode}
                                    disabled={countdown > 0 || isSending || !email}
                                    className={`px-5 py-3 rounded-[32px] text-sm font-semibold transition-all w-36 flex items-center justify-center shadow-sm
                                        ${countdown > 0 
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                            : 'bg-white border border-gray-200 text-[#0A1128] hover:bg-gray-50 hover:border-gray-300'
                                        }`}
                                >
                                    {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : 
                                     countdown > 0 ? `${countdown}s` : 'Get Code'}
                                </button>
                            </div>
                        </div>

                        {successMessage && (
                            <div className="p-4 bg-green-50 text-green-700 text-sm rounded-[20px] flex items-start gap-3 border border-green-100">
                                <span className="mt-1.5 block w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                                {successMessage}
                            </div>
                        )}

                        {error && (
                            <div className="p-4 bg-red-50 text-red-600 text-sm rounded-[20px] flex items-start gap-3 border border-red-100">
                                <span className="mt-1.5 block w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoggingIn || !email || !code}
                            className="w-full flex items-center justify-center gap-2 py-4 px-6 border border-transparent rounded-[32px] shadow-lg shadow-[#0A1128]/20 text-sm font-bold text-white bg-[#0A1128] hover:bg-[#162044] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0A1128] disabled:opacity-70 disabled:cursor-not-allowed transition-all active:scale-95"
                        >
                            {isLoggingIn ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Verifying...
                                </>
                            ) : (
                                <>
                                    Sign In securely
                                    <ArrowRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </form>
                    
                    <p className="mt-8 text-center text-xs text-gray-400 leading-relaxed">
                        Protected by Enterprise Grade Security. <br/>
                        Device limit: 3 active sessions max. <br/>
                        &copy; {new Date().getFullYear()} SCI Visualizer. All rights reserved.
                    </p>
                </div>
            </div>
        </div>
    );
};
