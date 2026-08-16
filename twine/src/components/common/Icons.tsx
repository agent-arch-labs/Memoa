/**
 * VSCode-style SVG icon components.
 * All icons use 16x16 viewBox, inherit color via `currentColor`.
 */

import type { ReactNode } from "react";

/* ── Basic shape icons ── */

export function IconFile({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M10 1H3a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V5l-4-4zm-.5 1.5L12.5 5.5H9.5V2.5zM3 14V2h5v4h4v8H3z" /></svg>;
}

export function IconFolder({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M14 4H8l-1-2H2a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V5a1 1 0 00-1-1zm-1 9H3V6h10v7z" /></svg>;
}

export function IconFolderOpen({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 012.5 2h3.17a1.5 1.5 0 011.1.48l.95.98H13.5A1.5 1.5 0 0115 4.96V6H5.09a1.5 1.5 0 00-1.44 1.08L1 14V3.5zm1.73 4.58A.5.5 0 013.2 7.5h11.3a.5.5 0 01.48.64l-1.88 6.3a.5.5 0 01-.48.36H1.7a.5.5 0 01-.48-.64l1.51-5.74z" /></svg>;
}

export function IconSearch({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="6.5" cy="6.5" r="4.5" /><line x1="10" y1="10" x2="14" y2="14" /></svg>;
}

export function IconGlobe({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zM5.2 13.2A5.5 5.5 0 013.7 8.5h2a9 9 0 00.5 2.7 5.5 5.5 0 00-1 2zm5.6 0a5.5 5.5 0 01-1-2 9 9 0 00.5-2.7h2a5.5 5.5 0 01-1.5 4.7zM8 14c-.5 0-1.2-.8-1.6-2.1a7.5 7.5 0 01-.4-1.9h4a7.5 7.5 0 01-.4 1.9C9.2 13.2 8.5 14 8 14zm-2.5-5a7.5 7.5 0 01.4-1.9C6.3 5.8 7 5 7.5 5h1c.5 0 1.2.8 1.6 2.1.2.6.3 1.2.4 1.9h-5zm5.3 0h-2a9 9 0 00-.5-2.7 5.5 5.5 0 011-2A5.5 5.5 0 0113.3 8.5h-2.5zm-7.6 0H3.2a5.5 5.5 0 012.6-4.7 5.5 5.5 0 011 2A9 9 0 006.2 8.5z" /></svg>;
}

export function IconKnowledge({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M8.5 1.5l-6 3v7l6 3 6-3v-7l-6-3zm0 1.1l4.5 2.25-4.5 2.25L4 4.85 8.5 2.6zM3 5.4l5 2.5v5.5l-5-2.5V5.4zm6 8V7.9l5-2.5v5.5l-5 2.5z" /></svg>;
}

export function IconTrend({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 12 4 8 7 10 10 5 15 3" /><polyline points="12 3 15 3 15 6" /></svg>;
}

export function IconShield({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 1.1l3 1.4c.3.1.5.4.5.7v3.6c0 2.8-2 5.4-4.5 6.2C6 12.2 4 9.6 4 6.8V3.2c0-.3.2-.6.5-.7l3-1.4c.3-.1.7-.1 1 0z" /></svg>;
}

export function IconLock({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a4 4 0 00-4 4v1H3a1 1 0 00-1 1v7a1 1 0 001 1h10a1 1 0 001-1V7a1 1 0 00-1-1h-1V5a4 4 0 00-4-4zm2.5 5h-5V5a2.5 2.5 0 015 0v1zM3 14V7h10v7H3z" /></svg>;
}

export function IconHistory({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 107 7h-1.5A5.5 5.5 0 118 13.5 5.47 5.47 0 013.56 11H5V9.5H1v4h1.5v-2A6.98 6.98 0 008 15a7 7 0 000-14z" /><path d="M7.5 4v4.25l3.5 2.1.75-1.24L9 7.25V4H7.5z" /></svg>;
}

export function IconSparkle({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M9 1l1 2 2 .5-1.5 1.5.3 2L9 6.3 7.2 7l.3-2L6 3.5 8 3l1-2z" /></svg>;
}

export function IconClose({ size = 10 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></svg>;
}

export function IconCheck({ size = 8 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 8 7 12 13 4" /></svg>;
}

export function IconRefresh({ size = 12 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 8a6.5 6.5 0 0112.1-3.3M14.5 8a6.5 6.5 0 01-12.1 3.3" /><polyline points="14 1.5 14 4.7 10.8 4.7" /><polyline points="2 11.3 2 14.5 5.2 14.5" /></svg>;
}

export function IconWarning({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M8 1L1 14h14L8 1zm0 2.5L12.9 13H3.1L8 3.5zM7.5 6v3h1V6h-1zm0 4v1h1v-1h-1z" /></svg>;
}

export function IconBrain({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M7.5 1C5.5 1 4 2.5 4 4.5V5H3a2 2 0 00-2 2v2a2 2 0 002 2h1v1.5C4 14.5 5.5 16 7.5 16h1c2 0 3.5-1.5 3.5-3.5V11h1a2 2 0 002-2V7a2 2 0 00-2-2h-1V4.5C12 2.5 10.5 1 8.5 1h-1zM5 4.5C5 3.1 6.1 2 7.5 2h1C9.9 2 11 3.1 11 4.5V5H5V4.5zM3 6h10a1 1 0 011 1v2a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1zm2 5h6v1.5C11 13.9 9.9 15 8.5 15h-1C6.1 15 5 13.9 5 12.5V11z" /></svg>;
}

export function IconRobot({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a4 4 0 014 4v1h1a2 2 0 012 2v5a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h1V5a4 4 0 014-4zm0 1.5A2.5 2.5 0 005.5 5v1h5V5A2.5 2.5 0 008 2.5z" /></svg>;
}

export function IconMoon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M9.6 1a7 7 0 105.4 5.4A5.5 5.5 0 019.6 1zM7 2.5a5.5 5.5 0 00-3.1 10A5.5 5.5 0 017 2.5z" /></svg>;
}

export function IconSun({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.9 2.9l1.4 1.4M11.7 11.7l1.4 1.4M2.9 13.1l1.4-1.4M11.7 4.3l1.4-1.4" /><circle cx="8" cy="8" r="3" fill="currentColor" stroke="none" /></svg>;
}

export function IconPalette({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14c.6 0 1-.4 1-1 0-.3-.1-.5-.3-.7-.2-.2-.3-.5-.3-.8 0-.8.7-1.5 1.5-1.5H12a4 4 0 004-4A7 7 0 008 1zM4.5 8a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm3-3.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm3 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM13.5 8a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" /></svg>;
}

export function IconKeyboard({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M2 4a1 1 0 00-1 1v6a1 1 0 001 1h12a1 1 0 001-1V5a1 1 0 00-1-1H2zm0-1h12a2 2 0 012 2v6a2 2 0 01-2 2H2a2 2 0 01-2-2V5a2 2 0 012-2zm1.5 3h1a.5.5 0 010 1h-1a.5.5 0 010-1zm3 0h1a.5.5 0 010 1h-1a.5.5 0 010-1zm3 0h1a.5.5 0 010 1h-1a.5.5 0 010-1zm3 0h1a.5.5 0 010 1h-1a.5.5 0 010-1zM4 10h8v1H4v-1z" /></svg>;
}

export function IconGear({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M9.4 1H6.6L6.2 3.2a5.97 5.97 0 00-1.5.87L2.6 3.1 1.2 5.5l1.8 1.4a6.04 6.04 0 000 1.74L1.2 10l1.4 2.4 2.1-.97c.47.36.98.66 1.53.87L6.6 15h2.8l.4-2.2c.55-.2 1.06-.5 1.53-.87l2.1.97 1.4-2.4-1.8-1.4a6.04 6.04 0 000-1.74l1.8-1.4-1.4-2.4-2.1.97a5.97 5.97 0 00-1.5-.87L9.4 1zM8 5a3 3 0 110 6 3 3 0 010-6z" /></svg>;
}

export function IconPlug({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M10.5 1l-1 1 2 2L9 6.5 7 4.5l-1 1L8 7.5 3.5 12 2 14l2-1.5L8.5 8l2 2 1-1L9.5 7l2-2 2 2 1-1-4-4z" /></svg>;
}

export function IconChart({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M2 14V2h1v12H2zm2-3V5h2v6H4zm3 3V2h2v12H7zm3-5V5h2v4h-2zm3 2V5h2v6h-2z" /></svg>;
}

export function IconTag({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M1 1l5.5.7L14.3 9.5 9.5 14.3 1.7 6.5 1 1zm1.5.5l.4 3.7 6.6 6.6 3.3-3.3-6.6-6.6-3.7-.4zM5 4.5a.5.5 0 110-1 .5.5 0 010 1z" /></svg>;
}

export function IconLink({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M6.35 9.65a3 3 0 004.24 0l2-2a3 3 0 00-4.24-4.24l-.5.5.7.7.5-.5a2 2 0 012.83 2.83l-2 2a2 2 0 01-2.83 0l-.06-.06-.7.7.06.07zm3.3-3.3a3 3 0 00-4.24 0l-2 2a3 3 0 004.24 4.24l.5-.5-.7-.7-.5.5a2 2 0 01-2.83-2.83l2-2a2 2 0 012.83 0l.06.06.7-.7-.06-.07z" /></svg>;
}

export function IconCalendar({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M5 1v1H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V3a1 1 0 00-1-1h-2V1h-1v1H6V1H5zM3 6h10v7H3V6zm0-3h2v1h1V3h4v1h1V3h2v2H3V3z" /></svg>;
}

export function IconHome({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M8 1L1 7.5V14h4.5V9h3v5H15V7.5L8 1zm0 1.4L14 8v5H9.5V8h-7v5H2V8L8 2.4z" /></svg>;
}

export function IconStar({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l2.2 4.5L15 6.2l-3.5 3.4.8 4.9L8 12.2l-4.3 2.3.8-4.9L1 6.2l4.8-.7L8 1z" /></svg>;
}

export function IconLightbulb({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a5 5 0 00-3 9v2a1 1 0 001 1h4a1 1 0 001-1v-2A5 5 0 008 1zM6 14h4v1H6v-1z" /></svg>;
}

export function IconBookmark({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M3 1a1 1 0 00-1 1v13l3-2 3 2 3-2 3 2V2a1 1 0 00-1-1H3zm1 2h8v9.5l-2-1.33-3 2-3-2V3z" /></svg>;
}

export function IconPin({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M9.8 1.2l5 5-1.4 1.4-1.1-1.1-2.8 2.8.7 3.5-1.4 1.4-2.5-2.5-3.2 3.2-1-1 3.2-3.2L3.3 8l1.4-1.4 3.5.7 2.8-2.8-1.1-1.1 1.4-1.4z" /></svg>;
}

export function IconLayers({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M8 1L1 5l7 4 7-4-7-4zM3.5 5L8 2.7 12.5 5 8 7.3 3.5 5zM1 8l7 4 7-4-1.1-.6L8 11.3 2.1 7.4 1 8zm0 3l7 4 7-4-1.1-.6L8 14.3l-5.9-3.9L1 11z" /></svg>;
}

export function IconChat({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M2 2a1 1 0 00-1 1v8a1 1 0 001 1h2.5L8 14.5 11.5 12H14a1 1 0 001-1V3a1 1 0 00-1-1H2zm0 1h12v7h-2.5L8 13.1 6.5 10H2V3z" /></svg>;
}

export function IconTarget({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="3" /><circle cx="8" cy="8" r="0.5" fill="currentColor" stroke="none" /></svg>;
}

export function IconBell({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a4.5 4.5 0 00-4.5 4.5V10l-1 1v1h11v-1l-1-1V5.5A4.5 4.5 0 008 1zm0 1a3.5 3.5 0 013.5 3.5V10.5l1 1H3.5l1-1V5.5A3.5 3.5 0 018 2zM6 13a2 2 0 004 0H6z" /></svg>;
}

export function IconHeart({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M8 14s-5.5-4-5.5-7.5C2.5 4 4 2.5 5.5 2.5c1.1 0 2 .6 2.5 1.5.5-.9 1.4-1.5 2.5-1.5C12 2.5 13.5 4 13.5 6.5 13.5 10 8 14 8 14z" /></svg>;
}

export function IconLightning({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M9 1L4 9h3v6l5-8H9V1z" /></svg>;
}

export function IconFire({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M8 1c0 2-2 3-2 5a3 3 0 006 0c0-2-2-3-2-5-1 1-1.5 2-1.5 3 0 .5-.5 1-1 1s-1-.5-1-1C6.5 3 6 2 8 1zM5 9c0 2.5 1.5 5 3 6 1.5-1 3-3.5 3-6 0-.5-.1-1-.3-1.5C10.2 8.7 9.2 9.5 8 9.5s-2.2-.8-2.7-2C5.1 8 5 8.5 5 9z" /></svg>;
}

export function IconWater({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M8 1S4 6.5 4 9.5a4 4 0 008 0C12 6.5 8 1 8 1zm0 2c.8 1.5 3 5 3 6.5a3 3 0 01-6 0C5 8 7.2 4.5 8 3z" /></svg>;
}

export function IconBook({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M2 2a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V3a1 1 0 00-1-1H2zm1 2h10v8H3V4zm1 1v1h3V5H4zm0 2v1h3V7H4zm0 2v1h3V9H4zm5-4v1h3V5H9zm0 2v1h3V7H9zm0 2v1h3V9H9z" /></svg>;
}

export function IconScroll({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M3 1a2 2 0 00-2 2v1h1V3a1 1 0 011-1h1v12H3a1 1 0 01-1-1v-1H1v1a2 2 0 002 2h10a2 2 0 002-2V3a2 2 0 00-2-2H3zm2 1h8a1 1 0 011 1v10a1 1 0 01-1 1H5V2z" /></svg>;
}

export function IconFactory({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M3 2v12h10V6.5L10 4V2H3zm1 1h5v2h1l2 2v7H4V3zm2 4v1h3V7H6zm0 2v1h3V9H6zm0 2v1h3v-1H6z" /></svg>;
}

export function IconSync({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 8a6.5 6.5 0 0112.1-3.3M14.5 8a6.5 6.5 0 01-12.1 3.3" /><polyline points="14 1.5 14 4.7 10.8 4.7" /><polyline points="2 11.3 2 14.5 5.2 14.5" /></svg>;
}

export function IconEye({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4.5 3 1.7 5.3.5 8c1.2 2.7 4 5 7.5 5s6.3-2.3 7.5-5c-1.2-2.7-4-5-7.5-5zm0 8a3 3 0 110-6 3 3 0 010 6zm0-5a2 2 0 100 4 2 2 0 000-4z" /></svg>;
}

export function IconSave({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 1h-11A1.5 1.5 0 001 2.5v11A1.5 1.5 0 002.5 15h11a1.5 1.5 0 001.5-1.5v-11A1.5 1.5 0 0013.5 1zM5 2h6v3H5V2zM3 13V2h1v4h8V2h1.5a.5.5 0 01.5.5v11a.5.5 0 01-.5.5H3.5a.5.5 0 01-.5-.5zm3-3h4v1H6v-1z" /></svg>;
}

export function IconBuilding({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M3 1v14h10V1H3zm1 1h8v12H4V2zm1 2v1h2V4H5zm3 0v1h2V4H8zM5 6v1h2V6H5zm3 0v1h2V6H8zM5 8v1h2V8H5zm3 0v1h2V8H8zM5 10v1h2v-1H5zm3 0v1h2v-1H8zM5 12v1h6v-1H5z" /></svg>;
}

export function IconHourglass({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M4 1v3.5L7 8l-3 3.5V15h8v-3.5L9 8l3-3.5V1H4zm1 1h6v2.1L8 7 5 4.1V2zm0 12v-2.1L8 9l3 2.9V14H5z" /></svg>;
}

export function IconImage({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M2 2a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V3a1 1 0 00-1-1H2zm0 1h12v7.3l-2.7-2.7-2 2L6.5 5.5 2 10.5V3zm0 9l4.5-4.5L12.7 13H2zM11 6a1 1 0 110-2 1 1 0 010 2z" /></svg>;
}

export function IconCode({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M5.7 3.3L1.4 8l4.3 4.7 1.1-1L3.2 8l3.6-3.7-1.1-1zm4.6 0l-1.1 1L12.8 8l-3.6 3.7 1.1 1L14.6 8l-4.3-4.7z" /></svg>;
}

export function IconPdf({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M10 1H3a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V5l-4-4zm-.5 1.5L12.5 5.5H9.5V2.5zM3 14V2h5v4h4v8H3z" /><text x="5" y="11.5" fontSize="5" fontFamily="sans-serif">PDF</text></svg>;
}

export function IconArchive({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M1 2v3h1v8a1 1 0 001 1h10a1 1 0 001-1V5h1V2H1zm2 1h10v1H3V3zm1 3h8v7H4V6zm2 2v1h4V8H6z" /></svg>;
}

export function IconPaperclip({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M12.5 7.5l-5 5a3 3 0 01-4.24-4.24l5-5a2 2 0 012.83 2.83l-5 5a1 1 0 01-1.41-1.41l4.5-4.5" /></svg>;
}

export function IconSheet({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M10 1H3a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V5l-4-4zm-.5 1.5L12.5 5.5H9.5V2.5zM3 14V2h5v4h4v8H3zM5 7v1h6V7H5zm0 2v1h6V9H5zm0 2v1h4v-1H5z" /></svg>;
}

export function IconHalfSun({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.9 2.9l1.4 1.4M11.7 11.7l1.4 1.4M2.9 13.1l1.4-1.4M11.7 4.3l1.4-1.4" /><circle cx="8" cy="8" r="3" fill="currentColor" stroke="none" /><rect x="0" y="8" width="16" height="8" fill="var(--color-surface, #fff)" /><path d="M8 5a3 3 0 013 3H5a3 3 0 013-3z" fill="currentColor" /></svg>;
}

export function IconEdit({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M13.2 1.8a2 2 0 00-2.8 0L3.5 8.7V12h3.3l6.9-6.9a2 2 0 000-2.8l-1.5-1.5zm-2.1.7l1.4 1.4-6.2 6.2-1.4-1.4 6.2-6.2zM4.5 11V9.5L6.5 11H4.5z" /></svg>;
}

export function IconTrade({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12l3-4 3 2 3-5 5-2" /><path d="M12 3h3v3" /></svg>;
}

/* ── Text-letter icons for clarity ── */

export function IconLetterInfo({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" /><text x="8" y="12" fontSize="10" fontFamily="sans-serif" fontWeight="600" textAnchor="middle">i</text></svg>;
}

export function IconLetterDetail({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" /><line x1="4" y1="5" x2="12" y2="5" stroke="currentColor" strokeWidth="1.2" /><line x1="4" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth="1.2" /><line x1="4" y1="11" x2="9" y2="11" stroke="currentColor" strokeWidth="1.2" /></svg>;
}

export function IconLetterStock({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><rect x="1" y="1" width="14" height="14" rx="2" /><path d="M4 11l2-3 2 2 2-4 2-1" /></svg>;
}

export function IconThemeToggle({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14 7 7 0 000-14zm0 1.2v12.6A5.8 5.8 0 018 2.2z" /></svg>;
}

/* ── Action icons for buttons ── */

export function IconSaveBtn({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M13.35 1.35l1.29 1.3a.5.5 0 010 .7l-1 1-2-2 1-1a.5.5 0 01.71 0zM3 14V2h6v4h4v8H3zm2-6h6v-1H5v1zm0 2h6V9H5v1zm0 2h4v-1H5v1z" /></svg>;
}

export function IconAdd({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><line x1="8" y1="3" x2="8" y2="13" /><line x1="3" y1="8" x2="13" y2="8" /></svg>;
}

export function IconTrash({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h10M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M4 4l.7 9a1 1 0 001 .9h4.6a1 1 0 001-.9L12 4" /></svg>;
}

export function IconTest({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3l6 5-6 5z" /><circle cx="8" cy="8" r="6.5" /></svg>;
}

export function IconDisconnect({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><line x1="2" y1="2" x2="14" y2="14" /><path d="M5 3.5A5 5 0 0113 8M11 12.5A5 5 0 013 8" /></svg>;
}

export function IconCollapse({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,6 8,2 12,6" /><polyline points="4,10 8,14 12,10" /></svg>;
}

export function IconExpand({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,10 8,14 12,10" /><polyline points="4,6 8,2 12,6" /></svg>;
}

export function IconCopy({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="5" width="9" height="9" rx="1" /><path d="M5 11H3a1 1 0 01-1-1V3a1 1 0 011-1h7a1 1 0 011 1v2" /></svg>;
}

export function IconDownload({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v8M5 7l3 3 3-3M3 12v1a1 1 0 001 1h8a1 1 0 001-1v-1" /></svg>;
}

export function IconUpload({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 10V2M5 5l3-3 3 3M3 12v1a1 1 0 001 1h8a1 1 0 001-1v-1" /></svg>;
}

export function IconFilter({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 2h13l-5 6v5l-3 1.5V8L1.5 2z" /></svg>;
}

export function IconSort({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M4 3v10M4 13l-2-2M4 13l2-2M12 13V3M12 3l-2 2M12 3l2 2" /></svg>;
}

export function IconStop({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1.5" /></svg>;
}

export function IconWindowMinimize({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><line x1="3" y1="12" x2="13" y2="12" /></svg>;
}

export function IconWindowMaximize({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="10" height="10" rx="1" /></svg>;
}

export function IconWindowRestore({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="4" y="4" width="9" height="9" rx="1" /><path d="M4 6H3a1 1 0 01-1-1V3a1 1 0 011-1h2a1 1 0 011 1v1" /></svg>;
}

export function IconWindowClose({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></svg>;
}

/* ── Emoji-to-SVG mapping for data-driven icons ── */

const EMOJI_ICON_MAP: Record<string, ReactNode> = {
  "📁": <IconFolder />,
  "🔍": <IconSearch />,
  "🏷": <IconTag />,
  "🏷️": <IconTag />,
  "🔗": <IconLink />,
  "📅": <IconCalendar />,
  "📚": <IconKnowledge />,
  "🏠": <IconHome />,
  "⭐": <IconStar />,
  "💡": <IconLightbulb />,
  "📝": <IconEdit />,
  "🔖": <IconBookmark />,
  "📌": <IconPin />,
  "🗂": <IconLayers />,
  "🗂️": <IconLayers />,
  "📋": <IconLock />,
  "💬": <IconChat />,
  "🧠": <IconBrain />,
  "⚡": <IconLightning />,
  "🎯": <IconTarget />,
  "🔔": <IconBell />,
  "❤️": <IconHeart />,
  "💹": <IconTrade />,
  "📂": <IconFolderOpen />,
  "📄": <IconFile />,
  "📊": <IconChart />,
  "📕": <IconPdf />,
  "🖼️": <IconImage />,
  "💻": <IconCode />,
  "📦": <IconArchive />,
  "📎": <IconPaperclip />,
  "📜": <IconScroll />,
  "🏭": <IconFactory />,
  "🔄": <IconSync />,
  "🛡️": <IconShield />,
  "🔥": <IconFire />,
  "🌊": <IconWater />,
  "📖": <IconBook />,
  "🏢": <IconBuilding />,
  "💾": <IconSave />,
  "⏳": <IconHourglass />,
  "🎨": <IconPalette />,
  "⌨": <IconKeyboard />,
  "⌨️": <IconKeyboard />,
  "🤖": <IconRobot />,
  "👁": <IconEye />,
  "🔌": <IconPlug />,
  "⚙": <IconGear />,
  "✎": <IconEdit />,
};

/**
 * Render an icon from an emoji string key.
 * Falls back to the raw string if no mapping exists.
 */
export function renderIcon(icon: string, size?: number): ReactNode {
  if (!icon) return null;
  const mapped = EMOJI_ICON_MAP[icon];
  if (mapped) return size ? <span style={{ width: size, height: size, display: "inline-flex", alignItems: "center" }}>{mapped}</span> : mapped;
  return <span>{icon}</span>;
}
