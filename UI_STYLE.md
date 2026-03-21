# UI_STYLE.md — SCI Visualizer 界面风格规范

> 本文件记录项目的 UI 设计语言规则，所有新组件必须严格遵守。

---

## 1. 色彩系统

| 用途 | 值 |
|------|-----|
| 主品牌色（深蓝黑） | `#0A1128` |
| 次品牌色（按钮悬停） | `#162044` |
| 深蓝按钮 | `#1A2A4E` / hover `#24365E` |
| 蓝色导出按钮 | `#2E4A8E` / hover `#3D5BA6` |
| 主背景 | `bg-white` |
| 次背景 | `bg-gray-50` |
| 边框 | `border-gray-100` / `border-gray-200` |

### 文字色
| 用途 | Tailwind 类 |
|------|-------------|
| 标题 | `text-gray-800 font-bold` |
| 正文 | `text-gray-600 text-sm` |
| 辅助 / label | `text-gray-500 text-xs` |
| 极淡 / placeholder | `text-gray-400 text-xs` |
| 品牌深色文字 | `text-[#0A1128]` |

---

## 2. 圆角规范

| 元素类型 | 圆角 |
|----------|------|
| 大卡片 / Panel | `rounded-[24px]` |
| 按钮 / Pill | `rounded-[32px]` |
| 小卡片 / 标签 | `rounded-[16px]` |
| 输入框 / Textarea | `rounded-[24px]` |

---

## 3. 阴影规范

| 用途 | 值 |
|------|-----|
| 主面板 | `shadow-[0_4px_30px_rgba(0,0,0,0.05)]` |
| 卡片激活态 | `shadow-[0_4px_20px_rgba(0,0,0,0.08)]` |
| Tooltip / Popover | `shadow-[0_4px_20px_rgba(0,0,0,0.08)]` |
| 主按钮 | `shadow-sm` 或 `shadow-[0_4px_15px_rgba(26,42,78,0.2)]` |

---

## 4. Tooltip / Popover 样式（MeasurementPanel 基准）

```html
<div class="bg-white border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.08)] rounded-[16px] px-4 py-3">
  <span class="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">标签</span>
  <span class="text-base font-mono font-bold text-[#0A1128]">数值</span>
  <span class="text-xs text-gray-500 font-mono">详情</span>
</div>
```

**禁止**：黑色背景、霓虹/绿色文字、毛玻璃 `backdrop-blur` 效果（Tooltip 用白底）。

---

## 5. 按钮规范

### 主操作按钮（深色）
```html
<button class="px-4 py-3 bg-[#0A1128] text-white rounded-[32px] hover:bg-[#162044] transition-colors shadow-sm font-medium text-sm">
```

### 次要操作按钮（灰色）
```html
<button class="px-4 py-3 bg-gray-50 border border-gray-200 text-gray-700 rounded-[32px] hover:bg-gray-100 transition-colors text-sm font-medium">
```

### 危险操作按钮（红色）
```html
<button class="px-2 py-1.5 bg-red-50 text-red-600 rounded-[32px] hover:bg-red-100 border border-red-200 text-xs">
```

---

## 6. 输入框 / Textarea

```html
<textarea class="w-full p-3 text-xs border border-gray-100 rounded-[24px] font-mono focus:outline-none focus:border-gray-300 focus:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all resize-none text-gray-600">
```

---

## 7. Toggle / 激活态按钮

激活态（on）：白底 + 阴影 + `ring-1 ring-black/5` + 深色文字  
未激活态（off）：`bg-gray-50` + `text-gray-500`

```html
<!-- ON -->
<button class="bg-white text-[#0A1128] shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-black/5 font-semibold rounded-[32px]">

<!-- OFF -->
<button class="bg-gray-50 text-gray-500 hover:bg-gray-100 rounded-[32px]">
```

图标圆圈：激活 `bg-[#0A1128] text-white`，未激活 `bg-gray-200 text-gray-400`

---

## 8. 节标题（Section Header）

```html
<h2 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">SECTION NAME</h2>
<!-- 或 -->
<h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">Section Name</h2>
```

---

## 9. 字体

- 主字体：系统默认 sans-serif
- 等宽数据：`font-mono`（用于原子坐标、键长、数值等）
- 不使用自定义 Google Fonts

---

## 10. 间距节奏

- 组件内间距：`p-3` / `p-4` / `p-6`
- 组件间距：`space-y-8`（大块）/ `space-y-3`（小块）/ `gap-2`（inline）
- 列表项：`mb-4`

---

## 11. 禁止事项

- ❌ 黑色背景 UI 元素（Canvas 除外）
- ❌ 霓虹色/发光色文字（绿色、青色 glow）
- ❌ `backdrop-blur` 用于数据展示型 Tooltip
- ❌ 自定义字体大小超过 `text-xl`（标题限 `text-xl`）
- ❌ 圆角低于 `rounded-[16px]`（用于可见卡片/按钮）
