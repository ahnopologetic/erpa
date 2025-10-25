import React from 'react';
import { cn } from '~lib/utils';

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const SettingRow: React.FC<SettingRowProps> = ({
  label,
  description,
  children,
  className
}) => {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-3 px-4 border-b border-gray-700/50 min-h-[60px]",
        "hover:bg-gray-800/30 transition-colors overflow-hidden",
        className
      )}
    >
      <div className="flex-1 mr-4 min-w-0">
        <div className="text-sm font-medium text-gray-100 truncate">
          {label}
        </div>
        {description && (
          <div className="text-xs text-gray-400 mt-1 line-clamp-2">
            {description}
          </div>
        )}
      </div>
      <div className="flex-shrink-0 min-w-0">
        {children}
      </div>
    </div>
  );
};
