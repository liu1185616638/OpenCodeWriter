import { useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    // Carbon Frost is dark-first design system
    return "dark";
  });

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme(prev => prev === "dark" ? "light" : "dark");
  }, []);

  const set = useCallback((t: Theme) => {
    setTheme(t);
  }, []);

  return { theme, toggle, set };
}
