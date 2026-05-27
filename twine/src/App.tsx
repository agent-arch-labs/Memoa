import { useEffect, useState } from "react";
import { TitleBar } from "./components/layout/TitleBar";
import { PanelLayout } from "./components/layout/PanelLayout";
import { WindowResizer } from "./components/layout/WindowResizer";
import { useAppStore } from "./stores/appStore";
import { useThemeInit } from "./hooks/useThemeInit";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useTauriCommands } from "./hooks/useTauriCommands";
import { getLocale } from "./i18n/locale";
import { getVaultPath, setVaultPath as persistVaultPath } from "./services/storageService";

export function App() {
  useThemeInit();
  useKeyboardShortcuts();
  getLocale();
  const setVaultPath = useAppStore((s) => s.setVaultPath);
  const setVaultInfo = useAppStore((s) => s.setVaultInfo);
  const setIndexing = useAppStore((s) => s.setIndexing);
  const fontSize = useAppStore((s) => s.fontSize);
  const commands = useTauriCommands();
  const [initDone, setInitDone] = useState(false);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`;
  }, [fontSize]);

  useEffect(() => {
    async function autoOpenVault() {
      try {
        const home = await commands.getHomeDir();
        const defaultPath = `${home}/Memoa`;
        const storedPath = getVaultPath();
        const vaultPath = storedPath || defaultPath;
        const info = await commands.openVault(vaultPath);
        setVaultPath(vaultPath);
        setVaultInfo(info);
        persistVaultPath(vaultPath);

        setIndexing(true);
        commands.reindexVault().then((stats) => {
          console.log("Reindex done:", stats);
          setIndexing(false);
        }).catch((e) => {
          console.error("Reindex failed:", e);
          setIndexing(false);
        });
      } catch {
      } finally {
        setInitDone(true);
      }
    }
    autoOpenVault();
  }, []);

  if (!initDone) {
    return (
      <div className="flex items-center justify-center h-full bg-[var(--color-surface)]">
        <div className="text-center">
          <div className="text-4xl mb-4">🧠</div>
          <p className="text-sm text-[var(--color-text-muted)]">Memoa 启动中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <WindowResizer />
      <TitleBar />
      <PanelLayout />
    </div>
  );
}