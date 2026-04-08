export interface LegalLink {
  label: string;
  path: string;
}

export const LEGAL_LINKS: LegalLink[] = [
  { label: 'Terms of Service', path: '/terms-of-service' },
  { label: 'Privacy Policy', path: '/privacy-policy' },
  { label: 'Cookie Policy', path: '/cookie-policy' },
];
