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
  if (/No figure data file uploaded/i.test(raw)) return 'Please upload a data file first.';
  if (/Uploaded figure dataset is empty/i.test(raw)) return 'Data file is empty; cannot generate data figure.';
  if (/Unsupported data format/i.test(raw)) return 'Data figure mode currently supports CSV, TSV, and JSON tabular data only.';
  if (/Figure worker dependency missing/i.test(raw)) return 'Server is missing data figure dependencies. Please contact administrator to set up the plotting environment.';
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
