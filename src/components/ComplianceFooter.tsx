import React from 'react';
import { getIcpRecordNumber, ICP_RECORD_URL } from '../../public/platform/compliance.mjs';

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
      {getIcpRecordNumber()}
    </a>
  </p>
);

export default ComplianceFooter;
