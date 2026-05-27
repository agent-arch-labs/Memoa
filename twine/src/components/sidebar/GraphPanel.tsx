import { useEffect, useRef, useCallback, useState } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
} from "d3-force";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import { useAppStore } from "@/stores/appStore";
import type { GraphNode, GraphEdge } from "@/types";

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
}

const TAG_COLORS = [
  { h: 200, s: 70, l: 55 },
  { h: 140, s: 60, l: 45 },
  { h: 30, s: 80, l: 50 },
  { h: 330, s: 70, l: 55 },
  { h: 50, s: 80, l: 45 },
  { h: 270, s: 60, l: 55 },
  { h: 180, s: 60, l: 40 },
  { h: 10, s: 80, l: 55 },
  { h: 90, s: 50, l: 45 },
  { h: 300, s: 70, l: 50 },
];

const tagColorMap = new Map<string, { hsl: string; rgb: string }>();
let colorIndex = 0;

function getTagColor(tag: string): { hsl: string; rgb: string } {
  if (!tagColorMap.has(tag)) {
    const c = TAG_COLORS[colorIndex % TAG_COLORS.length];
    colorIndex++;
    const hsl = `hsl(${c.h}, ${c.s}%, ${c.l}%)`;
    const rgb = hslToRgb(c.h, c.s / 100, c.l / 100);
    tagColorMap.set(tag, { hsl, rgb });
  }
  return tagColorMap.get(tag)!;
}

function hslToRgb(h: number, s: number, l: number): string {
  h = h / 360;
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0.85)`;
}

function resolveNodeColor(node: SimNode): { hsl: string; rgb: string } | null {
  if (node.tags.length === 0) return null;
  return getTagColor(node.tags[0]);
}

export function GraphPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<{ nodes: GraphNode[]; edges: GraphEdge[] }>({
    nodes: [],
    edges: [],
  });
  const simNodesRef = useRef<SimNode[]>([]);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);
  const [localMode, setLocalMode] = useState(false);
  const [localDepth, setLocalDepth] = useState(1);
  const { getGraphData, getLocalGraph, readFile } = useTauriCommands();
  const setCurrentNote = useAppStore((s) => s.setCurrentNote);
  const setContextTarget = useAppStore((s) => s.setContextTarget);
  const setDataSource = useAppStore((s) => s.setDataSource);
  const graphRefreshKey = useAppStore((s) => s.graphRefreshKey);
  const currentNotePath = useAppStore((s) => s.currentNotePath);
  const currentNodePathRef = useRef(currentNotePath);
  currentNodePathRef.current = currentNotePath;

  const transformRef = useRef({ x: 0, y: 0, scale: 0.5 });
  const draggingRef = useRef<SimNode | null>(null);
  const panningRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const hoveredNodeRef = useRef<SimNode | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const scheduleRenderRef = useRef<() => void>(() => {});

  scheduleRenderRef.current = () => {
    if (animFrameRef.current !== null) return;
    animFrameRef.current = requestAnimationFrame(() => {
      animFrameRef.current = null;
      if (!mountedRef.current) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      try {
        const dpr = window.devicePixelRatio;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);

        const { x, y, scale } = transformRef.current;
        ctx.translate(x + width / 2, y + height / 2);
        ctx.scale(scale, scale);
        ctx.translate(-width / 2, -height / 2);

        const simNodes = simNodesRef.current;
        const edges = dataRef.current.edges;
        const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

        ctx.strokeStyle = "var(--color-border)";
        ctx.lineWidth = 1 / scale;
        ctx.beginPath();
        for (const edge of edges) {
          const source = nodeMap.get(edge.source);
          const target = nodeMap.get(edge.target);
          if (!source || !target) continue;
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(target.x, target.y);
        }
        ctx.stroke();

        const isDark = document.documentElement.classList.contains("dark");
        const curPath = currentNodePathRef.current;

        for (const node of simNodes) {
          const isCurrent = curPath === node.path;
          const isHovered = node === hoveredNodeRef.current;

          const baseRadius = Math.max(4, Math.min(16, 4 + node.incoming_count * 2));
          const radius = isCurrent || isHovered ? baseRadius + 2 : baseRadius;

          ctx.beginPath();
          ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);

          if (isCurrent) {
            ctx.fillStyle = "var(--color-accent)";
          } else if (isHovered) {
            ctx.fillStyle = "var(--color-accent)";
            ctx.globalAlpha = 0.8;
          } else {
            const tagColor = resolveNodeColor(node);
            if (tagColor) {
              ctx.fillStyle = tagColor.rgb;
            } else {
              const intensity = Math.min(1, 0.45 + node.incoming_count * 0.08);
              ctx.fillStyle = isDark
                ? `rgba(180, 190, 210, ${intensity})`
                : `rgba(80, 90, 110, ${intensity})`;
            }
          }
          ctx.fill();
          ctx.globalAlpha = 1;

          if (isCurrent || isHovered) {
            ctx.strokeStyle = "var(--color-accent)";
            ctx.lineWidth = 2 / scale;
            ctx.stroke();
          } else {
            const tagColor = resolveNodeColor(node);
            if (tagColor) {
              ctx.strokeStyle = tagColor.hsl;
              ctx.lineWidth = 1.5 / scale;
              ctx.globalAlpha = 0.3;
              ctx.stroke();
              ctx.globalAlpha = 1;
            }
          }

          if (scale > 0.6 || isHovered || isCurrent) {
            const fontSize = Math.max(8, Math.min(11, 9 * scale));
            ctx.fillStyle = isDark ? "rgba(220, 225, 235, 0.9)" : "rgba(50, 55, 65, 0.9)";
            ctx.font = `${fontSize}px sans-serif`;
            ctx.textAlign = "center";
            const label = node.title.length > 12 ? node.title.slice(0, 11) + "\u2026" : node.title;
            ctx.fillText(label, node.x, node.y + radius + fontSize + 2);
          }
        }

        ctx.restore();
      } catch (e) {
        console.error("[GraphPanel] render error:", e);
      }
    });
  };

  const doRender = useCallback(() => {
    scheduleRenderRef.current();
  }, []);

  const fitCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const dpr = window.devicePixelRatio;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      return true;
    }
    return false;
  }, []);

  const restartSimulation = useCallback(
    (nodes: GraphNode[], edges: GraphEdge[]) => {
      if (!mountedRef.current) return;

      simRef.current?.stop();
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      fitCanvas();

      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);

      if (nodes.length === 0) {
        simNodesRef.current = [];
        doRender();
        return;
      }

      const simNodes: SimNode[] = nodes.map((n) => ({
        ...n,
        x: width / 2 + (Math.random() - 0.5) * 100,
        y: height / 2 + (Math.random() - 0.5) * 100,
        vx: 0,
        vy: 0,
      }));

      const nodeMap = new Map<string, SimNode>();
      simNodes.forEach((n) => nodeMap.set(n.id, n));

      const simLinks = edges
        .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
        .map((e) => ({
          source: e.source,
          target: e.target,
        }));

      simNodesRef.current = simNodes;

      try {
        const sim = forceSimulation<SimNode>(simNodes)
          .force(
            "link",
            forceLink<SimNode, { source: string; target: string }>(simLinks)
              .id((d) => d.id)
              .distance(80),
          )
          .force("charge", forceManyBody().strength(-200))
          .force("center", forceCenter(width / 2, height / 2))
          .force("collide", forceCollide<SimNode>(20))
          .alphaDecay(0.03)
          .on("tick", () => {
            doRender();
          })
          .on("end", () => {
            doRender();
          });

        simRef.current = sim;
      } catch (e) {
        console.error("[GraphPanel] simulation error:", e);
      }
    },
    [fitCanvas, doRender],
  );

  const loadGraph = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      setLoading(true);
      setError(null);

      let data: { nodes: GraphNode[]; edges: GraphEdge[] };

      if (localMode && currentNotePath) {
        const vp = useAppStore.getState().vaultPath;
        const noteId = currentNotePath.startsWith("/")
          ? currentNotePath
          : `${vp}/${currentNotePath}`;
        data = await getLocalGraph(noteId, localDepth);
      } else {
        data = await getGraphData();
      }

      if (!mountedRef.current) return;

      dataRef.current = data;
      setNodeCount(data.nodes.length);
      setEdgeCount(data.edges.length);
      restartSimulation(data.nodes, data.edges);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to load graph data");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [getGraphData, getLocalGraph, localMode, localDepth, currentNotePath, restartSimulation]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph, graphRefreshKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      fitCanvas();
      if (simRef.current && simNodesRef.current.length > 0) {
        simRef.current
          .force("center", forceCenter(
            container.getBoundingClientRect().width / 2,
            container.getBoundingClientRect().height / 2,
          ))
          .alpha(0.3)
          .restart();
      }
      doRender();
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, [fitCanvas, doRender]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(3, transformRef.current.scale * delta));
      transformRef.current.scale = newScale;
      doRender();
    }

    function getEventPos(e: MouseEvent): { x: number; y: number } {
      const rect = canvas!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function findNodeAt(cx: number, cy: number): SimNode | null {
      const { x, y, scale } = transformRef.current;
      const canvasWidth = canvas!.clientWidth;
      const canvasHeight = canvas!.clientHeight;
      const worldX = (cx - x - canvasWidth / 2) / scale + canvasWidth / 2;
      const worldY = (cy - y - canvasHeight / 2) / scale + canvasHeight / 2;
      const threshold = 14 / scale;

      const simNodes = simNodesRef.current;
      for (let i = simNodes.length - 1; i >= 0; i--) {
        const node = simNodes[i];
        const dx = node.x - worldX;
        const dy = node.y - worldY;
        if (dx * dx + dy * dy < threshold * threshold) {
          return node;
        }
      }
      return null;
    }

    function handleMouseDown(e: MouseEvent) {
      const pos = getEventPos(e);
      const clickedNode = findNodeAt(pos.x, pos.y);

      if (clickedNode) {
        draggingRef.current = clickedNode;
        clickedNode.fx = clickedNode.x;
        clickedNode.fy = clickedNode.y;
        e.stopPropagation();
      } else {
        panningRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          tx: transformRef.current.x,
          ty: transformRef.current.y,
        };
      }
    }

    function handleMouseMove(e: MouseEvent) {
      const pos = getEventPos(e);

      if (draggingRef.current) {
        const node = draggingRef.current;
        const { scale } = transformRef.current;
        node.fx = node.x + (e.movementX || 0) / scale;
        node.fy = node.y + (e.movementY || 0) / scale;
        doRender();
        return;
      }

      if (panningRef.current) {
        transformRef.current.x = panningRef.current.tx + (e.clientX - panningRef.current.startX);
        transformRef.current.y = panningRef.current.ty + (e.clientY - panningRef.current.startY);
        doRender();
        return;
      }

      const hovered = findNodeAt(pos.x, pos.y);
      if (hovered !== hoveredNodeRef.current) {
        hoveredNodeRef.current = hovered;
        canvas!.style.cursor = hovered ? "pointer" : "grab";
        doRender();
      }
    }

    function handleMouseUp(e: MouseEvent) {
      if (draggingRef.current) {
        const node = draggingRef.current;
        const dx = Math.abs(e.movementX || 0);
        const dy = Math.abs(e.movementY || 0);
        if (dx < 3 && dy < 3) {
          const vp = useAppStore.getState().vaultPath;
          const fullPath = node.path.startsWith("/") || !vp
            ? node.path
            : `${vp}/${node.path}`;
          readFile(fullPath)
            .then((content) => {
              setCurrentNote(fullPath, content);
              setDataSource("local");
              setContextTarget({
                type: "file",
                label: node.title,
                path: fullPath,
              });
            })
            .catch(console.error);
        }
        node.fx = null;
        node.fy = null;
        draggingRef.current = null;
        doRender();
      }
      panningRef.current = null;
    }

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      simRef.current?.stop();
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [setCurrentNote, doRender]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">
          知识图谱
        </span>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 mr-1">
            <button
              className={`text-[10px] px-1.5 py-px rounded transition-colors ${
                localMode
                  ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              }`}
              onClick={() => {
                setLocalMode(!localMode);
              }}
              title="局部图谱模式"
            >
              局部
            </button>
            {localMode && (
              <select
                className="text-[10px] bg-transparent border border-[var(--color-border)] rounded px-1 py-px text-[var(--color-text-muted)]"
                value={localDepth}
                onChange={(e) => {
                  setLocalDepth(Number(e.target.value));
                }}
              >
                <option value={1}>深度 1</option>
                <option value={2}>深度 2</option>
              </select>
            )}
          </div>
          <span className="text-[10px] text-[var(--color-text-muted)]/60">
            {nodeCount} 节点 · {edgeCount} 连线
          </span>
          <button
            className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] px-1"
            onClick={loadGraph}
            title="刷新图谱"
          >
            ↻
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface)]/60">
            <div className="text-xs text-[var(--color-text-muted)]">加载图谱数据...</div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface)]/60">
            <div className="text-xs text-center">
              <div className="text-[var(--color-text-muted)] mb-2">{error}</div>
              <button
                className="text-[var(--color-accent)] hover:underline"
                onClick={loadGraph}
              >
                重试
              </button>
            </div>
          </div>
        )}
        {!loading && !error && nodeCount === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-xs text-center text-[var(--color-text-muted)]">
              {localMode ? "打开一个笔记以查看其局部图谱" : "暂无数据"}
              <br />
              <span className="text-[11px]">打开仓库并创建含链接的笔记后即可查看图谱</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}