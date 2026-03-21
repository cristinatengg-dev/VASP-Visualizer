/**
 * Explore.tsx — SCI Visualizer 平台介绍页
 *
 * 内容：
 *   1. 宣传视频（视频嵌入占位区，待替换真实 URL）
 *   2. 操作手册（跳转 /manual）
 *
 * 设计规范：严格遵循 UI_STYLE.md
 *   - 主品牌色：#0A1128 / #2E4A8E
 *   - 背景：bg-white / bg-gray-50
 *   - 圆角：卡片 rounded-[24px]，按钮 rounded-[32px]
 *   - 阴影：shadow-[0_4px_30px_rgba(0,0,0,0.05)]
 *   - 无 backdrop-blur，无霓虹色
 */

import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Play, BookOpen, ArrowLeft, ArrowRight, ChevronRight, DatabaseZap } from "lucide-react";

// ─── 动画 ─────────────────────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.48, ease: "easeOut" as const },
  },
};

// ─── 视频播放器 ───────────────────────────────────────────────────────────────

/**
 * VideoPlayer
 * 目前是占位区，待有真实视频 URL 时替换 VIDEO_URL。
 * 支持两种方式：
 *   - YouTube/Vimeo embed → 用 <iframe>
 *   - 本地 mp4 → 用 <video>
 */
const VIDEO_URL = ""; // ← 填入真实视频 URL（YouTube embed / mp4）

const VideoPlayer: React.FC = () => {
  const [playing, setPlaying] = useState(false);

  if (VIDEO_URL) {
    return (
      <div className="w-full aspect-video rounded-[24px] overflow-hidden border border-gray-100 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
        <iframe
          src={VIDEO_URL}
          title="SCI Visualizer Platform Demo"
          className="w-full h-full"
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }

  // 占位播放器
  return (
    <div
      className="
        relative w-full aspect-video
        bg-gray-50 border border-gray-100
        rounded-[24px] overflow-hidden
        shadow-[0_4px_30px_rgba(0,0,0,0.05)]
        flex items-center justify-center
        cursor-pointer group
      "
      onClick={() => setPlaying(!playing)}
      role="button"
      aria-label="Play demo video"
    >
      {/* 背景装饰 */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{ background: "radial-gradient(circle at 50% 50%, #2E4A8E 0%, transparent 70%)" }}
      />

      {/* 播放按钮 */}
      <div className="relative flex flex-col items-center gap-4">
        <div
          className="
            w-16 h-16 rounded-full
            bg-[#0A1128] text-white
            flex items-center justify-center
            shadow-[0_4px_20px_rgba(10,17,40,0.25)]
            group-hover:bg-[#162044]
            group-hover:scale-105
            transition-all duration-200
          "
        >
          <Play size={22} strokeWidth={2} className="translate-x-0.5" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-[#0A1128]">Platform Demo Video</p>
          <p className="text-xs text-gray-400 mt-1">Coming soon — video will appear here</p>
        </div>
      </div>

      {/* 时长占位 */}
      <div className="absolute bottom-4 right-4 px-2 py-0.5 bg-[#0A1128]/80 text-white text-[10px] font-mono rounded-[8px]">
        --:--
      </div>
    </div>
  );
};

// ─── 手册入口卡片 ─────────────────────────────────────────────────────────────

const ManualCard: React.FC<{ onOpen: () => void }> = ({ onOpen }) => (
  <button
    onClick={onOpen}
    className="
      group w-full flex items-center gap-5
      p-6
      bg-white border border-gray-100
      rounded-[24px]
      shadow-[0_4px_20px_rgba(0,0,0,0.05)]
      hover:shadow-[0_8px_30px_rgba(26,42,78,0.10)]
      hover:-translate-y-0.5
      hover:border-gray-200
      active:translate-y-0
      transition-all duration-200
      text-left
    "
  >
    {/* 图标 */}
    <div className="flex-shrink-0 w-12 h-12 rounded-[16px] bg-[#0A1128] flex items-center justify-center shadow-sm">
      <BookOpen size={20} strokeWidth={2} className="text-white" />
    </div>

    {/* 文字 */}
    <div className="flex-1">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">
        Documentation
      </p>
      <h3 className="text-base font-bold text-[#0A1128]">Full Operation Manual</h3>
      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
        Step-by-step guides for all three agents — Modeling, Computation, and Rendering.
      </p>
    </div>

    {/* 箭头 */}
    <ChevronRight
      size={18}
      strokeWidth={2}
      className="text-gray-300 group-hover:text-[#2E4A8E] group-hover:translate-x-1 transition-all duration-200 flex-shrink-0"
    />
  </button>
);

const RuntimeInspectorCard: React.FC<{ onOpen: () => void }> = ({ onOpen }) => (
  <button
    onClick={onOpen}
    className="
      group w-full flex items-center gap-5
      p-6
      bg-white border border-gray-100
      rounded-[24px]
      shadow-[0_4px_20px_rgba(0,0,0,0.05)]
      hover:shadow-[0_8px_30px_rgba(26,42,78,0.10)]
      hover:-translate-y-0.5
      hover:border-gray-200
      active:translate-y-0
      transition-all duration-200
      text-left
    "
  >
    <div className="flex-shrink-0 w-12 h-12 rounded-[16px] bg-[#173B7A] flex items-center justify-center shadow-sm">
      <DatabaseZap size={20} strokeWidth={2} className="text-white" />
    </div>

    <div className="flex-1">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">
        Runtime Demo
      </p>
      <h3 className="text-base font-bold text-[#0A1128]">Agent Runtime Inspector</h3>
      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
        Inspect session state, artifacts, approvals, jobs, and visual asset payloads in one cockpit.
      </p>
    </div>

    <ChevronRight
      size={18}
      strokeWidth={2}
      className="text-gray-300 group-hover:text-[#2E4A8E] group-hover:translate-x-1 transition-all duration-200 flex-shrink-0"
    />
  </button>
);

// ─── 快速链接卡片 ─────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { label: "Getting Started", desc: "Setup your first project in 5 minutes" },
  { label: "Modeling Guide", desc: "Build molecular and crystal structures" },
  { label: "Compute Workflows", desc: "Submit DFT, MD, and more" },
  { label: "Rendering & Export", desc: "3D visualization and AI cover generation" },
];

const QuickLinks: React.FC = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {QUICK_LINKS.map((link) => (
      <div
        key={link.label}
        className="
          flex items-start gap-3 p-4
          bg-gray-50 border border-gray-100
          rounded-[16px]
          hover:bg-white hover:border-gray-200 hover:shadow-[0_4px_20px_rgba(0,0,0,0.05)]
          cursor-pointer
          transition-all duration-200
        "
      >
        <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#2E4A8E] mt-1.5" />
        <div>
          <p className="text-xs font-semibold text-[#0A1128]">{link.label}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{link.desc}</p>
        </div>
      </div>
    ))}
  </div>
);

// ─── 主组件 ───────────────────────────────────────────────────────────────────

const Explore: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white px-4 py-10">
      <div className="max-w-3xl mx-auto">

        <motion.div
          className="flex flex-col gap-8"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >

          {/* 顶部导航 */}
          <motion.div variants={itemVariants} className="flex items-center gap-3">
            <button
              onClick={() => navigate("/hero")}
              className="
                inline-flex items-center gap-1.5
                px-3 py-2
                bg-gray-50 border border-gray-100
                text-xs font-medium text-gray-600
                rounded-[32px]
                hover:bg-white hover:border-gray-200
                transition-all duration-150
              "
            >
              <ArrowLeft size={13} strokeWidth={2} />
              Back
            </button>

            <span className="text-xs text-gray-400 font-semibold uppercase tracking-widest">
              SCI Visualizer — Platform Overview
            </span>
          </motion.div>

          {/* 页面标题 */}
          <motion.div variants={itemVariants}>
            <h1 className="text-3xl font-black text-[#0A1128] tracking-tight">
              Explore the Platform
            </h1>
            <p className="text-gray-500 text-sm mt-2 leading-relaxed">
              Watch the demo to see all three agents in action, then dive into the documentation
              to get started with your first workflow.
            </p>
          </motion.div>

          {/* 宣传视频 */}
          <motion.div variants={itemVariants}>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
              Demo Video
            </h2>
            <VideoPlayer />
          </motion.div>

          {/* 操作手册入口 */}
          <motion.div variants={itemVariants}>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
              Documentation
            </h2>
            <ManualCard onOpen={() => navigate("/manual")} />
          </motion.div>

          {/* 快速链接 */}
          <motion.div variants={itemVariants}>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
              Quick Links
            </h2>
            <QuickLinks />
          </motion.div>

          <motion.div variants={itemVariants}>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
              Developer Tools
            </h2>
            <RuntimeInspectorCard onOpen={() => navigate("/agent/runtime")} />
          </motion.div>

          {/* 底部 CTA */}
          <motion.div
            variants={itemVariants}
            className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-gray-100"
          >
            <button
              onClick={() => navigate("/")}
              className="
                group inline-flex items-center gap-2
                px-7 py-3.5
                bg-[#0A1128] text-white text-sm font-semibold
                rounded-[32px]
                shadow-[0_4px_15px_rgba(26,42,78,0.20)]
                hover:bg-[#162044]
                hover:-translate-y-0.5
                active:translate-y-0
                transition-all duration-200
              "
            >
              Launch Rendering Agent
              <ArrowRight
                size={14}
                strokeWidth={2.5}
                className="transition-transform duration-200 group-hover:translate-x-1"
              />
            </button>

            <p className="text-xs text-gray-400">
              More agents coming soon.
            </p>
          </motion.div>

        </motion.div>
      </div>
    </div>
  );
};

export default Explore;
