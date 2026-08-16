export interface ThinkingSegment {
  type: "thinking" | "response";
  content: string;
}

function stripToolCallXml(raw: string): string {
  let result = raw;

  result = result.replace(
    /minimax:tool_call\s*<invoke\b[^>]*>[\s\S]*?<\/invoke>\s*<\/minimax:tool_call>/gi,
    ""
  );

  result = result.replace(
    /<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi,
    ""
  );

  result = result.replace(
    /<parameter\b[^>]*>[\s\S]*?<\/parameter>/gi,
    ""
  );

  result = result.replace(
    /<invoke\b[^/>]*\/\s*>/gi,
    ""
  );

  result = result.replace(
    /<\/?minimax:tool_call\s*\/?>/gi,
    ""
  );

  result = result.replace(
    /\s*minimax:tool_call\b[\s\S]*$/gi,
    ""
  );

  return result;
}

function splitByOlsonMarkers(raw: string): ThinkingSegment[] {
  const segments: ThinkingSegment[] = [];
  let remaining = raw;
  let safety = 0;

  while (remaining.length > 0 && safety < 100) {
    safety++;

    const thinkStart = remaining.indexOf("<think>");
    if (thinkStart === -1) {
      const trimmed = stripToolCallXml(remaining.trim());
      if (trimmed) {
        segments.push({ type: "response", content: trimmed });
      }
      break;
    }

    if (thinkStart > 0) {
      const before = stripToolCallXml(remaining.slice(0, thinkStart).trim());
      if (before) {
        segments.push({ type: "response", content: before });
      }
    }

    const afterThink = remaining.slice(thinkStart + "<think>".length);
    const responseEnd = afterThink.indexOf("</think>");

    if (responseEnd !== -1) {
      segments.push({
        type: "thinking",
        content: afterThink.slice(0, responseEnd),
      });
      remaining = afterThink.slice(responseEnd + "</think>".length);
    } else {
      segments.push({ type: "thinking", content: afterThink });
      break;
    }
  }

  return segments;
}

function findMarker(raw: string, marker: string, startFrom: number = 0): number {
  const idx = raw.indexOf(marker, startFrom);
  if (idx === -1) return -1;

  const beforeOk = idx === 0 || /\s/.test(raw[idx - 1]);
  const afterEnd = idx + marker.length;
  const afterOk = afterEnd >= raw.length || /\s/.test(raw[afterEnd]) || raw[afterEnd] > "\u{007f}";

  if (beforeOk && afterOk) return idx;

  return findMarker(raw, marker, idx + 1);
}

function splitByThinkingMarkers(raw: string): ThinkingSegment[] {
  const segments: ThinkingSegment[] = [];
  let remaining = raw;
  let safety = 0;

  while (remaining.length > 0 && safety < 100) {
    safety++;

    const thinkStart = findMarker(remaining, "thinking");
    if (thinkStart === -1) {
      const trimmed = stripToolCallXml(remaining.trim());
      if (trimmed) {
        segments.push({ type: "response", content: trimmed });
      }
      break;
    }

    if (thinkStart > 0) {
      const before = stripToolCallXml(remaining.slice(0, thinkStart).trim());
      if (before) {
        segments.push({ type: "response", content: before });
      }
    }

    const afterThink = remaining.slice(thinkStart + "thinking".length);
    const responseEnd = findMarker(afterThink, "response");

    if (responseEnd !== -1) {
      segments.push({
        type: "thinking",
        content: afterThink.slice(0, responseEnd),
      });
      remaining = afterThink.slice(responseEnd + "response".length);
    } else {
      segments.push({ type: "thinking", content: afterThink });
      break;
    }
  }

  return segments;
}

function detectFormat(raw: string): "olson" | "thinking" {
  const hasOlson = raw.includes("<think>") && raw.includes("</think>");
  const hasThinking = raw.includes("thinking") && raw.includes("response");

  if (hasOlson && !hasThinking) return "olson";
  if (hasThinking && !hasOlson) return "thinking";

  const olsonIdx = Math.min(
    raw.indexOf("<think>") !== -1 ? raw.indexOf("<think>") : Infinity,
    raw.indexOf("</think>") !== -1 ? raw.indexOf("</think>") : Infinity
  );
  const thinkingIdx = Math.min(
    raw.indexOf("thinking") !== -1 ? raw.indexOf("thinking") : Infinity,
    raw.indexOf("response") !== -1 ? raw.indexOf("response") : Infinity
  );

  return olsonIdx < thinkingIdx ? "olson" : "thinking";
}

export function parseThinkingContent(raw: string): ThinkingSegment[] {
  if (!raw) return [];

  const format = detectFormat(raw);
  const segments = format === "olson" ? splitByOlsonMarkers(raw) : splitByThinkingMarkers(raw);

  const cleanedSegments = segments
    .map((seg) => {
      if (seg.type === "response") {
        return { ...seg, content: stripToolCallXml(seg.content).trim() };
      }
      return seg;
    })
    .filter((seg) => seg.content.trim().length > 0);

  if (cleanedSegments.length === 0) {
    const cleaned = stripToolCallXml(raw.trim());
    if (cleaned) {
      return [{ type: "response", content: cleaned }];
    }
  }

  return cleanedSegments;
}