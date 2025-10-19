import React from 'react';
// Temporarily use simple provider to avoid runtime dependency issues
// import { AssistantRuntimeProvider } from '@assistant-ui/react';
// import { createAssistantRuntime } from '@assistant-ui/react';

interface MessagesRuntimeProviderProps {
  children: React.ReactNode;
}

export const MessagesRuntimeProvider: React.FC<MessagesRuntimeProviderProps> = ({ children }) => {
  // For now, just pass through the children without runtime
  // The MessagesPrimitive component will use its fallback implementation
  return <>{children}</>;
};
