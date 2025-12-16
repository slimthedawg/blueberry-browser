import React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "../../../common/lib/utils";

interface TabBarButtonProps {
    Icon: LucideIcon;
    onClick?: () => void;
    className?: string;
}

export const TabBarButton: React.FC<TabBarButtonProps> = ({ Icon, onClick, className }) => {
    return (
        <div
            className={cn(
                "flex items-center justify-center rounded-md",
                "hover:bg-primary/10 active:bg-primary/20 app-region-no-drag",
                "transition-colors duration-200 cursor-pointer",
                "text-primary dark:text-primary",
                className
            )}
            onClick={onClick}
            tabIndex={-1}
        >
            <Icon className="size-4.5" />
        </div>
    );
};
