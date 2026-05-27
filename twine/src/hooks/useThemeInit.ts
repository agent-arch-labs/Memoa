import { useEffect } from "react";
import { useAppStore } from "@/stores/appStore";

export function useThemeInit() {
  const isDark = useAppStore((s) => s.isDark);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);
}