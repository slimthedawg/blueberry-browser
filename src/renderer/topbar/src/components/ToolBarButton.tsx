import React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "../../../common/lib/utils";

interface ToolBarButtonProps {
    Icon?: LucideIcon;
    active?: boolean;
    toggled?: boolean;
    onClick?: () => void;
    children?: React.ReactNode;
    className?: string;
}

export const ToolBarButton: React.FC<ToolBarButtonProps> = ({
    Icon,
    active = true,
    toggled = false,
    onClick,
    children,
    className,
}) => {
    return (
        <div
            className={cn(
                "size-8 flex items-center justify-center rounded-full",
                "app-region-no-drag",
                "transition-all duration-150",
                !active 
                    ? "opacity-40 cursor-not-allowed" 
                    : "hover:bg-muted/70 active:bg-muted cursor-pointer",
                toggled && "bg-muted/50",
                className
            )}
            onClick={active ? onClick : undefined}
            tabIndex={-1}
            title={!active ? "Not available" : undefined}
        >
            {children || (Icon && <Icon className="size-4" />)}
        </div>
    );
};
