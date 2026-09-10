import React from 'react';

export const ICP_RECORD_NUMBER = '浙ICP备2026000780号';
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
