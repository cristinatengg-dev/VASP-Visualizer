import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { LEGAL_LINKS } from '../../constants/legal';

interface LegalDocumentLayoutProps {
  title: string;
  subtitle: string;
  summary: React.ReactNode;
  effectiveDate: string;
  currentPath: string;
  children: React.ReactNode;
}

interface LegalSectionProps {
  title: string;
  children: React.ReactNode;
}

export const LegalSection: React.FC<LegalSectionProps> = ({ title, children }) => (
  <section className="mb-10">
    <h2 className="text-lg font-bold text-[#111] mb-4 uppercase tracking-wide">{title}</h2>
    <div className="space-y-3 text-[15px] leading-[1.8] text-[#333]">
      {children}
    </div>
  </section>
);

const LegalDocumentLayout: React.FC<LegalDocumentLayoutProps> = ({
  title,
  subtitle,
  summary,
  effectiveDate,
  currentPath,
  children,
}) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white text-[#333] p-8 md:p-16 print:p-0" style={{ fontFamily: "'Times New Roman', 'Noto Serif SC', Georgia, serif" }}>
      <div className="max-w-3xl mx-auto mb-8 print:hidden">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-500 hover:text-black transition-colors text-sm"
          style={{ fontFamily: 'system-ui, sans-serif' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>

      <div className="max-w-3xl mx-auto print:w-full print:max-w-none">
        {/* Document Header */}
        <header className="mb-12 text-center border-b border-gray-300 pb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-gray-400 mb-6" style={{ fontFamily: 'system-ui, sans-serif' }}>
            SCI Visualizer
          </p>
          <h1 className="text-3xl font-bold text-[#111] mb-2 uppercase tracking-wider">{title}</h1>
          <p className="text-base text-gray-500 italic mb-6">{subtitle}</p>
          <p className="text-sm text-gray-500">Effective Date: {effectiveDate}</p>
        </header>

        {/* Document Navigation */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-10 print:hidden" style={{ fontFamily: 'system-ui, sans-serif' }}>
          {LEGAL_LINKS.map((link) => {
            const isActive = link.path === currentPath;
            return (
              <Link
                key={link.path}
                to={link.path}
                className={[
                  'inline-flex items-center px-4 py-2 rounded-sm text-xs uppercase tracking-wider transition-colors border',
                  isActive
                    ? 'bg-[#111] text-white border-[#111]'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400',
                ].join(' ')}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Summary */}
        <div className="mb-10 p-6 border-l-4 border-gray-800 bg-gray-50">
          <div className="text-[15px] leading-[1.8] text-gray-700">
            {summary}
          </div>
        </div>

        {/* Document Body */}
        <div className="legal-body">
          {children}
        </div>

        {/* Footer */}
        <footer className="mt-16 pt-6 border-t border-gray-300 text-center text-gray-400 text-xs" style={{ fontFamily: 'system-ui, sans-serif' }}>
          <p>&copy; {new Date().getFullYear()} SCI Visualizer. All rights reserved.</p>
          <p className="mt-1">This document constitutes a legally binding agreement between you and SCI Visualizer.</p>
        </footer>
      </div>
    </div>
  );
};

export default LegalDocumentLayout;
