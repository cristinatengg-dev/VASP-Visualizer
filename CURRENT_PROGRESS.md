# 当前工作进度 — SCI Visualizer UI 改版 (2026-03-26)

> 本文档供新 Claude Code 会话快速了解当前工作状态。

---

## 项目路径

`/Users/a1234/VASP-Visualizer`

## 已完成的改动（均未 commit）

### 1. HeroSection 卡片布局改为横排一行 (`src/components/HeroSection.tsx`)
- 5 张 Agent 卡片从 `grid-cols-2/4` 改为 `grid-cols-5` 横向一行
- 每张卡片改为紧凑垂直布局（图标+标签在顶部一行，标题+描述在下方）
- 主内容容器从 `max-w-4xl` 扩展到 `max-w-6xl`
- 第一张卡片：label 改为 "Idea Agent"，title 改为 "Idea Creator"
- 右上角按钮文字从 "Go to App" 改为 "Go"

### 2. 全站页面背景统一为米黄色 `#F5F5F0`
已修改的文件：
- `src/agents/modeling/index.tsx` — `bg-gray-50` → `bg-[#F5F5F0]`
- `src/agents/retrieval/index.tsx` — `bg-gray-50` → `bg-[#F5F5F0]`
- `src/agents/compute/index.tsx` — `bg-[#F8F9FA]` → `bg-[#F5F5F0]`
- `src/agents/runtime/index.tsx` — 复杂渐变背景 → `bg-[#F5F5F0]`
- `src/agents/rendering/index.tsx` — 已经是 `bg-[#F5F5F0]`（未改）
- `src/components/LoginPage.tsx` — 已经是 `bg-[#F5F5F0]`（未改）
- HeroSection 保持 `bg-white` 不变

### 3. UI_STYLE.md 更新
- 新增 `页面背景（米黄）` 行：`bg-[#F5F5F0]` — 所有 Agent 页面、登录页统一使用
- 新增 `HeroSection 背景` 行：`bg-white` — 首屏保持白色不变

### 4. 新增 SplashScreen 动态开场页 (`src/components/SplashScreen.tsx`)
- **背景**：黑曜石深空 `#0A0D14`（非高饱和蓝），radial ambient occlusion 暗角
- **粒子动画**：呼吸式涨落 — 300+ 粒子以 0.0018 rad/frame 的周期做扩张/收缩，振幅 0.18，三色（蓝/银/金），每个粒子有独立相位偏移和辉光层
- **文字**：焦散显影 — 字母从 18px 高斯模糊 + 1.15x 缩放 snap 到清晰，无金属流光
- **交互**：点击后文字溶解散射 → 粒子向外散开 → 整个 splash 容器 opacity 1.2s 淡出，HeroSection 从下方自然透出
- 每个 session 只显示一次（sessionStorage 标记）

### 5. App.tsx 路由整合
- 新增 `HomePage` 组件包裹 `SplashScreen` + `HeroSection`
- 首页路由 `/` 从 `<HeroSection />` 改为 `<HomePage />`

### 6. Idea Agent（检索 Agent）— 上一轮已完成的功能
- 后端 `server/src/retrieval/agent.js` — 完整的文献搜索 + MP 结构检索 + LLM 方案生成管线
- 前端 `src/agents/retrieval/index.tsx` — 三栏 UI
- 路由 `/agent/retrieval` 已注册
- Modeling Agent 支持从 Idea Agent 接收 handoff 参数

---

## 当前待解决的问题

### Splash → HeroSection 过渡不够丝滑
用户反馈：点击后从深色 splash 过渡到白色 HeroSection 仍然不够顺滑。当前方案是整个容器 opacity 1.2s 淡出。可能需要进一步调优：
- 考虑让 HeroSection 的内容也做入场动画配合
- 或者调整淡出曲线/时长
- 用户希望能通过截图沟通效果（在 VS Code Claude Code 中可以拖拽图片）

---

## 待完成的任务

### 部署到生产服务器
- 部署方式参考 `.codex/skills/vasp-visualizer-deploy/SKILL.md`
- GitHub 仓库：`cristinatengg-dev/VASP-Visualizer`
- 服务器路径：`/home/deploy/VASP-Visualizer`
- 流程：本地 commit + push → SSH 到服务器 → `scripts/pull-and-deploy.sh origin main`
- 改动需要先 commit 再部署

---

## 运行方式

```bash
cd /Users/a1234/VASP-Visualizer

# 前端
npx vite --host          # → http://localhost:5173

# 后端（已在 3000 端口运行中）
node server/index.js     # → http://localhost:3000
```

## 代理配置

- 系统代理：`http://127.0.0.1:7897`（Clash）
- `~/.zshrc` 已写入 `http_proxy` / `https_proxy`
- API 中转：`https://api.aipaibox.com`（ANTHROPIC_BASE_URL）
