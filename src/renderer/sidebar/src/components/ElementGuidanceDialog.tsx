import React, { useEffect, useState } from 'react';
import { MousePointer, X } from 'lucide-react';
import { Button } from '@common/components/Button';

interface ElementGuidanceDialogProps {
  request: {
    id: string;
    message: string;
    elementType: string;
    stepNumber: number;
  };
  onResponse: (id: string, selector?: string, elementInfo?: any, cancelled?: boolean) => void;
}

export const ElementGuidanceDialog: React.FC<ElementGuidanceDialogProps> = ({
  request,
  onResponse,
}) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedElement, setSelectedElement] = useState<{ selector: string; elementInfo: any } | null>(null);

  useEffect(() => {
    if (isSelecting) {
      // Inject element selection script into active tab
      const startElementSelection = async () => {
        try {
          // Get active tab info
          const tabInfo = await window.sidebarAPI.getActiveTabInfo();
          if (!tabInfo) {
            alert('No active tab found. Please open a web page first.');
            setIsSelecting(false);
            return;
          }

          // We'll need to communicate with the tab to enable element selection
          // For now, show instructions to the user
          alert(`Please click on the ${request.elementType} you want me to use. The page will highlight elements as you hover.`);
        } catch (error) {
          console.error('Failed to start element selection:', error);
          setIsSelecting(false);
        }
      };

      startElementSelection();
    }
  }, [isSelecting, request.elementType]);

  const handleStartSelection = () => {
    setIsSelecting(true);
    // Enable element selection mode in the active tab
    // This will be handled by injecting a script that highlights elements on hover
    // and captures clicks to get the element selector
  };

  const handleCancel = () => {
    setIsSelecting(false);
    setSelectedElement(null);
    onResponse(request.id, undefined, undefined, true);
  };

  const handleConfirm = () => {
    if (selectedElement) {
      onResponse(request.id, selectedElement.selector, selectedElement.elementInfo, false);
    } else {
      // If no element selected but user clicked confirm, they might have clicked on the page
      // We'll need to get the selected element from the page
      onResponse(request.id, undefined, undefined, false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-foreground mb-2">
            I Need Your Help
          </h3>
          <p className="text-sm text-muted-foreground mb-2">
            {request.message}
          </p>
          <p className="text-xs text-muted-foreground">
            Step {request.stepNumber} • Looking for: {request.elementType}
          </p>
        </div>

        {!isSelecting ? (
          <div className="space-y-4">
            <div className="bg-muted/30 dark:bg-muted/20 rounded-lg p-4 border border-border/50">
              <p className="text-sm text-foreground mb-2 font-semibold">
                What to do:
              </p>
              <ol className="text-sm text-foreground space-y-2 list-decimal list-inside">
                <li>Click the <strong>"Start Selection"</strong> button below</li>
                <li>Then click on the {request.elementType} on the web page</li>
                <li>The AI will use that element to continue</li>
              </ol>
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                onClick={handleCancel}
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={handleStartSelection}
                className="bg-primary text-primary-foreground hover:opacity-90"
              >
                <MousePointer className="size-4 mr-2" />
                Start Selection
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <p className="text-sm text-foreground mb-2">
                <strong>Selection Mode Active</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Hover over elements on the page to see them highlighted. Click on the {request.elementType} you want me to use.
              </p>
            </div>

            {selectedElement && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                <p className="text-xs text-foreground mb-1">
                  <strong>Element Selected:</strong>
                </p>
                <p className="text-xs font-mono text-muted-foreground">
                  {selectedElement.selector}
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <Button
                onClick={handleCancel}
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!selectedElement}
                className="bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Confirm Selection
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

