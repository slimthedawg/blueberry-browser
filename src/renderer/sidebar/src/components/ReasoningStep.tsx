import React from 'react';
import { cn } from '@common/lib/utils';

interface ReasoningStepProps {
  type: 'planning' | 'executing' | 'completed' | 'error';
  content: string;
  stepNumber?: number;
  toolName?: string;
}

export const ReasoningStep: React.FC<ReasoningStepProps> = ({
  type,
  content,
  stepNumber,
  toolName,
}) => {
  const getIcon = () => {
    switch (type) {
      case 'planning':
        return '🧠';
      case 'executing':
        return '⚙️';
      case 'completed':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '💭';
    }
  };

  const getColorClass = () => {
    switch (type) {
      case 'planning':
        return 'text-blue-500/70 dark:text-blue-400/70';
      case 'executing':
        return 'text-purple-500/70 dark:text-purple-400/70';
      case 'completed':
        return 'text-green-500/70 dark:text-green-400/70';
      case 'error':
        return 'text-red-500/70 dark:text-red-400/70';
      default:
        return 'text-gray-500/70 dark:text-gray-400/70';
    }
  };

  return (
    <div className={cn(
      "text-xs opacity-70 transition-opacity",
      "border-l-2 pl-3 py-1 my-1",
      type === 'planning' && "border-blue-500/30",
      type === 'executing' && "border-purple-500/30",
      type === 'completed' && "border-green-500/30",
      type === 'error' && "border-red-500/30"
    )}>
      <div className="flex items-start gap-2">
        <span className={cn("text-xs", getColorClass())}>{getIcon()}</span>
        <div className="flex-1 min-w-0">
          {stepNumber && (
            <span className={cn("font-medium mr-2", getColorClass())}>
              Step {stepNumber}
            </span>
          )}
          {toolName && (
            <span className={cn("text-xs font-mono mr-2", getColorClass())}>
              {toolName}
            </span>
          )}
          <span className={cn("text-xs", getColorClass())}>
            {content}
          </span>
        </div>
      </div>
    </div>
  );
};

