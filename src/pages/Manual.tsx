import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Manual: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white text-[#333] font-serif p-8 md:p-16 print:p-0">
      {/* Navigation - Hidden on Print */}
      <div className="max-w-4xl mx-auto mb-8 print:hidden">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-600 hover:text-black transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to web
        </button>
      </div>

      <div className="max-w-4xl mx-auto space-y-12 print:w-full print:max-w-none">
        {/* Header */}
        <header className="border-b-2 border-gray-800 pb-6 mb-12">
          <h1 className="text-4xl font-bold mb-4">SCI Visualizer 1.0 用户操作手册</h1>
          <p className="text-xl text-gray-600 italic">User Manual</p>
        </header>

        {/* 1. Introduction */}
        <section>
          <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 mb-4">1. 产品简介 (Introduction)</h2>
          <p className="mb-4 leading-relaxed">
            SCI Visualizer 1.0 是专为科研人员和超算平台打造的 <strong>Web 端高性能结构可视化平台</strong>。它利用 WebGL 与 WebCodecs 硬件加速技术，无需安装任何插件，即可在浏览器中实现 结构与轨迹的秒级渲染与导出。
          </p>
          <p className="mb-4 leading-relaxed">
            平台包含五大 AI Agent，覆盖从 <strong>研究构思 → 建模 → 计算 → 运行时管理 → 封面生成</strong> 的完整科研工作流。
          </p>
          <div className="bg-gray-50 p-4 rounded border border-gray-100 mb-4">
            <p className="font-bold mb-2">支持格式:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>VASP:</strong> POSCAR, CONTCAR, XDATCAR (支持大体系轨迹)</li>
              <li><strong>Crystallography:</strong> .cif</li>
            </ul>
          </div>
          <div className="bg-gray-50 p-4 rounded border border-gray-100 mb-4">
            <p className="font-bold mb-2">平台 Agent 一览:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Idea Agent:</strong> 文献检索 + 结构数据库查询 + AI 研究方案生成</li>
              <li><strong>Modeling Agent:</strong> 对话式晶体结构建模（自然语言 → 3D 结构）</li>
              <li><strong>Compute Agent:</strong> VASP 输入文件编译 + HPC 集群配置 + 任务提交</li>
              <li><strong>Runtime Agent:</strong> 运行时 Artifact 管理与检查</li>
              <li><strong>Rendering Agent:</strong> 基于科研论文内容的 AI 期刊封面生成</li>
            </ul>
          </div>
        </section>

        {/* 2. Quick Start */}
        <section>
          <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 mb-4">2. 快速入门 (Quick Start)</h2>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">2.1 文件导入</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>单文件上传</strong>：点击虚线框或直接拖拽文件。</li>
              <li><strong>多文件管理</strong>：支持一次性上传多个结构（如 POSCAR + XDATCAR）。</li>
              <li><strong>智能切换</strong>：点击左侧文件列表切换视角。系统会自动保存当前文件的修改快照（Snapshot），防止编辑丢失。</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">2.2 视图操作</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>旋转</strong>：左键拖拽</li>
              <li><strong>平移</strong>：右键拖拽</li>
              <li><strong>缩放</strong>：滚轮滚动</li>
              <li><strong>标准视角</strong>：点击控制面板的 Top / Down / Front / Left / Right按钮快速对齐晶面。</li>
            </ul>
          </div>
        </section>

        {/* 3. Visualization */}
        <section>
          <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 mb-4">3. 核心可视化 (Visualization)</h2>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">3.1 渲染风格 (Render Styles)</h3>
            <p className="mb-2">在右侧 "Material Style" 菜单中选择：</p>
            <ol className="list-decimal pl-5 space-y-2 mb-4">
              <li><strong>Classic (经典)</strong>：经典的球棍模型（Ball-and-Stick），采用标准 CPK 配色。切换到该风格时会默认显示键（可在 Show Bonds 中手动关闭）。</li>
              <li><strong>Stick Representation</strong>：以键棒为主的展示方式，原子球体会缩小用于标记元素位置，适合展示复杂骨架或孔道结构。</li>
              <li><strong>Scientific Matte</strong>：无反光哑光材质，阴影柔和，专为出版级平面图设计。</li>
              <li><strong>Metallic Glossy</strong>：高金属性质感，支持调节粗糙度 (Roughness) 和金属度 (Metalness)。</li>
              <li><strong>Glass / Transparent</strong>：玻璃材质。支持调节透光率 (Transmission)，可清晰透视内部结构。</li>
              <li><strong>Toon / Cel Shaded</strong>：卡通描边风格，颜色分层明显，适合机理示意图。</li>
            </ol>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">3.2 结构与表面处理 (Structure & Surface)</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>Show Bonds (显示/隐藏键)</strong>：全局开关。切换到 Classic/Stick 风格时会默认开启键显示；对于超大体系（如 &gt;5000 原子），建议关闭此选项以提升流畅度。</li>
              <li><strong>Unit Cell (晶胞框)</strong>：显示或隐藏周期性边界框。</li>
              <li><strong>Tidy Surface (表面整洁)</strong>：自动检测被边界切断的分子，并在周期性边界外生成 "Ghost Atoms" (幽灵原子) 以补全键连，使表面看起来完整、美观。</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">3.3 光照系统 (Lighting Configuration)</h3>
            <p className="mb-2">支持对场景光照进行精细调节：</p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>Light Intensity (光强)</strong>：实时调节主光源亮度，防止画面过曝。</li>
              <li><strong>Top Right</strong>：点击可调节光源方向，增加暗部细节。</li>
            </ul>
          </div>
        </section>

        {/* 4. Trajectory */}
        <section>
          <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 mb-4">4. XDATCAR 轨迹与动画 (Trajectory)</h2>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">4.1 播放控制</h3>
            <p className="mb-2">上传轨迹文件后，底部出现控制条：</p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>进度控制</strong>：拖动滑块快速定位。</li>
              <li><strong>步进微调</strong>：支持 +1/-1 逐帧检查，或 +10/-10 快速跳转。</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">4.2 极速视频导出 (Turbo Export)</h3>
            <p className="mb-2">基于 GPU 硬件加速的视频编码引擎：</p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>FPS 设置</strong>：15 / 24 / 60 FPS。</li>
              <li><strong>Sampling (采样加速)</strong>：
                <ul className="list-circle pl-5 mt-1 space-y-1 text-sm text-gray-700">
                  <li><strong>1x (Full)</strong>：逐帧导出，最平滑。</li>
                  <li><strong>2x (Fast)</strong>：每 2 帧导出一帧，速度翻倍。</li>
                  <li><strong>5x (Extreme)</strong>：每 5 帧导出一帧，适合长轨迹快速预览。</li>
                  <li><strong>10x (LightSpeed)</strong>：光速导出模式。</li>
                </ul>
              </li>
            </ul>
          </div>
        </section>

        {/* 5. Advanced Editing */}
        <section>
          <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 mb-4">5. 高级编辑 (Advanced Editing)</h2>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">5.1 原子操作</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>选择</strong>：单击选中原子（支持 Shift 多选）。按住 Shift 并在空白处左键拖拽可进行矩形框选；框选为 3D 穿透选择（不考虑遮挡，背后的原子也会被选中）。按住 Ctrl/⌘ 可在框选时追加到已选集合。</li>
              <li><strong>移动</strong>：选中后拖拽原子可修改坐标（仅影响显示，不破坏原始数据）。</li>
              <li><strong>改元素</strong>：在面板输入框修改元素符号（如 C -&gt; N）。</li>
              <li><strong>删除</strong>：点击 "Delete" 移除多余原子。</li>
              <li><strong>混合渲染</strong>：在 Set Style for Selected 下拉菜单，您可以勾选额外的显示 style 模式，此功能常用于突出显示催化剂的活性位点或吸附分子。</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">5.2 超胞生成 (Supercell)</h3>
            <p className="mb-4">输入扩胞倍数（如 2x2x1），点击生成。系统会自动处理原子的周期性复制。</p>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">5.3 导出 (Export)</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>Export High-Res Image</strong>：导出 <strong>4K (4096px)</strong> 分辨率的透明背景 PNG。系统会自动调整相机视场以适配正方形画布，确保存图不畸变。</li>
              <li><strong>Batch Export All (批量导出)</strong>：一键将列表中所有打开的文件导出为图片，并自动打包成 <code>.zip</code> 下载。</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">5.4 专家配置 (Manual Config)</h3>
            <p className="mb-2">在面板底部，你可以手动输入文本来覆盖默认设置：</p>
            <ul className="list-disc pl-5 space-y-2 mb-4 font-mono text-sm">
              <li><strong>Atom Colors</strong>: Fe/0/0/#FFA500 (格式：元素/占位/占位/HEX颜色)</li>
              <li><strong>Atom Radii</strong>: Fe/0/0/1.5</li>
              <li><strong>Bond Rules</strong>: Fe/O/2.5 (定义 Fe 和 O 之间最大成键距离为 2.5Å)</li>
            </ul>
          </div>
        </section>

        {/* 6. Idea Agent */}
        <section>
          <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 mb-4">6. Idea Agent — 研究方案智能生成</h2>
          <p className="mb-4 leading-relaxed">
            Idea Agent 帮助科研人员从一句研究需求出发，自动检索学术文献、查询 Materials Project 数据库，并利用 AI 生成有文献依据的计算研究方案。
          </p>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">6.1 界面布局</h3>
            <p className="mb-2">Idea Agent 采用三栏式布局：</p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>左栏 — 推理时间线</strong>：展示 Agent 的思考过程，包括意图理解、查询翻译、文献搜索、结构检索和方案生成等阶段。底部是输入框。</li>
              <li><strong>中栏 — Research Ideas</strong>：展示 AI 生成的研究方案卡片和检索到的文献列表。</li>
              <li><strong>右栏 — Modeling Blueprint</strong>：点击某个研究方案卡片后展示详细的建模蓝图，包括结构来源、建模配方、文献依据和推荐路径。</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">6.2 使用步骤</h3>
            <ol className="list-decimal pl-5 space-y-2 mb-4">
              <li><strong>输入研究需求</strong>：在左栏底部的输入框中，用自然语言描述你的研究目标。支持中英文（中文查询会自动翻译为英文进行文献检索）。例如："NaCoO2 理论计算，我做实验想补充计算内容"。</li>
              <li><strong>观察推理过程</strong>：左栏时间线实时展示各阶段进度——意图理解、查询翻译、CrossRef/OpenAlex/arXiv/CORE 文献搜索、Materials Project 结构查询、AI 方案生成。</li>
              <li><strong>浏览研究方案</strong>：中栏显示生成的 Idea 卡片，每张标注了难度等级（Starter / Intermediate / Advanced）、模型类型和目标性质。带 "Recommended" 标签的是 AI 推荐的最佳方案。</li>
              <li><strong>查看建模蓝图</strong>：点击某张 Idea 卡片，右栏展示详细蓝图：为什么选这个方向、可以计算什么性质、结构来源（含 Materials Project ID）、建模配方（起始结构、超胞大小、缺陷/掺杂等）、文献依据和注意事项。</li>
              <li><strong>发送到 Modeling Agent</strong>：点击蓝图底部的 "Send to Modeling Agent" 按钮，自动将建模参数传递到 Modeling Agent，开始实际建模工作。</li>
            </ol>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">6.3 文献检索来源</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>CrossRef</strong>：同行评审期刊论文</li>
              <li><strong>OpenAlex</strong>：开放学术图谱</li>
              <li><strong>arXiv</strong>：预印本论文</li>
              <li><strong>CORE</strong>：开放获取论文聚合</li>
              <li><strong>Materials Project</strong>：材料结构数据库（返回化学式、晶系、空间群、能量高于凸包值等信息）</li>
            </ul>
          </div>
        </section>

        {/* 7. Modeling Agent */}
        <section>
          <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 mb-4">7. Modeling Agent — 对话式结构建模</h2>
          <p className="mb-4 leading-relaxed">
            Modeling Agent 允许用户通过自然语言对话来构建晶体结构模型。支持从 Idea Agent 接收 handoff 参数，自动开始建模。
          </p>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">7.1 界面布局</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>左侧 — 对话面板 (Chat Panel)</strong>：与 AI 对话，描述你想要构建的结构。AI 会解析你的意图并生成建模参数。</li>
              <li><strong>右侧 — 3D 画布 (Canvas Panel)</strong>：实时预览生成的晶体结构，支持旋转、缩放、平移操作。</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">7.2 使用步骤</h3>
            <ol className="list-decimal pl-5 space-y-2 mb-4">
              <li><strong>描述目标结构</strong>：在左侧对话框中输入你想构建的结构描述，例如 "Build a bulk NaCoO2 crystal using Materials Project entry mp-867515"。</li>
              <li><strong>AI 解析意图</strong>：Modeling Agent 会自动解析你的需求，识别化学式、晶型、数据源等信息。</li>
              <li><strong>预览结构</strong>：生成的结构会在右侧 3D 画布中实时显示。</li>
              <li><strong>迭代优化</strong>：你可以继续对话来调整结构参数，如修改超胞大小、添加缺陷、调整掺杂等。</li>
            </ol>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">7.3 从 Idea Agent 接收参数</h3>
            <p className="mb-4 leading-relaxed">
              当你在 Idea Agent 中点击 "Send to Modeling Agent" 后，Modeling Agent 会自动接收 handoff 参数（包括化学式、Materials Project ID、晶相信息和建模提示词），并预填充到对话框中，省去手动输入的步骤。
            </p>
          </div>
        </section>

        {/* 8. Compute Agent */}
        <section>
          <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 mb-4">8. Compute Agent — VASP 计算任务编译与提交</h2>
          <p className="mb-4 leading-relaxed">
            Compute Agent 将 Modeling Agent 生成的结构自动编译为完整的 VASP 输入文件套件，并支持配置 HPC 集群参数和提交计算任务。
          </p>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">8.1 五步工作流 (5-Step Pipeline)</h3>
            <ol className="list-decimal pl-5 space-y-2 mb-4">
              <li><strong>Select Structure</strong>：确认目标体系结构，查看原子数、体系类型（Slab/Bulk 等），确认固定原子设置。</li>
              <li><strong>Compute Intent</strong>：选择计算任务类型和参数：
                <ul className="list-circle pl-5 mt-1 space-y-1 text-sm text-gray-700">
                  <li><strong>Task Type</strong>：Relax（结构优化）、Static（静态计算）、DOS（态密度）、Band（能带结构）、Adsorption（吸附能）</li>
                  <li><strong>Accuracy</strong>：Fast / Standard / High</li>
                  <li><strong>Core Settings</strong>：vDW (D3) 色散校正开关、Spin 自旋极化开关</li>
                </ul>
              </li>
              <li><strong>HPC Profile</strong>：选择并配置 HPC 集群——节点数、每节点核数、最大运行时间 (Walltime)、可执行文件 (vasp_std / vasp_gpu)。</li>
              <li><strong>Review & Compile</strong>：预览自动编译的 VASP 输入文件（INCAR / KPOINTS / POSCAR / POTCAR），支持查看提交脚本 (job.sh)。文件经过自动校验（VALIDATED）。</li>
              <li><strong>Job Monitor</strong>：提交到集群后，实时监控任务状态、查看 Live Log 输出、Runtime Guardian（Custodian 自愈系统）自动检测并修复常见 VASP 错误。</li>
            </ol>
          </div>
        </section>

        {/* 9. Runtime Agent */}
        <section>
          <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 mb-4">9. Runtime Agent — 运行时管理器</h2>
          <p className="mb-4 leading-relaxed">
            Runtime Agent 提供平台运行时 Artifact（工件）的可视化管理界面，帮助用户检查数据管线中的各类产物。
          </p>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">9.1 核心功能</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>Session 管理</strong>：创建和查看运行时会话，每个会话包含独立的 Artifact 集合。</li>
              <li><strong>Artifact 浏览</strong>：列出当前会话中所有 Artifact，支持按类型（kind）筛选。每个 Artifact 显示状态、生命周期阶段、创建时间等元信息。</li>
              <li><strong>Payload 检查</strong>：深度检查 Artifact 的存储状态——是否已物化、存储类型、磁盘大小、内容哈希值等。支持 JSON 内容预览。</li>
              <li><strong>Skill 查询</strong>：查看平台已注册的 Agent 技能列表。</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">9.2 使用场景</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li>检查建模产物是否正确写入运行时存储</li>
              <li>调试数据管线中的异常 Artifact</li>
              <li>追踪 Artifact 的谱系（Lineage）关系</li>
              <li>验证平台健康状态和服务可用性</li>
            </ul>
          </div>
        </section>

        {/* 10. Rendering Agent */}
        <section>
          <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 mb-4">10. Rendering Agent — AI 期刊封面生成</h2>
          <p className="mb-4 leading-relaxed">
            Rendering Agent 可以根据你的科研论文内容，利用 AI 自动生成高品质的期刊封面图片。
          </p>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">10.1 六步工作流 (6-Step Pipeline)</h3>
            <ol className="list-decimal pl-5 space-y-2 mb-4">
              <li><strong>Input (输入)</strong>：粘贴论文摘要/关键段落，或上传 PDF。支持五个输入区域：核心文本、补充说明、风格偏好、参考图片、高级开关。</li>
              <li><strong>Parsing (科学实体提取)</strong>：Gemini AI 自动解析文本，提取科学实体（化学式、反应物、产物、中间体、活性位点、反应机理等），生成结构化的 JSON 表示。</li>
              <li><strong>Plan Selection (方案选择)</strong>：AI 生成三种不同风格的视觉方案卡片供选择。每种方案包含不同的构图思路和视觉重点。</li>
              <li><strong>Prompt Review (提示词确认)</strong>：查看 AI 编译的完整图像生成提示词，可以手动微调后确认。</li>
              <li><strong>Base Generation (图像生成)</strong>：Gemini 图像模型生成高清封面图片。支持多张候选图供选择。</li>
              <li><strong>Export (导出)</strong>：下载最终的高分辨率封面图片。</li>
            </ol>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">10.2 风格调节</h3>
            <p className="mb-2">支持六维风格滑块，实时调整封面风格：</p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>Cinematic</strong>：电影感光影效果</li>
              <li><strong>Macro</strong>：微观放大视角</li>
              <li><strong>Abstract</strong>：抽象艺术化程度</li>
              <li><strong>Realistic</strong>：写实渲染质感</li>
              <li><strong>Glass</strong>：玻璃/透明材质</li>
              <li><strong>Metallic</strong>：金属质感</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">10.3 高级开关</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>Strict Chemical Structure</strong>：强制严格的化学结构正确性（CPK 原子颜色、正确键连）</li>
              <li><strong>Prioritize Accuracy</strong>：优先科学准确性而非艺术效果</li>
              <li><strong>Prioritize Art</strong>：优先视觉美感和创意表现</li>
              <li><strong>Use Reference Constraint</strong>：参考已上传的参考图片来约束生成风格</li>
              <li><strong>Publish Export Mode</strong>：启用出版级导出质量</li>
            </ul>
          </div>
        </section>

        {/* 11. User Profile */}
        <section>
          <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 mb-4">11. 个人中心 (User Profile)</h2>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">11.1 访问方式</h3>
            <p className="mb-4">点击页面右上角的头像图标进入个人中心。在此页面，您可以管理账户信息并查看当前的权益状态。</p>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">11.2 功能概览</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>额度查询</strong>：实时显示剩余的免费图片导出次数和视频导出次数。</li>
              <li><strong>身份标识</strong>：显示当前账户等级。</li>
              <li><strong>激活权益</strong>：在此处选择账号类型即可升级账户。</li>
            </ul>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-gray-200 text-center text-gray-500 text-sm">
          <p>&copy; 2026 SCI Visualizer. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
};

export default Manual;
