import React, { useCallback, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, ChevronRight, Database,
  Lightbulb, Loader2, Search, Sparkles, ExternalLink,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';

// ──────────────────────────────────────────────────────────────────────────────
// Types matching the backend payload
// ──────────────────────────────────────────────────────────────────────────────

interface StageEvent {
  type: 'stage';
  stage: string;
  title: string;
  status: 'active' | 'done';
  content?: string;
}

interface ErrorEvent { type: 'error'; content: string; }

interface Paper {
  title: string; authors: string; year: string | number;
  doi: string | null; url: string | null; abstract: string | null;
  source: string; source_type: 'peer-reviewed' | 'preprint';
}

interface Structure {
  material_id: string; formula: string; crystal_system: string;
  space_group: string | null; energy_above_hull: string;
  theoretical: boolean | null; selection_reason: string;
}

interface Blueprint {
  why_this_idea: string;
  what_can_be_calculated: string;
  structure_source: {
    formula: string; phase_or_polymorph: string;
    material_id: string | null; source_reason: string;
  };
  modeling_recipe: {
    starting_point: string; cell_choice: string;
    supercell: string; slab: string | null;
    defect_or_doping: string | null; migration: string | null;
  };
  literature_rationale: string;
  caution_notes: string[];
  first_step: string;
  second_step: string;
  handoff_prompt: string;
}

interface IdeaCard {
  id: string; title: string; material_family: string;
  fit_reason: string; literature_basis: string;
  recommended_model_type: string;
  target_properties: string[];
  starter_friendly: boolean;
  difficulty: 'starter' | 'intermediate' | 'advanced';
  confidence: 'high' | 'medium' | 'low';
  directly_supported: boolean;
  blueprint: Blueprint;
}

interface Handoff {
  idea_id: string; idea_title: string;
  formula: string; phase: string | null;
  material_id: string | null; source: string;
  model_type: string; supercell: string | null;
  target_property: string | null;
  handoff_prompt: string | null; rationale: string | null;
}

interface CompleteData {
  summary: string;
  user_goal: { interpreted_goal: string; user_profile: string; depth: string };
  idea_cards: IdeaCard[];
  recommended_idea_id: string;
  papers: Paper[];
  structures: Structure[];
  handoff: Handoff | null;
}

type AgentEvent = StageEvent | ErrorEvent | { type: 'complete'; data: CompleteData };

// ──────────────────────────────────────────────────────────────────────────────
// Small UI helpers
// ──────────────────────────────────────────────────────────────────────────────

const DIFFICULTY_STYLE: Record<string, string> = {
  starter: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  intermediate: 'bg-amber-50 text-amber-700 border-amber-200',
  advanced: 'bg-rose-50 text-rose-700 border-rose-200',
};

const CONFIDENCE_DOT: Record<string, string> = {
  high: 'bg-emerald-400',
  medium: 'bg-amber-400',
  low: 'bg-gray-300',
};

const SOURCE_COLOR: Record<string, string> = {
  CrossRef: 'text-blue-600',
  OpenAlex: 'text-violet-600',
  arXiv: 'text-rose-600',
  CORE: 'text-teal-600',
};

// ──────────────────────────────────────────────────────────────────────────────
// Stage timeline entry
// ──────────────────────────────────────────────────────────────────────────────

const StageRow: React.FC<{ ev: StageEvent }> = ({ ev }) => (
  <div className="flex items-start gap-3">
    <div className="mt-0.5 shrink-0">
      {ev.status === 'active'
        ? <Loader2 size={14} className="text-indigo-400 animate-spin" />
        : <span className="block w-3.5 h-3.5 rounded-full bg-emerald-400" />}
    </div>
    <div className="min-w-0 flex-1">
      <p className={`text-xs font-semibold ${ev.status === 'active' ? 'text-gray-500' : 'text-gray-700'}`}>
        {ev.title}
      </p>
      {ev.content && ev.status === 'done' && (
        <div className="mt-0.5 space-y-0.5">
          {ev.content.split('\n').map((line, i) => (
            <p key={i} className="text-[11px] text-gray-400 leading-relaxed truncate" title={line}>
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────────
// Idea card (center panel)
// ──────────────────────────────────────────────────────────────────────────────

const IdeaCardItem: React.FC<{
  card: IdeaCard; selected: boolean; recommended: boolean;
  onClick: () => void;
}> = ({ card, selected, recommended, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full text-left rounded-[20px] border p-4 transition-all ${selected
      ? 'border-indigo-400 ring-2 ring-indigo-100 bg-indigo-50/30'
      : 'border-gray-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/20'
    } shadow-[0_2px_8px_rgba(0,0,0,0.04)]`}
  >
    {/* Header row */}
    <div className="flex items-start justify-between gap-2 mb-2">
      <div className="flex items-start gap-2">
        <Lightbulb size={14} className="shrink-0 mt-0.5 text-indigo-500" />
        <p className="text-xs font-bold text-[#0A1128] leading-snug">{card.title}</p>
      </div>
      {recommended && (
        <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest bg-indigo-600 text-white px-2 py-0.5 rounded-full">
          Recommended
        </span>
      )}
    </div>

    {/* Tags */}
    <div className="flex flex-wrap gap-1.5 mb-2">
      <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${DIFFICULTY_STYLE[card.difficulty] || ''}`}>
        {card.difficulty}
      </span>
      <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-500">
        {card.recommended_model_type}
      </span>
      {card.target_properties.slice(0, 2).map((p) => (
        <span key={p} className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-gray-100 bg-white text-gray-400">
          {p}
        </span>
      ))}
    </div>

    <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">{card.fit_reason}</p>

    {/* Confidence indicator */}
    <div className="mt-2 flex items-center gap-1.5">
      <span className={`block w-2 h-2 rounded-full ${CONFIDENCE_DOT[card.confidence]}`} />
      <span className="text-[10px] text-gray-400">
        {card.confidence} confidence · {card.directly_supported ? 'Platform ready' : 'Manual setup needed'}
      </span>
    </div>
  </button>
);

// ──────────────────────────────────────────────────────────────────────────────
// Blueprint panel (right)
// ──────────────────────────────────────────────────────────────────────────────

const BlueprintPanel: React.FC<{
  card: IdeaCard;
  onHandoff: (card: IdeaCard) => void;
}> = ({ card, onHandoff }) => {
  const bp = card.blueprint;
  if (!bp) return (
    <div className="h-full flex items-center justify-center text-xs text-gray-400">
      No blueprint data for this idea.
    </div>
  );
  const recipe = bp.modeling_recipe || {} as Blueprint['modeling_recipe'];
  const src = bp.structure_source || {} as Blueprint['structure_source'];
  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      {/* Title */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-1">Modeling Blueprint</p>
        <h3 className="text-base font-black text-[#0A1128] leading-snug">{card.title}</h3>
        <p className="mt-1 text-xs text-gray-500">{card.material_family}</p>
      </div>

      {/* Why */}
      <div className="rounded-[16px] bg-indigo-50/50 border border-indigo-100 p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-1">Why this idea</p>
        <p className="text-xs text-gray-700 leading-relaxed">{bp.why_this_idea}</p>
      </div>

      {/* What can be calculated */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">What can be calculated</p>
        <p className="text-xs text-gray-600 leading-relaxed">{bp.what_can_be_calculated}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(card.target_properties || []).map((p) => (
            <span key={p} className="text-[9px] font-mono bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full text-gray-500">{p}</span>
          ))}
        </div>
      </div>

      {/* Structure source */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Structure source</p>
        <div className="rounded-[14px] border border-gray-100 bg-white p-3 space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-[#0A1128]">{src.formula}</span>
            {src.material_id && (
              <span className="text-[10px] text-gray-400 font-mono">{src.material_id}</span>
            )}
          </div>
          {src.phase_or_polymorph && (
            <p className="text-gray-500">{src.phase_or_polymorph}</p>
          )}
          <p className="text-gray-400 text-[11px] leading-relaxed">{src.source_reason}</p>
        </div>
      </div>

      {/* Modeling recipe */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Modeling recipe</p>
        <div className="rounded-[14px] border border-gray-100 bg-white p-3 space-y-2 text-xs text-gray-600">
          {recipe.starting_point && <div><span className="font-semibold text-gray-700">Starting point: </span>{recipe.starting_point}</div>}
          {recipe.cell_choice && <div><span className="font-semibold text-gray-700">Cell choice: </span>{recipe.cell_choice}</div>}
          {recipe.supercell && <div><span className="font-semibold text-gray-700">Supercell: </span>{recipe.supercell}</div>}
          {recipe.slab && <div><span className="font-semibold text-gray-700">Slab: </span>{recipe.slab}</div>}
          {recipe.defect_or_doping && <div><span className="font-semibold text-gray-700">Defect/Doping: </span>{recipe.defect_or_doping}</div>}
          {recipe.migration && <div><span className="font-semibold text-gray-700">Migration: </span>{recipe.migration}</div>}
        </div>
      </div>

      {/* Literature rationale */}
      <div className="rounded-[14px] bg-emerald-50/40 border border-emerald-100 p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-1">Literature rationale</p>
        <p className="text-xs text-gray-700 leading-relaxed">{bp.literature_rationale}</p>
      </div>

      {/* Cautions */}
      {(bp.caution_notes?.length ?? 0) > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1">Watch out</p>
          <ul className="space-y-1">
            {bp.caution_notes.map((n, i) => (
              <li key={i} className="text-[11px] text-gray-500 flex gap-2">
                <span className="shrink-0 text-amber-400">·</span>{n}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Steps */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Recommended path</p>
        {bp.first_step && (
          <div className="flex items-start gap-2 text-xs">
            <span className="shrink-0 font-bold text-indigo-600">①</span>
            <p className="text-gray-600 leading-relaxed">{bp.first_step}</p>
          </div>
        )}
        {bp.second_step && (
          <div className="flex items-start gap-2 text-xs">
            <span className="shrink-0 font-bold text-gray-400">②</span>
            <p className="text-gray-500 leading-relaxed">{bp.second_step}</p>
          </div>
        )}
      </div>

      {/* Handoff button */}
      <button
        onClick={() => onHandoff(card)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#0A1128] text-white rounded-[24px] text-sm font-semibold hover:bg-[#162044] transition-colors"
      >
        <ArrowRight size={14} />
        Send to Modeling Agent
      </button>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Paper card
// ──────────────────────────────────────────────────────────────────────────────

const PaperCard: React.FC<{ paper: Paper }> = ({ paper }) => (
  <div className="rounded-[14px] border border-gray-100 bg-white p-3 shadow-[0_2px_6px_rgba(0,0,0,0.03)]">
    <div className="flex items-start justify-between gap-2">
      <p className="text-[11px] font-semibold text-[#0A1128] leading-snug">{paper.title}</p>
      <span className={`shrink-0 text-[9px] font-bold uppercase tracking-widest ${SOURCE_COLOR[paper.source] || 'text-gray-400'}`}>
        {paper.source}
      </span>
    </div>
    <p className="mt-0.5 text-[10px] text-gray-400">{paper.authors} · {paper.year}</p>
    {paper.source_type === 'preprint' && (
      <span className="inline-block mt-1 text-[9px] bg-rose-50 text-rose-500 border border-rose-100 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-widest">
        preprint
      </span>
    )}
    {paper.abstract && (
      <p className="mt-1.5 text-[10px] text-gray-500 leading-relaxed line-clamp-2">{paper.abstract}</p>
    )}
    {paper.url && (
      <a href={paper.url} target="_blank" rel="noopener noreferrer"
        className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-indigo-500 hover:text-indigo-700 font-mono">
        {paper.doi || paper.url.slice(0, 40)} <ExternalLink size={9} />
      </a>
    )}
  </div>
);

// ──────────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────────

const IdeaAgent: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [stages, setStages] = useState<StageEvent[]>([]);
  const [result, setResult] = useState<CompleteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const selectedCard = result?.idea_cards.find((c) => c.id === selectedIdeaId) ?? null;

  const updateStage = useCallback((ev: StageEvent) => {
    setStages((prev) => {
      const idx = prev.findIndex((s) => s.stage === ev.stage);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = ev;
        return next;
      }
      return [...prev, ev];
    });
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  const handleSearch = async () => {
    if (!query.trim() || isStreaming) return;
    setIsStreaming(true);
    setStages([]);
    setResult(null);
    setError(null);
    setSelectedIdeaId(null);

    try {
      const response = await fetch(`${API_BASE_URL}/agent/retrieve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: query }),
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;
          try {
            const ev: AgentEvent = JSON.parse(jsonStr);
            if (ev.type === 'stage') updateStage(ev);
            if (ev.type === 'complete') {
              setResult(ev.data);
              setSelectedIdeaId(ev.data.recommended_idea_id || ev.data.idea_cards[0]?.id || null);
            }
            if (ev.type === 'error') setError(ev.content);
          } catch { /* ignore malformed */ }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsStreaming(false);
    }
  };

  const handleHandoff = (card: IdeaCard) => {
    const params = new URLSearchParams();
    if (card.blueprint?.handoff_prompt) {
      params.set('prompt', card.blueprint.handoff_prompt);
    }
    if (card.blueprint?.structure_source?.formula) {
      params.set('material', card.blueprint.structure_source.formula);
    }
    if (card.blueprint?.structure_source?.material_id) {
      params.set('mpid', card.blueprint.structure_source.material_id);
    }
    if (card.blueprint?.structure_source?.phase_or_polymorph) {
      params.set('phase', card.blueprint.structure_source.phase_or_polymorph);
    }
    navigate(`/agent/modeling?${params.toString()}`);
  };

  const hasResult = result !== null;

  return (
    <div className="flex h-screen w-full bg-[#F5F5F0] p-5 gap-4 overflow-hidden">

      {/* ── Left: reasoning timeline + input ── */}
      <div className="w-[300px] shrink-0 flex flex-col rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button onClick={() => navigate('/')} className="p-1 hover:bg-gray-100 rounded-full transition-colors text-gray-400">
              <ArrowLeft size={15} />
            </button>
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-indigo-600" />
              <h2 className="text-xs font-black text-[#0A1128] tracking-wide uppercase">Idea Agent</h2>
            </div>
          </div>
          <span className="text-[9px] font-mono font-bold text-indigo-400 uppercase tracking-widest bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
            v2.0
          </span>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {stages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center h-full text-center opacity-50 gap-3">
              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500">
                <Sparkles size={24} />
              </div>
              <p className="text-xs font-bold text-[#0A1128]">Idea Agent</p>
              <p className="text-[11px] text-gray-400 max-w-[200px] leading-relaxed">
                Describe your battery/materials research goal. The agent will propose literature-grounded computational ideas.
              </p>
              <div className="flex flex-col gap-1.5 w-full mt-1">
                {[
                  'NaCoO2 理论计算，我做实验想补充计算内容',
                  '研究掺杂改善 Na-ion 正极倍率性能',
                  'Li-ion 扩散机制，NEB 计算怎么起步',
                ].map((s) => (
                  <button key={s} onClick={() => setQuery(s)}
                    className="text-left text-[11px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-[12px] px-3 py-1.5 hover:bg-indigo-100 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {stages.map((ev, i) => <StageRow key={i} ev={ev} />)}

          {error && (
            <div className="text-[11px] text-red-500 bg-red-50 border border-red-100 rounded-[12px] px-3 py-2">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-100">
          <div className="relative">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSearch(); } }}
              disabled={isStreaming}
              rows={3}
              placeholder="描述你的研究目标..."
              className="w-full resize-none bg-gray-50 border border-gray-200 rounded-2xl py-2.5 px-3 pr-10 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-all disabled:opacity-50"
            />
            <button onClick={handleSearch} disabled={isStreaming || !query.trim()}
              className="absolute right-2 bottom-2 w-7 h-7 flex items-center justify-center bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed">
              {isStreaming ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-gray-400 text-center">Shift+Enter 换行 · Enter 提交</p>
        </div>
      </div>

      {/* ── Center: idea cards ── */}
      <div className="w-[340px] shrink-0 flex flex-col rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-xs font-black text-[#0A1128] uppercase tracking-wide flex items-center gap-2">
            <Lightbulb size={14} className="text-amber-500" /> Research Ideas
          </h2>
          {hasResult && (
            <p className="mt-0.5 text-[10px] text-gray-400">{result.idea_cards.length} ideas generated</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!hasResult && !isStreaming && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center opacity-30">
                <Lightbulb size={40} className="text-gray-400 mx-auto mb-2" />
                <p className="text-xs font-bold text-gray-400">Ideas will appear here</p>
              </div>
            </div>
          )}

          {isStreaming && !hasResult && (
            <div className="flex items-center justify-center h-full gap-2 text-gray-400">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-xs">Generating ideas...</span>
            </div>
          )}

          {hasResult && result.idea_cards.map((card) => (
            <IdeaCardItem
              key={card.id}
              card={card}
              selected={selectedIdeaId === card.id}
              recommended={card.id === result.recommended_idea_id}
              onClick={() => setSelectedIdeaId(card.id)}
            />
          ))}

          {hasResult && result.papers.length > 0 && (
            <div className="pt-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1.5">
                <BookOpen size={11} /> Literature Evidence ({result.papers.length})
              </p>
              <div className="space-y-2">
                {result.papers.slice(0, 5).map((p, i) => <PaperCard key={i} paper={p} />)}
              </div>
            </div>
          )}
        </div>

        {hasResult && result.summary && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
            <p className="text-[10px] text-gray-500 leading-relaxed">{result.summary}</p>
          </div>
        )}
      </div>

      {/* ── Right: blueprint detail ── */}
      <div className="flex-1 rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5 overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-black text-[#0A1128] uppercase tracking-wide flex items-center gap-2">
              <Database size={14} className="text-indigo-500" /> Modeling Blueprint
            </h2>
            <p className="mt-0.5 text-[10px] text-gray-400">
              {selectedCard ? 'Select an idea to view its detailed modeling recipe.' : 'Click an idea card to view blueprint.'}
            </p>
          </div>
          {result?.structures && result.structures.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-gray-400">
              <Database size={10} />
              <span>{result.structures.length} MP structures</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-hidden">
          {!selectedCard && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center opacity-30">
                <ChevronRight size={40} className="text-gray-400 mx-auto mb-2" />
                <p className="text-xs font-bold text-gray-400">Select an idea to view blueprint</p>
              </div>
            </div>
          )}

          {selectedCard && (
            <BlueprintPanel card={selectedCard} onHandoff={handleHandoff} />
          )}
        </div>
      </div>
    </div>
  );
};

export default IdeaAgent;
