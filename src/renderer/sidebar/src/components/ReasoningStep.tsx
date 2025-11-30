import React from 'react';
import { cn } from '@common/lib/utils';

interface ReasoningStepProps {
  type: 'planning' | 'executing' | 'completed' | 'error';
  content: string;
  stepNumber?: number;
  toolName?: string;
}

export const ReasoningStep: React.FC<ReasoningStepProps> = ({
  content,
  stepNumber,
  toolName,
}) => {
  return (
    <div className={cn(
      "text-xs text-gray-500 dark:text-gray-400 opacity-70 transition-opacity",
      "border-l-2 pl-3 py-1 my-1 border-gray-300 dark:border-gray-600"
    )}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {stepNumber && (
            <span className="font-medium mr-2 text-gray-500 dark:text-gray-400">
              Step {stepNumber}
            </span>
          )}
          {toolName && (
            <span className="text-xs font-mono mr-2 text-gray-500 dark:text-gray-400">
              {toolName}
            </span>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {content}
          </span>
        </div>
      </div>
    </div>
  );
};

