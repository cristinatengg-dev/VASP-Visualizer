import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
const steps = [
  [
    "/assistant",
    "从一个研究问题开始",
    "描述材料体系、应用场景与性能目标。对话会参考账号内获准访问的历史，显示处理进度、回答与来源；研究建议由你确认后推进。",
  ],
  [
    "/workspace",
    "建立研究项目",
    "创建项目并明确温度、标准、指标、重复数、周期与预算。研究路线将候选、仿真、制备、表征和复核关联起来。",
  ],
  [
    "/workspace/plan",
    "安排任务与执行资源",
    "逐项确认方法、输入输出、负责人、前置依赖和验收条件。当前支持人工执行、原始文件回传和已有曲线分析；真实仿真与设备自动执行待开放。",
  ],
  [
    "/workspace/experiments",
    "管理候选与样品",
    "记录材料成分、工艺履历与独立样品编号。测量数据保留实际试验条件、方法版本与原始文件。",
  ],
  [
    "/workspace/results",
    "复核结果，推进下一轮",
    "先核对质量与工况可比性，再比较目标与实测结果。确认下一轮候选、对照变量和停止条件后，创建新的样品与任务，保留历史版本。",
  ],
  [
    "/knowledge",
    "整理文献与专利证据",
    "检索文献题录、导入获准使用的专利资料，上传原文并摘录证据。数值、单位、页码与用途许可随资料保留。",
  ],
  [
    "/account/defaults",
    "选择数据模式与模型",
    "私密或参与优化由你选择。账号默认项用于新建项目，每个项目可单独调整；外部模型推理与公司训练分别授权。",
  ],
  [
    "/account/memory",
    "延续账号记忆",
    "对话与项目记录自动保留，并在后续问题中参考相关来源。可关闭自动参考，或排除指定项目与来源。",
  ],
  [
    "/account/billing",
    "查看模型用量",
    "查看模型调用状态及实际 Token。充值与团队邀请待开放，入口保留状态说明。",
  ],
];
export default function Guide() {
  return (
    <div className="ep-page ep-guide">
      <div className="ep-eyebrow">使用指南</div>
      <h1>让每一步研究都有依据。</h1>
      <p>从问题、方案到实验与反馈，在同一个工作空间持续推进材料研发。</p>
      {steps.map(([path, title, description], i) => (
        <Link className="ep-guide-step" key={path} to={path}>
          <span>{String(i + 1).padStart(2, "0")}</span>
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
          <ArrowRight size={18} />
        </Link>
      ))}
    </div>
  );
}
