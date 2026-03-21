/**
 * HeroSection.tsx — SCI Visualizer 首屏英雄区 v3 (Premium Light)
 *
 * 主题：科研全链路 AI 自动化平台（建模 → 计算 → 可视化）
 *
 * 视觉升级：
 *   1. Canvas 代码瀑布 — OUTCAR 风格连续文本流，极淡深蓝，缓速漂浮
 *   2. 六边形蜂窝晶格 SVG — 材料科学隐喻，opacity 2.8%
 *   3. 三色弥散光晕 — 品牌蓝(左上) + 暖金(右上) + 暖灰(右下)
 *   4. 标题渐变升级 — 冷灰银 #8E9AAF → 品牌蓝 #2E4A8E（非霓虹）
 *   5. 卡片玻璃态 — backdrop-blur-md + bg-white/75 + 内发光阴影
 *   6. 元数据标签 font-mono — MODELING AGENT / BETA / LIVE
 *
 * 设计规范：UI_STYLE.md
 *   - 圆角：卡片 rounded-[24px]，按钮 rounded-[32px]，标签 rounded-[16px]
 *   - 主色：#0A1128 / #1A2A4E / #2E4A8E
 *   - 字体：系统 sans-serif + font-mono for 元数据
 *   - backdrop-blur 仅用于 Hero 营销区，不用于功能型数据组件
 *
 * 依赖：framer-motion, lucide-react, react-router-dom, tailwindcss
 */

import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  ArrowRight,
  Atom,
  Cpu,
  BarChart3,
  ChevronRight,
  LogIn,
  Box,
} from "lucide-react";
import { useStore } from "../store/useStore";

// ─── 动画配置 ─────────────────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: "easeOut" as const },
  },
};

// ─── Agent 数据 ───────────────────────────────────────────────────────────────

interface AgentCard {
  id: string;
  route: string;
  icon: React.ReactNode;
  label: string;
  title: string;
  description: string;
  tag: string;
}

const AGENTS: AgentCard[] = [
  {
    id: "modeling",
    route: "/agent/modeling",
    icon: <Atom size={16} strokeWidth={1.5} className="text-white" />,
    label: "Modeling Agent",
    title: "Natural Language Modeler",
    description:
      "Zero-code, one-prompt driven structure generation across molecules, crystals, and surfaces.",
    tag: "Beta",
  },
  {
    id: "compute",
    route: "/agent/compute",
    icon: <Cpu size={16} strokeWidth={1.5} className="text-white" />,
    label: "Compute Agent",
    title: "Green AI Compute Engine",
    description:
      "Green AI pre-screening on exclusive HPC clusters filters redundant runs to save time and energy.",
    tag: "Beta",
  },
  {
    id: "rendering",
    route: "/app",
    icon: <Box size={16} strokeWidth={1.5} className="text-white" />,
    label: "Rendering Agent",
    title: "Cloud-Native Rendering",
    description:
      "Zero-latency rendering of massive trajectories with automated, industrial-grade insight reports.",
    tag: "Live",
  },
  {
    id: "cover",
    route: "/agent/rendering",
    icon: <Sparkles size={16} strokeWidth={1.5} className="text-white" />,
    label: "Illustration Agent",
    title: "Scientific AI Cover",
    description:
      "Transform research results into journal-ready scientific illustrations and publication covers.",
    tag: "Beta",
  },
];

// ─── Canvas 代码瀑布 ──────────────────────────────────────────────────────────

/**
 * CodeRainCanvas — v3 原版
 *
 * 单字符浮动版：每列显示一个科研关键词/符号，缓慢向下漂移并周期性更换
 * 字符颜色：rgba(10,17,40,0.05) — 极淡品牌深蓝，极度克制
 * 速度：0.25~0.6 px/frame（非常缓慢，像"呼吸"）
 * 密度：列宽 80px（约 20-25 列），大量留白，简约
 */
const CHAR_POOL = [
  // VASP / DFT 关键词
  "ENCUT", "KPOINTS", "IBRION", "NSW", "EDIFF", "SIGMA", "ISMEAR",
  "PREC", "NELM", "ISPIN", "LWAVE", "LORBIT", "POTIM", "TEBEG",
  "Green AI", "Agent", "AI4S", "MaaS", "HPC", "Zero-code", "WebGPU",
  // 物理/数学符号
  "ψ", "Ĥ", "∇²", "∂", "∫", "Σ", "ρ", "ε", "λ", "μ", "φ", "α", "β", "γ",
  "E_xc", "E_tot", "k·p", "ħ", "∞",
  // 元素符号
  "Fe", "Cu", "Ni", "Mo", "W", "Ti", "Li", "Na", "K", "Mg", "Al", "Si",
  "C", "N", "O", "H", "Au", "Pt", "Pd", "Ag", "Co", "Mn", "Zn", "Ca",
  // 计算方法
  "DFT", "MD", "NEB", "AIMD", "GW", "BSE", "TDDFT", "PBE", "LDA",
  // 数值
  "0.001", "2.718", "3.14159", "1e-4", "-0.456", "1.234",
];

const CodeRainCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const FONT_SIZE = 11;
    const COL_WIDTH = 80;   // 列宽（稀疏，20-25列）
    const OPACITY = 0.05;   // 字符透明度，极淡

    const cols = Math.floor(window.innerWidth / COL_WIDTH);

    interface ColState {
      y: number;
      speed: number;
      char: string;
      charTimer: number;
      charInterval: number;
    }

    const columns: ColState[] = Array.from({ length: cols }, () => ({
      y: Math.random() * -window.innerHeight,   // 从上方随机位置开始
      speed: 0.25 + Math.random() * 0.35,        // 极慢速 0.25~0.6
      char: CHAR_POOL[Math.floor(Math.random() * CHAR_POOL.length)],
      charTimer: 0,
      charInterval: 60 + Math.floor(Math.random() * 80), // 字符更换频率（帧）
    }));

    let frameId: number;

    const draw = () => {
      // 半透明白色叠加产生残影尾迹
      ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${FONT_SIZE}px ui-monospace, 'JetBrains Mono', 'Fira Code', monospace`;
      ctx.fillStyle = `rgba(10, 17, 40, ${OPACITY})`;
      ctx.textAlign = "left";

      columns.forEach((col, i) => {
        const x = i * COL_WIDTH + 8;

        // 绘制单个字符
        ctx.fillText(col.char, x, col.y);

        // 向下移动
        col.y += col.speed;

        // 周期性更换字符
        col.charTimer++;
        if (col.charTimer >= col.charInterval) {
          col.char = CHAR_POOL[Math.floor(Math.random() * CHAR_POOL.length)];
          col.charTimer = 0;
          col.charInterval = 60 + Math.floor(Math.random() * 80);
        }

        // 超出底部重置
        if (col.y > canvas.height + 20) {
          col.y = -Math.random() * canvas.height * 0.5;
          col.speed = 0.25 + Math.random() * 0.35;
        }
      });

      frameId = requestAnimationFrame(draw);
    };

    frameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{
        // 顶部和底部 20% 渐隐
        maskImage:
          "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)",
      }}
      aria-hidden="true"
    />
  );
};

// ─── 背景层 ───────────────────────────────────────────────────────────────────

const BackgroundLayer: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">

    {/* ① 六边形蜂窝晶格 SVG（石墨烯/MoS₂ 晶格隐喻） */}
    <svg
      className="absolute inset-0 w-full h-full opacity-[0.028]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id="hex-lattice"
          x="0" y="0"
          width="36" height="41.57"
          patternUnits="userSpaceOnUse"
        >
          <polygon
            points="18,2 33,10.78 33,28.35 18,37.13 3,28.35 3,10.78"
            fill="none"
            stroke="#0A1128"
            strokeWidth="0.8"
          />
          <polygon
            points="36,23.35 51,32.13 51,49.7 36,58.48 21,49.7 21,32.13"
            fill="none"
            stroke="#0A1128"
            strokeWidth="0.8"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hex-lattice)" />
    </svg>

    {/* ② 品牌蓝弥散光晕（左上） */}
    <div
      className="absolute -top-48 -left-48 w-[600px] h-[600px] rounded-full opacity-[0.055]"
      style={{ background: "radial-gradient(circle, #2E4A8E 0%, transparent 65%)" }}
    />

    {/* ③ 暖金弥散光晕（右上，金属光泽感） */}
    <div
      className="absolute -top-32 -right-32 w-[420px] h-[420px] rounded-full opacity-[0.038]"
      style={{ background: "radial-gradient(circle, #C9A84C 0%, transparent 65%)" }}
    />

    {/* ④ 暖灰弥散光晕（右下） */}
    <div
      className="absolute -bottom-24 -right-24 w-[400px] h-[400px] rounded-full opacity-[0.032]"
      style={{ background: "radial-gradient(circle, #64748B 0%, transparent 65%)" }}
    />

    {/* ⑤ 顶部极细线 */}
    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-200/60 to-transparent" />
  </div>
);

// ─── Eyebrow Badge ─────────────────────────────────────────────────────────────

const EyebrowBadge: React.FC = () => (
  <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-gray-200/70 rounded-[32px] shadow-[0_2px_12px_rgba(26,42,78,0.08)]">
    <span className="relative flex h-2 w-2 flex-shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
    </span>
    <Sparkles size={12} className="text-[#2E4A8E] flex-shrink-0" strokeWidth={1.5} />
    <span className="text-xs font-semibold text-[#0A1128] tracking-wide whitespace-nowrap font-mono">
      Powered by General AI Agent & Green AI
    </span>
  </div>
);

// ─── 主标题 ───────────────────────────────────────────────────────────────────

const Headline: React.FC = () => (
  <div className="space-y-2">
    <h1 className="text-4xl md:text-5xl lg:text-[3.6rem] font-black text-[#0A1128] tracking-tighter leading-[1.08]">
      Build. Compute. Visualize.
    </h1>
    <h2 className="text-3xl md:text-4xl lg:text-[3rem] font-black tracking-tighter leading-[1.08]">
      The Super Automation{" "}
      <span
        className="bg-clip-text text-transparent"
        style={{
          backgroundImage:
            "linear-gradient(125deg, #8E9AAF 0%, #4A6090 35%, #1A2A4E 60%, #2E4A8E 100%)",
        }}
      >
        Foundation.
      </span>
    </h2>
  </div>
);

// ─── 副标题 ───────────────────────────────────────────────────────────────────

const Subheadline: React.FC = () => (
  <p className="text-gray-500 text-base md:text-[1.05rem] leading-relaxed max-w-xl text-center">
    Empowering global research and industrial R&D with an end-to-end, zero-code automation workflow—from natural language modeling and Green AI-optimized compute, to publication-ready visualization.
  </p>
);

// ─── CTA 按钮 ─────────────────────────────────────────────────────────────────

const CTAButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onClick={onClick}
    className="
      group inline-flex items-center gap-2.5
      px-9 py-4
      bg-[#0A1128] text-white text-sm font-semibold
      rounded-[32px]
      shadow-[0_4px_20px_rgba(26,42,78,0.28),inset_0_1px_0_rgba(255,255,255,0.08)]
      hover:bg-[#162044]
      hover:-translate-y-0.5
      hover:shadow-[0_8px_28px_rgba(26,42,78,0.35)]
      active:translate-y-0
      transition-all duration-200
    "
  >
    Explore Platform
    <ArrowRight
      size={14}
      strokeWidth={2.5}
      className="transition-transform duration-200 group-hover:translate-x-1"
    />
  </button>
);

// ─── Agent 卡片（玻璃态） ──────────────────────────────────────────────────────

const AgentCardItem: React.FC<{ card: AgentCard; onClick: () => void }> = ({
  card,
  onClick,
}) => (
  <button
    onClick={onClick}
    className="
      group relative w-full text-left
      flex flex-col gap-4
      p-6
      bg-white/75 backdrop-blur-md
      border border-white/60
      rounded-[24px]
      shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_24px_rgba(0,0,0,0.06)]
      hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_32px_rgba(26,42,78,0.11)]
      hover:-translate-y-1
      hover:bg-white/85
      active:translate-y-0
      transition-all duration-200
      cursor-pointer
    "
    aria-label={`Open ${card.label}`}
  >
    {/* 右上角状态徽章 */}
    <span
      className={`
        absolute top-4 right-4
        px-2 py-0.5 text-[9px] font-mono font-bold tracking-widest uppercase
        rounded-[8px]
        ${
          card.tag === "Live"
            ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
            : "bg-gray-50/80 text-gray-400 border border-gray-100"
        }
      `}
    >
      {card.tag}
    </span>

    {/* 图标框 */}
    <div
      className="
        flex-shrink-0 w-9 h-9
        rounded-[12px]
        bg-[#0A1128]/90
        flex items-center justify-center
        shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_8px_rgba(10,17,40,0.2)]
      "
    >
      {card.icon}
    </div>

    {/* 文字区 */}
    <div className="flex-1">
      <p className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-[0.15em] mb-1.5">
        {card.label}
      </p>
      <h3 className="text-[0.875rem] font-bold text-[#0A1128] mb-2 leading-snug tracking-tight">
        {card.title}
      </h3>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        {card.description}
      </p>
    </div>

    {/* hover 箭头 */}
    <div className="flex items-center gap-1 text-[#2E4A8E] opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      <span className="text-[11px] font-mono font-semibold">Open Agent</span>
      <ChevronRight size={11} strokeWidth={2.5} />
    </div>
  </button>
);

// ─── 版权区 ───────────────────────────────────────────────────────────────────

const CopyrightStrip: React.FC = () => (
  <div className="flex flex-col items-center gap-2 pt-2">
    <div className="w-full h-px bg-gradient-to-r from-transparent via-gray-100/80 to-transparent mb-2" />
    <p className="text-[11px] text-gray-400 font-mono">
      © {new Date().getFullYear()} SCI Visualizer. All rights reserved.
    </p>
    <div className="flex items-center gap-4">
      {["Terms of Service", "Privacy Policy", "Cookie Policy"].map((item) => (
        <button
          key={item}
          className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors duration-150 underline-offset-2 hover:underline"
        >
          {item}
        </button>
      ))}
    </div>
  </div>
);

// ─── 主组件 ───────────────────────────────────────────────────────────────────

const HeroSection: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useStore();

  return (
    <section
      className="
        relative min-h-screen
        bg-white
        flex flex-col items-center justify-center
        px-4 py-16
        overflow-hidden
      "
      aria-label="SCI Visualizer Hero"
    >
      {/* 右上角 Sign In / Go to App 按钮 */}
      <div className="absolute top-6 right-8 z-30">
        {user ? (
          <button
            onClick={() => navigate("/app")}
            className="
              inline-flex items-center gap-2
              px-5 py-2.5
              bg-[#0A1128] text-white text-xs font-semibold
              rounded-[32px]
              shadow-[0_2px_12px_rgba(26,42,78,0.2)]
              hover:bg-[#162044] hover:-translate-y-0.5
              transition-all duration-200
            "
          >
            Go to App
            <ArrowRight size={12} strokeWidth={2.5} />
          </button>
        ) : (
          <button
            onClick={() => navigate("/login")}
            className="
              inline-flex items-center gap-2
              px-5 py-2.5
              bg-white/80 backdrop-blur-sm
              border border-gray-200/70
              text-[#0A1128] text-xs font-semibold
              rounded-[32px]
              shadow-[0_2px_12px_rgba(26,42,78,0.08)]
              hover:bg-white hover:shadow-[0_4px_16px_rgba(26,42,78,0.12)]
              hover:-translate-y-0.5
              transition-all duration-200
            "
          >
            <LogIn size={12} strokeWidth={2} />
            Sign In
          </button>
        )}
      </div>

      {/* 层 1：静态背景（六边形晶格 + 弥散光晕） */}
      <BackgroundLayer />

      {/* 层 2：动态代码瀑布 Canvas */}
      <CodeRainCanvas />

      {/* 层 3：主内容卡片（白底 z-10，覆盖代码雨） */}
      <div
        className="
          relative z-10 w-full max-w-4xl
          bg-white/92 backdrop-blur-sm
          border border-gray-100/80
          rounded-[24px]
          shadow-[0_4px_40px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,1)]
          px-8 md:px-14 py-12 md:py-16
        "
      >
        <motion.div
          className="flex flex-col items-center text-center gap-8"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* ① Eyebrow Badge */}
          <motion.div variants={itemVariants}>
            <EyebrowBadge />
          </motion.div>

          {/* ② H1 主标题 */}
          <motion.div variants={itemVariants}>
            <Headline />
          </motion.div>

          {/* ③ 副标题 */}
          <motion.div variants={itemVariants}>
            <Subheadline />
          </motion.div>

          {/* ④ CTA 按钮（居中，单个） */}
          <motion.div variants={itemVariants}>
            <CTAButton onClick={() => navigate("/explore")} />
          </motion.div>

          {/* ⑤ 四张 Agent 卡片（玻璃态） */}
          <motion.div
            variants={itemVariants}
            className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-2"
          >
            {AGENTS.map((card) => (
              <AgentCardItem
                key={card.id}
                card={card}
                onClick={() => navigate(card.route)}
              />
            ))}
          </motion.div>

          {/* ⑥ 版权区 */}
          <motion.div variants={itemVariants} className="w-full">
            <CopyrightStrip />
          </motion.div>
        </motion.div>
      </div>

      {/* 底部渐出 */}
      <div
        className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none z-20"
        style={{
          background:
            "linear-gradient(to top, rgba(255,255,255,0.4) 0%, transparent 100%)",
        }}
        aria-hidden="true"
      />
    </section>
  );
};

export default HeroSection;
