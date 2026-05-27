import { useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

type ResizeDirection = "East" | "North" | "NorthEast" | "NorthWest" | "South" | "SouthEast" | "SouthWest" | "West";

const EDGE = "fixed z-[9999] select-none";
const CORNER_BASE = "fixed z-[9999] select-none";

function useResize(direction: ResizeDirection) {
  return useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      getCurrentWindow().startResizeDragging(direction).catch(() => {});
    },
    [direction],
  );
}

export function WindowResizer() {
  const onNorth = useResize("North");
  const onSouth = useResize("South");
  const onEast = useResize("East");
  const onWest = useResize("West");
  const onNorthEast = useResize("NorthEast");
  const onNorthWest = useResize("NorthWest");
  const onSouthEast = useResize("SouthEast");
  const onSouthWest = useResize("SouthWest");

  return (
    <>
      <div className={`${EDGE} top-0 left-2 right-2 h-1 cursor-n-resize`} onMouseDown={onNorth} />
      <div className={`${EDGE} bottom-0 left-2 right-2 h-1 cursor-s-resize`} onMouseDown={onSouth} />
      <div className={`${EDGE} left-0 top-2 bottom-2 w-1 cursor-w-resize`} onMouseDown={onWest} />
      <div className={`${EDGE} right-0 top-2 bottom-2 w-1 cursor-e-resize`} onMouseDown={onEast} />

      <div className={`${CORNER_BASE} top-0 left-0 w-2 h-2 cursor-nw-resize`} onMouseDown={onNorthWest} />
      <div className={`${CORNER_BASE} top-0 right-0 w-2 h-2 cursor-ne-resize`} onMouseDown={onNorthEast} />
      <div className={`${CORNER_BASE} bottom-0 left-0 w-2 h-2 cursor-sw-resize`} onMouseDown={onSouthWest} />
      <div className={`${CORNER_BASE} bottom-0 right-0 w-2 h-2 cursor-se-resize`} onMouseDown={onSouthEast} />
    </>
  );
}