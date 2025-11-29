import React from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@common/components/Button';

interface ActionStep {
  stepNumber: number;
  tool: string;
  parameters: Record<string, any>;
  reasoning: string;
  requiresConfirmation: boolean;
}

interface ConfirmationDialogProps {
  request: {
    id: string;
    step: ActionStep;
  };
  onConfirm: (id: string, confirmed: boolean) => void;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  request,
  onConfirm,
}) => {
  const handleConfirm = () => {
    onConfirm(request.id, true);
  };

  const handleReject = () => {
    onConfirm(request.id, false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Confirm Action
          </h3>
          <p className="text-sm text-muted-foreground">
            The agent wants to execute the following step:
          </p>
        </div>

        <div className="bg-muted/30 dark:bg-muted/20 rounded-lg p-4 mb-4 border border-border/50">
          <div className="mb-2">
            <span className="text-xs font-semibold text-foreground/80">
              Step {request.step.stepNumber}
            </span>
            <span className="ml-2 font-mono text-xs text-primary">
              {request.step.tool}
            </span>
          </div>
          <div className="text-sm text-muted-foreground mb-3">
            {request.step.reasoning}
          </div>
          {Object.keys(request.step.parameters).length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="text-xs font-semibold text-foreground/80 mb-2">
                Parameters:
              </div>
              <pre className="text-xs bg-background/50 p-2 rounded overflow-x-auto">
                {JSON.stringify(request.step.parameters, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <Button
            onClick={handleReject}
            variant="ghost"
            className="text-destructive hover:text-destructive"
          >
            <X className="size-4 mr-2" />
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            className="bg-primary text-primary-foreground hover:opacity-90"
          >
            <Check className="size-4 mr-2" />
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
};

