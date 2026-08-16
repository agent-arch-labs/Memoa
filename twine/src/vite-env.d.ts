/// <reference types="vite/client" />

// markdown-it 插件类型声明
declare module "markdown-it-task-lists" {
  import type { PluginWithOptions } from "markdown-it";
  const plugin: PluginWithOptions<{ enabled?: boolean; label?: boolean; lineNumber?: boolean }>;
  export default plugin;
}

declare module "markdown-it-footnote" {
  import type { PluginWithOptions } from "markdown-it";
  const plugin: PluginWithOptions<Record<string, never>>;
  export default plugin;
}

declare module "markdown-it-sub" {
  import type { PluginWithOptions } from "markdown-it";
  const plugin: PluginWithOptions<Record<string, never>>;
  export default plugin;
}

declare module "markdown-it-sup" {
  import type { PluginWithOptions } from "markdown-it";
  const plugin: PluginWithOptions<Record<string, never>>;
  export default plugin;
}