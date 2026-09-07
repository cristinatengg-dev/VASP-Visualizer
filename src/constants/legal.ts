export interface LegalLink {
  label: string;
  path: string;
}

export const LEGAL_LINKS: LegalLink[] = [
  { label: '服务条款', path: '/terms-of-service' },
  { label: '隐私政策', path: '/privacy-policy' },
  { label: 'Cookie 政策', path: '/cookie-policy' },
];
