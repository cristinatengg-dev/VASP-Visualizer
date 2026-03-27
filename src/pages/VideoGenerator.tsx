import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Film, Play, Loader2, CheckCircle2, XCircle,
  Download, RefreshCw, Sparkles, Clock,
} from 'lucide-react';
import { API_BASE_URL } from '../config';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Shot {
  id: string;
  label: string;
  agent: string | null;
  duration: number;
  prompt: string;
}

interface TaskState {
  shotId: string;
  taskId?: string;
  status: 'idle' | 'submitting' | 'pending' | 'running' | 'succeeded' | 'failed';
  videoUrl?: string;
  error?: string;
}

// ─── Status badge ────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  idle: { bg: 'bg-gray-50', text: 'text-gray-400', icon: <Clock size={12} /> },
  submitting: { bg: 'bg-blue-50', text: 'text-blue-500', icon: <Loader2 size={12} className="animate-spin" /> },
  pending: { bg: 'bg-amber-50', text: 'text-amber-600', icon: <Loader2 size={12} className="animate-spin" /> },
  running: { bg: 'bg-indigo-50', text: 'text-indigo-600', icon: <Loader2 size={12} className="animate-spin" /> },
  succeeded: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: <CheckCircle2 size={12} /> },
  failed: { bg: 'bg-red-50', text: 'text-red-500', icon: <XCircle size={12} /> },
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = STATUS_STYLE[status] || STATUS_STYLE.idle;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${s.bg} ${s.text}`}>
      {s.icon} {status}
    </span>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

const VideoGenerator: React.FC = () => {
  const navigate = useNavigate();
  const [shots, setShots] = useState<Shot[]>([]);
  const [tasks, setTasks] = useState<Map<string, TaskState>>(new Map());
  const [isGenerating, setIsGenerating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load shots on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/video/promo-shots`)
      .then((r) => r.json())
      .then((data) => {
        setShots(data.shots || []);
        const initial = new Map<string, TaskState>();
        for (const s of data.shots || []) {
          initial.set(s.id, { shotId: s.id, status: 'idle' });
        }
        setTasks(initial);
      })
      .catch(console.error);
  }, []);

  // Poll running tasks
  const pollTasks = useCallback(async () => {
    const activeTasks = Array.from(tasks.values()).filter(
      (t) => t.taskId && (t.status === 'pending' || t.status === 'running')
    );
    if (activeTasks.length === 0) return;

    for (const task of activeTasks) {
      try {
        const resp = await fetch(`${API_BASE_URL}/video/status/${task.taskId}`);
        const data = await resp.json();
        setTasks((prev) => {
          const next = new Map(prev);
          const existing = next.get(task.shotId);
          if (existing) {
            next.set(task.shotId, {
              ...existing,
              status: data.status === 'succeeded' ? 'succeeded' : data.status === 'failed' ? 'failed' : existing.status,
              videoUrl: data.videoUrl || existing.videoUrl,
              error: data.error?.message || existing.error,
            });
          }
          return next;
        });
      } catch {
        // ignore poll errors
      }
    }
  }, [tasks]);

  useEffect(() => {
    pollRef.current = setInterval(pollTasks, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [pollTasks]);

  // Generate all
  const handleGenerateAll = async () => {
    setIsGenerating(true);
    // Mark all as submitting
    setTasks((prev) => {
      const next = new Map(prev);
      for (const [id, t] of next) {
        next.set(id, { ...t, status: 'submitting', videoUrl: undefined, error: undefined });
      }
      return next;
    });

    try {
      const resp = await fetch(`${API_BASE_URL}/video/generate-promo`, { method: 'POST' });
      const data = await resp.json();
      if (data.tasks) {
        setTasks((prev) => {
          const next = new Map(prev);
          for (const t of data.tasks) {
            next.set(t.shotId, {
              shotId: t.shotId,
              taskId: t.taskId,
              status: t.error ? 'failed' : 'pending',
              error: t.error,
            });
          }
          return next;
        });
      }
    } catch (e) {
      console.error('Generate promo failed:', e);
    } finally {
      setIsGenerating(false);
    }
  };

  // Generate single shot
  const handleGenerateSingle = async (shot: Shot) => {
    setTasks((prev) => {
      const next = new Map(prev);
      next.set(shot.id, { shotId: shot.id, status: 'submitting' });
      return next;
    });

    try {
      const resp = await fetch(`${API_BASE_URL}/video/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: shot.prompt, duration: shot.duration }),
      });
      const data = await resp.json();
      setTasks((prev) => {
        const next = new Map(prev);
        next.set(shot.id, {
          shotId: shot.id,
          taskId: data.taskId,
          status: data.error ? 'failed' : 'pending',
          error: data.error,
        });
        return next;
      });
    } catch (e) {
      setTasks((prev) => {
        const next = new Map(prev);
        next.set(shot.id, { shotId: shot.id, status: 'failed', error: String(e) });
        return next;
      });
    }
  };

  const succeededCount = Array.from(tasks.values()).filter((t) => t.status === 'succeeded').length;
  const totalCount = shots.length;

  return (
    <div className="min-h-screen bg-[#F5F5F0]">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-50 rounded-full transition-colors">
              <ArrowLeft size={20} className="text-gray-500" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[12px] bg-[#0A1128] flex items-center justify-center shadow-lg shadow-blue-900/10">
                <Film size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-[#0A1128]">VIDEO GENERATOR</h1>
                <p className="text-[9px] text-gray-400 font-mono tracking-widest uppercase">Seedance 2.0 — Promo Pipeline</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 font-mono">
              {succeededCount}/{totalCount} completed
            </span>
            <button
              onClick={handleGenerateAll}
              disabled={isGenerating}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#0A1128] text-white text-sm font-semibold rounded-full hover:bg-[#162044] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/15"
            >
              {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Generate All 8 Shots
            </button>
          </div>
        </div>
      </header>

      {/* Shot list */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-4">
        {shots.map((shot, idx) => {
          const task = tasks.get(shot.id);
          const status = task?.status || 'idle';

          return (
            <div
              key={shot.id}
              className="bg-white rounded-[20px] border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden"
            >
              <div className="p-5">
                {/* Shot header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#0A1128] flex items-center justify-center text-white text-xs font-bold">
                      {idx + 1}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#0A1128]">{shot.label}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        {shot.agent && (
                          <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full border border-indigo-100">
                            {shot.agent}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400 font-mono">{shot.duration}s</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusBadge status={status} />
                    <button
                      onClick={() => handleGenerateSingle(shot)}
                      disabled={status === 'submitting' || status === 'pending' || status === 'running'}
                      className="p-2 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-30"
                      title="Generate this shot"
                    >
                      <RefreshCw size={14} className="text-gray-400" />
                    </button>
                  </div>
                </div>

                {/* Prompt */}
                <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-3 mb-3">
                  {shot.prompt}
                </p>

                {/* Error */}
                {task?.error && (
                  <div className="text-[11px] text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3">
                    {task.error}
                  </div>
                )}

                {/* Video preview */}
                {task?.videoUrl && (
                  <div className="rounded-xl overflow-hidden border border-gray-100 bg-black">
                    <video
                      src={task.videoUrl}
                      controls
                      className="w-full aspect-video"
                      preload="metadata"
                    />
                    <div className="flex items-center justify-end gap-2 p-2 bg-gray-50">
                      <a
                        href={task.videoUrl}
                        download={`${shot.id}.mp4`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 bg-[#0A1128] text-white text-[10px] font-bold rounded-lg hover:bg-[#162044] transition-colors"
                      >
                        <Download size={10} /> Download MP4
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {shots.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <Film size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Loading storyboard...</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default VideoGenerator;
