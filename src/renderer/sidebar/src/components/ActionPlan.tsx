import React from 'react';
import { cn } from '@common/lib/utils';

interface ActionStep {
  stepNumber: number;
  tool: string;
  parameters: Record<string, any>;
  reasoning: string;
  requiresConfirmation: boolean;
}

interface ActionPlanProps {
  steps: ActionStep[];
  currentStep?: number;
  goal?: string;
}

export const ActionPlan: React.FC<ActionPlanProps> = ({
  steps,
  currentStep,
  goal,
}) => {
  return (
    <div className="bg-muted/30 dark:bg-muted/20 rounded-lg p-3 my-2 border border-border/50">
      {goal && (
        <div className="text-xs font-semibold text-foreground/80 mb-2">
          Goal: {goal}
        </div>
      )}
      <div className="space-y-1.5">
        {steps.map((step) => {
          const isCurrent = step.stepNumber === currentStep;
          const isCompleted = currentStep !== undefined && step.stepNumber < currentStep;
          
          return (
            <div
              key={step.stepNumber}
              className={cn(
                "text-xs p-2 rounded border transition-colors",
                isCurrent && "bg-primary/10 border-primary/30",
                isCompleted && "bg-green-500/10 border-green-500/20 opacity-60",
                !isCurrent && !isCompleted && "bg-background/50 border-border/30"
              )}
            >
              <div className="flex items-start gap-2">
                <span className={cn(
                  "text-xs font-medium",
                  isCurrent && "text-primary",
                  isCompleted && "text-green-500",
                  !isCurrent && !isCompleted && "text-muted-foreground"
                )}>
                  {step.stepNumber}.
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-foreground/70">
                      {step.tool}
                    </span>
                    {step.requiresConfirmation && (
                      <span className="text-xs text-yellow-500/70">⚠️</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {step.reasoning}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

