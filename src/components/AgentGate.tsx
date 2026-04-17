import React, { useEffect, useState } from 'react';
import { Lock, Sparkles, Crown, Zap, ArrowRight } from 'lucide-react';
import { useStore } from '../store/useStore';
import { API_BASE_URL } from '../config';
import { SubscriptionPanel } from './SubscriptionPanel';

interface AgentAccessResult {
  allowed: boolean;
  reason?: string;
  message?: string;
  upgrade_hint?: string;
  is_free_usage?: boolean;
  quota?: { used: number; limit: number; remaining: number };
}

interface AgentGateProps {
  agent: string;
  label: string;
  children: React.ReactNode;
}

const AGENT_LABELS: Record<string, string> = {
  modeling: 'Modeling Agent',
  compute: 'Compute Agent',
  rendering: 'Rendering Agent',
  cover: 'Cover Agent',
  retrieval: 'Idea Agent',
};

export const AgentGate: React.FC<AgentGateProps> = ({ agent, label, children }) => {
  const { user } = useStore();
  const [access, setAccess] = useState<AgentAccessResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSubscription, setShowSubscription] = useState(false);

  useEffect(() => {
    if (!user) {
      setAccess({ allowed: false, reason: 'login_required', message: '请先登录' });
      setLoading(false);
      return;
    }

    // Academic / enterprise — skip API check
    if (user.tier === 'academic' || user.tier === 'enterprise') {
      setAccess({ allowed: true });
      setLoading(false);
      return;
    }

    const checkAccess = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${API_BASE_URL}/agent-access?userId=${encodeURIComponent(user.email)}&agent=${encodeURIComponent(agent)}`
        );
        const data = await res.json();
        if (data.success) {
          setAccess(data);
        } else {
          setAccess({ allowed: true });
        }
      } catch {
        // On error, allow access (fail-open to not block users)
        setAccess({ allowed: true });
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [user, agent]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (access?.allowed) {
    return (
      <>
        {/* Free usage banner */}
        {access.is_free_usage && access.quota && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-center gap-3">
            <span className="text-xs text-amber-700">
              {label} 免费体验 · 今日剩余 <strong>{access.quota.remaining}/{access.quota.limit}</strong> 次
            </span>
            <button
              onClick={() => setShowSubscription(true)}
              className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full hover:bg-amber-200 transition-colors"
            >
              订阅解锁无限次
            </button>
          </div>
        )}

        {/* Cover quota banner */}
        {agent === 'cover' && access.quota && !access.is_free_usage && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-indigo-50 border-b border-indigo-200 px-4 py-2 flex items-center justify-center gap-3">
            <span className="text-xs text-indigo-700">
              本月 Cover 配额：<strong>{access.quota.remaining}/{access.quota.limit}</strong> 张
            </span>
          </div>
        )}

        {children}

        {showSubscription && <SubscriptionPanel onClose={() => setShowSubscription(false)} />}
      </>
    );
  }

  // ── Locked screen ──
  return (
    <>
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-[32px] shadow-[0_8px_60px_rgba(0,0,0,0.08)] ring-1 ring-black/5 p-8 text-center space-y-6">
          {/* Lock icon */}
          <div className="w-20 h-20 mx-auto rounded-[24px] bg-gray-100 flex items-center justify-center">
            <Lock size={32} className="text-gray-400" />
          </div>

          {/* Title */}
          <div>
            <h2 className="text-xl font-black text-[#0A1128]">{label}</h2>
            <p className="text-sm text-gray-500 mt-2">
              {access?.message || '需要订阅才能使用此 Agent'}
            </p>
          </div>

          {/* Upgrade options */}
          <div className="space-y-3 pt-2">
            <button
              onClick={() => setShowSubscription(true)}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#0A1128] text-white text-sm font-bold shadow-lg shadow-blue-900/10 hover:bg-blue-900 transition-all"
            >
              <Zap size={16} />
              订阅 {label} · ¥99/月
            </button>

            <button
              onClick={() => setShowSubscription(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-all"
            >
              <Crown size={14} className="text-amber-500" />
              升级高校端 · 全平台解锁
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Feature hints */}
          <div className="pt-4 border-t border-gray-100">
            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-2">订阅后可以</p>
            <div className="space-y-1.5">
              {agent === 'cover' && (
                <>
                  <p className="text-xs text-gray-500">每月生成 10 张期刊封面</p>
                  <p className="text-xs text-gray-500">AI 自动排版 + 高清导出</p>
                </>
              )}
              {agent === 'compute' && (
                <>
                  <p className="text-xs text-gray-500">VASP 输入集自动编译</p>
                  <p className="text-xs text-gray-500">一键提交到 HPC 集群</p>
                </>
              )}
              {agent === 'modeling' && (
                <>
                  <p className="text-xs text-gray-500">无限次 AI 建模</p>
                  <p className="text-xs text-gray-500">Materials Project / Atomly 数据源</p>
                </>
              )}
              {agent === 'rendering' && (
                <>
                  <p className="text-xs text-gray-500">无限次科学图像渲染</p>
                  <p className="text-xs text-gray-500">PDF 论文自动解析</p>
                </>
              )}
              {agent === 'retrieval' && (
                <>
                  <p className="text-xs text-gray-500">无限次文献检索 + 想法生成</p>
                  <p className="text-xs text-gray-500">跨库搜索 + AI 方案设计</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showSubscription && <SubscriptionPanel onClose={() => setShowSubscription(false)} />}
    </>
  );
};
