import React from 'react';

interface AgentGateProps {
  agent: string;
  label: string;
  children: React.ReactNode;
}

export const AgentGate: React.FC<AgentGateProps> = ({ children }) => <>{children}</>;
