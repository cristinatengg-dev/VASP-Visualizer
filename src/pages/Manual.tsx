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
          <div className="bg-gray-50 p-4 rounded border border-gray-100 mb-4">
            <p className="font-bold mb-2">支持格式:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>VASP:</strong> POSCAR, CONTCAR, XDATCAR (支持大体系轨迹)</li>
              <li><strong>Crystallography:</strong> .cif</li>
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

        {/* 6. User Profile */}
        <section>
          <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 mb-4">6. 个人中心 (User Profile)</h2>
          
          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">6.1 访问方式</h3>
            <p className="mb-4">点击页面右上角的头像图标进入个人中心。在此页面，您可以管理账户信息并查看当前的权益状态。</p>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">6.2 功能概览</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>额度查询</strong>：实时显示剩余的免费图片导出次数和视频导出次数。</li>
              <li><strong>身份标识</strong>：显示当前账户等级。</li>
              <li><strong>激活权益</strong>：在此处选择账号类型即可升级账户。</li>
            </ul>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-gray-200 text-center text-gray-500 text-sm">
          <p>© 2026 SCI Visualizer. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
};

export default Manual;
