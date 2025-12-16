import React, { useState, useEffect } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { ToolBarButton } from "../components/ToolBarButton";
import { useDarkMode } from "../../../common/hooks/useDarkMode";

export const DarkModeToggle: React.FC = () => {
    const { isDarkMode, setThemeSource, getThemeSource } = useDarkMode();
    const [themeSource, setThemeSourceState] = useState<"system" | "light" | "dark">("system");
    const [showMenu, setShowMenu] = useState(false);

    useEffect(() => {
        getThemeSource().then(setThemeSourceState);
    }, [getThemeSource]);

    const cycleTheme = () => {
        const nextTheme: "system" | "light" | "dark" = 
            themeSource === "system" ? "light" : 
            themeSource === "light" ? "dark" : "system";
        setThemeSourceState(nextTheme);
        setThemeSource(nextTheme);
    };

    const getIcon = () => {
        if (themeSource === "system") return Monitor;
        return isDarkMode ? Sun : Moon;
    };

    return (
        <div className="relative">
        <ToolBarButton
                Icon={getIcon()}
                onClick={cycleTheme}
            className="text-muted-foreground hover:text-foreground transition-transform"
                title={`Theme: ${themeSource} (click to cycle)`}
        />
        </div>
    );
};
