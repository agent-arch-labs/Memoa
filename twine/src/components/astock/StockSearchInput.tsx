import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { StockSuggestItem } from "@/types";

interface StockSearchInputProps {
  onSelect: (item: StockSuggestItem) => void;
  placeholder?: string;
  /** 下拉方向：down 向下弹出（默认），up 向上弹出 */
  direction?: "down" | "up";
  /** 紧凑模式：仅显示搜索图标，点击后展开输入框 */
  compact?: boolean;
}

// 搜索结果缓存：keyword -> items，网络异常时降级使用
const searchCache = new Map<string, StockSuggestItem[]>();
const CACHE_MAX = 50;

export function StockSearchInput({ onSelect, placeholder = "输入股票代码或名称搜索...", direction = "down", compact = false }: StockSearchInputProps) {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<StockSuggestItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchVersionRef = useRef(0);

  const doSearch = useCallback(async (kw: string) => {
    if (kw.trim().length < 1) {
      setResults([]);
      setShowDropdown(false);
      setError(false);
      return;
    }
    const version = ++searchVersionRef.current;
    setLoading(true);
    setError(false);

    // 先查缓存，命中则立即展示
    const cacheKey = kw.trim().toLowerCase();
    if (searchCache.has(cacheKey)) {
      if (version !== searchVersionRef.current) return;
      setResults(searchCache.get(cacheKey)!);
      setShowDropdown(true);
      setLoading(false);
      // 仍然发请求刷新缓存，但不阻塞展示
    }

    try {
      const items = await invoke<StockSuggestItem[]>("stock_suggest", { keyword: kw });
      if (version !== searchVersionRef.current) return;
      setResults(items);
      setShowDropdown(items.length > 0);
      setError(false);
      // 写入缓存
      if (searchCache.size >= CACHE_MAX) {
        const firstKey = searchCache.keys().next().value;
        if (firstKey !== undefined) searchCache.delete(firstKey);
      }
      searchCache.set(cacheKey, items);
    } catch {
      if (version !== searchVersionRef.current) return;
      // 网络异常降级：如果缓存未命中，展示错误提示；缓存已命中则保持缓存结果
      if (!searchCache.has(cacheKey)) {
        setError(true);
      }
    } finally {
      if (version === searchVersionRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(keyword), 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [keyword, doSearch]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        if (compact) setExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [compact]);

  function handleSelect(item: StockSuggestItem) {
    onSelect(item);
    setKeyword("");
    setResults([]);
    setShowDropdown(false);
    if (compact) setExpanded(false);
  }

  function handleCompactClick() {
    setExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const dropdownClass = direction === "up"
    ? "absolute z-50 left-0 right-0 bottom-full mb-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded shadow-lg max-h-60 overflow-y-auto"
    : "absolute z-50 left-0 right-0 top-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded shadow-lg max-h-60 overflow-y-auto";

  // 紧凑模式：显示搜索图标，点击展开输入框
  if (compact && !expanded) {
    return (
      <div ref={containerRef}>
        <button
          className="flex items-center gap-1 px-1.5 py-0 rounded-sm hover:bg-[var(--color-surface-hover)] transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          onClick={handleCompactClick}
          title="搜索股票"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" strokeLinecap="round" />
          </svg>
          <span className="text-[10px]">搜索</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={compact ? "relative" : "relative"}>
      <input
        ref={inputRef}
        className={`w-full px-2 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-accent)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] ${
          compact ? "h-5 text-[10px]" : "h-7"
        }`}
        placeholder={placeholder}
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
      />
      {loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--color-text-muted)]">
          ...
        </div>
      )}
      {error && keyword.trim().length > 0 && (
        <div className={dropdownClass}>
          <div className="px-2 py-2 text-[10px] text-[var(--color-text-muted)] text-center">
            网络异常，请稍后重试
          </div>
        </div>
      )}
      {showDropdown && results.length > 0 && (
        <div className={dropdownClass}>
          {results.map((item) => {
            return (
              <button
                key={item.fullCode}
                className="w-full text-left px-2 py-1.5 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2"
                onClick={() => handleSelect(item)}
              >
                <span className="text-[var(--color-accent)] font-mono shrink-0">{item.code}</span>
                <span className="text-[var(--color-text-primary)] truncate">{item.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
