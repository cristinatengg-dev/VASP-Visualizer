import React from 'react';

export const ICP_RECORD_NUMBER = 'Zhejiang ICP Record No. 2026000780';
export const ICP_RECORD_URL = 'https://beian.miit.gov.cn/';

interface ComplianceFooterProps {
  className?: string;
  linkClassName?: string;
}

const ComplianceFooter: React.FC<ComplianceFooterProps> = ({
  className = '',
  linkClassName = '',
}) => (
  <p className={className}>
    <a
      href={ICP_RECORD_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClassName}
    >
      {ICP_RECORD_NUMBER}
    </a>
  </p>
);

export default ComplianceFooter;
