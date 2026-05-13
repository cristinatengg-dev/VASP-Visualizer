import { API_BASE_URL } from '../../config';
import type {
  FigureBriefInput,
  FigureChartType,
  FigureColumnHints,
  FigureContract,
  FigureDataProfile,
  FigureExportOptions,
  FigureRenderResult,
  FigureStatisticalRules,
} from './types';

function humanizeFigureApiError(message: string, fallback: string) {
  const raw = String(message || '').trim();
  if (!raw) return fallback;
  if (/No figure data file uploaded/i.test(raw)) return '请先上传数据文件。';
  if (/Uploaded figure dataset is empty/i.test(raw)) return '数据文件为空，暂时无法生成数据图。';
  if (/Unsupported data format/i.test(raw)) return '目前数据图模式仅支持 CSV、TSV 和 JSON 表格数据。';
  if (/Figure worker dependency missing/i.test(raw)) return '服务端缺少数据图依赖，请联系管理员补齐绘图环境。';
  return raw || fallback;
}

function toDataUrl(base64: string, mimeType: string) {
  return `data:${mimeType};base64,${String(base64 || '').trim()}`;
}

export async function profileFigureData(file: File): Promise<FigureDataProfile> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/agent/profile-figure-data`, {
    method: 'POST',
    body: formData,
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(humanizeFigureApiError(data.error || `Profile API error ${response.status}`, 'Figure data profiling failed'));
  }
  return data.profile as FigureDataProfile;
}

export async function compileFigureContract(input: {
  profile: FigureDataProfile;
  figureBrief: FigureBriefInput;
  figureType: FigureChartType;
  exportOptions: FigureExportOptions;
  statisticalRules: FigureStatisticalRules;
  columnHints: FigureColumnHints;
}): Promise<{ contract: FigureContract; usedFallback: boolean; llmError: string | null }> {
  const response = await fetch(`${API_BASE_URL}/agent/compile-figure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(humanizeFigureApiError(data.error || `Compile API error ${response.status}`, 'Figure contract compilation failed'));
  }
  return {
    contract: data.contract as FigureContract,
    usedFallback: Boolean(data.usedFallback),
    llmError: typeof data.llmError === 'string' ? data.llmError : null,
  };
}

export async function generateFigure(
  file: File,
  contract: FigureContract,
  exportOptions: FigureExportOptions,
): Promise<FigureRenderResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('contract', JSON.stringify(contract));
  formData.append('exportOptions', JSON.stringify(exportOptions));

  const response = await fetch(`${API_BASE_URL}/agent/generate-figure`, {
    method: 'POST',
    body: formData,
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(humanizeFigureApiError(data.error || `Generate API error ${response.status}`, 'Figure rendering failed'));
  }

  return {
    figureScript: String(data.figureScript || ''),
    figureSpec: data.figureSpec as FigureContract,
    svgDataUrl: toDataUrl(String(data.svgBase64 || ''), 'image/svg+xml'),
    pngDataUrl: toDataUrl(String(data.pngBase64 || ''), 'image/png'),
    qaReport: data.qaReport || {},
  };
}
