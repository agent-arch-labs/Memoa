import { create } from "zustand";
import { getString, setString } from "@/services/storageService";

export type Locale = "zh-CN" | "en-US";

const zhCN: Record<string, string> = {
  "settings.title": "设置",
  "settings.options": "选项",
  "settings.plugins": "插件",
  "settings.general": "通用",
  "settings.general.desc": "账号、语言等常规设置",
  "settings.edit": "编辑",
  "settings.edit.desc": "编辑器行为配置",
  "settings.appearance": "外观",
  "settings.appearance.desc": "主题、字体等视觉设置",
  "settings.hotkeys": "快捷键",
  "settings.hotkeys.desc": "自定义键盘快捷键",
  "settings.models": "模型",
  "settings.models.desc": "LLM 对话模型与向量化模型配置",
  "settings.data": "数据",
  "settings.data.desc": "知识库索引管理",
  "settings.knowledge_base": "知识库",
  "settings.knowledge_base.desc": "远程知识库服务配置",
  "settings.knowledge_base.endpoint": "服务位置",
  "settings.knowledge_base.endpoint.hint": "知识库服务的 IP:Port 地址，例如 127.0.0.1:8080",
  "settings.knowledge_base.api_key": "API Key",
  "settings.knowledge_base.api_key.hint": "访问知识库服务所需的认证密钥",
  "settings.knowledge_base.test": "测试连接",
  "settings.knowledge_base.top_k": "检索 Top K",
  "settings.knowledge_base.top_k.hint": "检索返回的最大结果数量，范围 1-100",
  "settings.knowledge_base.threshold": "相似度阈值",
  "settings.knowledge_base.threshold.hint": "仅返回相似度高于此阈值的结果，范围 0.0-1.0",
  "settings.search_extensions": "检索扩展",
  "settings.search_extensions.desc": "Tavily 与自定义检索接口配置",
  "settings.agent": "AI Agent",
  "settings.agent.desc": "MCP Agent 运行时与工作流",

  "settings.menu_management": "菜单管理",
  "settings.menu_management.desc": "侧边栏菜单的启用、排序与图标自定义",
  "settings.menu_management.reset": "恢复默认",

  "settings.plugin.sync": "同步",
  "settings.plugin.sync.desc": "多端数据同步配置",
  "settings.plugin.pagepreview": "页面预览",
  "settings.plugin.pagepreview.desc": "悬停预览链接内容",
  "settings.plugin.templates": "模板",
  "settings.plugin.templates.desc": "笔记模板管理",
  "settings.plugin.dailynotes": "日记",
  "settings.plugin.dailynotes.desc": "日记功能配置",
  "settings.plugin.backlinks": "反向链接",
  "settings.plugin.backlinks.desc": "反向链接显示设置",

  "settings.coming_soon": "即将上线",
  "settings.coming_soon.desc": "该功能正在开发中，敬请期待...",

  "general.language": "界面语言",
  "general.language.desc": "选择应用的显示语言",
  "general.account": "账号",
  "general.account.desc": "商业证书与账号管理",
  "general.license": "商业证书",
  "general.license.placeholder": "请输入商业证书密钥...",

  "edit.tab_size": "Tab 大小",
  "edit.tab_size.desc": "编辑器缩进空格数",
  "edit.show_line_numbers": "显示行号",
  "edit.show_line_numbers.desc": "在编辑器左侧显示行号",
  "edit.auto_save": "自动保存",
  "edit.auto_save.desc": "编辑器内容自动保存到文件",
  "edit.spell_check": "拼写检查",
  "edit.spell_check.desc": "开启 Markdown 拼写检查",

  "appearance.theme": "主题",
  "appearance.theme.desc": "选择深色或浅色主题",
  "appearance.theme.dark": "深色",
  "appearance.theme.light": "浅色",
  "appearance.font_size": "字体大小",
  "appearance.font_size.desc": "编辑器与界面字体大小",
  "appearance.font_size.increase": "放大字体",
  "appearance.font_size.decrease": "缩小字体",
  "appearance.font_size.shortcut": "快捷键: Ctrl + 加号 放大, Ctrl + 减号 缩小",
  "appearance.font_family": "字体",
  "appearance.font_family.desc": "编辑器字体样式",
  "appearance.interface_font": "界面字体",
  "appearance.interface_font.desc": "UI 界面字体样式",

  "hotkeys.coming_soon": "快捷键自定义功能即将上线",
  "hotkeys.coming_soon.desc": "届时可以自由配置所有操作的快捷键组合",

  "save": "保存",
  "cancel": "取消",
  "close": "关闭",
};

const enUS: Record<string, string> = {
  "settings.title": "Settings",
  "settings.options": "Options",
  "settings.plugins": "Plugins",
  "settings.general": "General",
  "settings.general.desc": "Account, language & general preferences",
  "settings.edit": "Edit",
  "settings.edit.desc": "Editor behavior configuration",
  "settings.appearance": "Appearance",
  "settings.appearance.desc": "Theme, fonts & visual settings",
  "settings.hotkeys": "Hotkeys",
  "settings.hotkeys.desc": "Customize keyboard shortcuts",
  "settings.models": "Models",
  "settings.models.desc": "LLM & embedding model configuration",
  "settings.data": "Data",
  "settings.data.desc": "Knowledge base index management",
  "settings.knowledge_base": "Knowledge Base",
  "settings.knowledge_base.desc": "Remote knowledge base service configuration",
  "settings.knowledge_base.endpoint": "Service Endpoint",
  "settings.knowledge_base.endpoint.hint": "IP:Port address of the knowledge base service, e.g. 127.0.0.1:8080",
  "settings.knowledge_base.api_key": "API Key",
  "settings.knowledge_base.api_key.hint": "Authentication key for accessing the knowledge base service",
  "settings.knowledge_base.test": "Test Connection",
  "settings.knowledge_base.top_k": "Retrieval Top K",
  "settings.knowledge_base.top_k.hint": "Maximum number of results to return, range 1-100",
  "settings.knowledge_base.threshold": "Similarity Threshold",
  "settings.knowledge_base.threshold.hint": "Only return results above this similarity score, range 0.0-1.0",
  "settings.search_extensions": "Search Extensions",
  "settings.search_extensions.desc": "Tavily & custom search API configuration",
  "settings.agent": "AI Agent",
  "settings.agent.desc": "MCP Agent runtime & workflow",

  "settings.menu_management": "Menu Management",
  "settings.menu_management.desc": "Enable, sort & customize sidebar menu icons",
  "settings.menu_management.reset": "Reset to Default",

  "settings.plugin.sync": "Sync",
  "settings.plugin.sync.desc": "Multi-device sync configuration",
  "settings.plugin.pagepreview": "Page Preview",
  "settings.plugin.pagepreview.desc": "Hover preview linked content",
  "settings.plugin.templates": "Templates",
  "settings.plugin.templates.desc": "Note template management",
  "settings.plugin.dailynotes": "Daily Notes",
  "settings.plugin.dailynotes.desc": "Daily notes configuration",
  "settings.plugin.backlinks": "Backlinks",
  "settings.plugin.backlinks.desc": "Backlink display settings",

  "settings.coming_soon": "Coming Soon",
  "settings.coming_soon.desc": "This feature is under development. Stay tuned...",

  "general.language": "Interface Language",
  "general.language.desc": "Select the display language",
  "general.account": "Account",
  "general.account.desc": "Commercial license & account management",
  "general.license": "Commercial License",
  "general.license.placeholder": "Enter your commercial license key...",

  "edit.tab_size": "Tab Size",
  "edit.tab_size.desc": "Editor indent spaces",
  "edit.show_line_numbers": "Show Line Numbers",
  "edit.show_line_numbers.desc": "Display line numbers in editor",
  "edit.auto_save": "Auto Save",
  "edit.auto_save.desc": "Automatically save editor content",
  "edit.spell_check": "Spell Check",
  "edit.spell_check.desc": "Enable Markdown spell checking",

  "appearance.theme": "Theme",
  "appearance.theme.desc": "Choose dark or light theme",
  "appearance.theme.dark": "Dark",
  "appearance.theme.light": "Light",
  "appearance.font_size": "Font Size",
  "appearance.font_size.desc": "Editor and interface font size",
  "appearance.font_size.increase": "Increase font size",
  "appearance.font_size.decrease": "Decrease font size",
  "appearance.font_size.shortcut": "Shortcut: Ctrl + Plus to zoom in, Ctrl + Minus to zoom out",
  "appearance.font_family": "Font",
  "appearance.font_family.desc": "Editor font family",
  "appearance.interface_font": "Interface Font",
  "appearance.interface_font.desc": "UI interface font family",

  "hotkeys.coming_soon": "Hotkey customization is coming soon",
  "hotkeys.coming_soon.desc": "You will be able to freely configure keyboard shortcuts for all actions",

  "save": "Save",
  "cancel": "Cancel",
  "close": "Close",
};

const translations: Record<Locale, Record<string, string>> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

let currentLocale: Locale = "zh-CN";

export function setLocale(locale: Locale) {
  currentLocale = locale;
}

export function getLocale(): Locale {
  const stored = getString("locale", "");
  if (stored === "zh-CN" || stored === "en-US") {
    currentLocale = stored;
  } else {
    currentLocale = "zh-CN";
  }
  return currentLocale;
}

export function saveLocale(locale: Locale) {
  currentLocale = locale;
  setString("locale", locale);
}

export const useLocaleStore = create<{
  locale: Locale;
  setLocale: (l: Locale) => void;
}>((set) => ({
  locale: getLocale(),
  setLocale: (l: Locale) => {
    saveLocale(l);
    set({ locale: l });
  },
}));

export function t(key: string): string {
  const locale = currentLocale;
  const dict = translations[locale];
  return dict?.[key] || translations["zh-CN"]?.[key] || key;
}

export function useTranslate() {
  return { t, locale: currentLocale, setLocale: saveLocale, getLocale };
}