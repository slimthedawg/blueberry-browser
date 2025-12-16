import React from 'react';
import { cn } from '@common/lib/utils';
import { Loader2 } from 'lucide-react';

interface ReasoningStepProps {
  type: 'planning' | 'executing' | 'completed' | 'error' | 'thinking';
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
  // Get border color based on type
  const getBorderColor = () => {
    switch (type) {
      case 'planning':
        return 'border-blue-300 dark:border-blue-700';
      case 'thinking':
        return 'border-orange-300 dark:border-orange-700';
      case 'executing':
        return 'border-purple-300 dark:border-purple-700';
      case 'completed':
        return 'border-green-300 dark:border-green-700';
      case 'error':
        return 'border-red-300 dark:border-red-700';
      default:
        return 'border-gray-300 dark:border-gray-600';
    }
  };

  // Make errors more prominent
  const isError = type === 'error';
  
  return (
    <div className={cn(
      "text-xs transition-all duration-200",
      "border-l-2 pl-3 py-1.5 my-0.5 rounded-r",
      isError 
        ? "bg-red-50/80 dark:bg-red-900/30 border-red-500 dark:border-red-600" 
        : "bg-gray-50/50 dark:bg-gray-800/30",
      getBorderColor()
    )}>
      <div className="flex items-start gap-2">
        {type === 'thinking' && (
          <Loader2 className="w-3 h-3 mt-0.5 text-orange-500 animate-pulse flex-shrink-0" />
        )}
        {type === 'executing' && (
          <Loader2 className="w-3 h-3 mt-0.5 text-purple-500 animate-spin flex-shrink-0" />
        )}
        {isError && (
          <span className="text-red-500 dark:text-red-400 text-base flex-shrink-0">⚠️</span>
        )}
        <div className="flex-1 min-w-0">
          {stepNumber && (
            <span className={cn(
              "font-medium mr-2",
              isError 
                ? 'text-red-700 dark:text-red-300' 
                : 'text-gray-600 dark:text-gray-300'
            )}>
              Step {stepNumber}
            </span>
          )}
          {toolName && (
            <span className={cn(
              "text-xs font-mono mr-2 px-1.5 py-0.5 rounded",
              isError
                ? "bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            )}>
              {toolName}
            </span>
          )}
          <span className={cn(
            isError ? "text-sm font-medium" : "text-xs",
            type === 'error' 
              ? 'text-red-700 dark:text-red-300' 
              : type === 'completed'
              ? 'text-green-600 dark:text-green-400' 
              : 'text-gray-600 dark:text-gray-300'
          )}>
            {content}
          </span>
        </div>
      </div>
    </div>
  );
};

