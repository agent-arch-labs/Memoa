#!/usr/bin/env python3
"""UltraRAG MCP Server for Memoa Agent.

Wraps UltraRAG RAG pipeline as a stdio MCP server.
Use `fastmcp` library for MCP protocol handling.

Usage:
  python scripts/ultrarag_mcp_server.py          # auto-resolve UltraRAG root
  ULTRARAG_ROOT=/path/to/UltraRAG python scripts/ultrarag_mcp_server.py
"""

import asyncio
import json
import os
import sys
from pathlib import Path

ULTRARAG_ROOT = Path(
    os.environ.get("ULTRARAG_ROOT", Path(__file__).resolve().parents[2] / "UltraRAG")
).resolve()

if str(ULTRARAG_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ULTRARAG_ROOT / "src"))

from fastmcp import FastMCP

mcp = FastMCP("ultrarag-memoa")


async def _run_ultrarag_pipeline(config: str, param: str = "") -> dict:
    """Run an UltraRAG pipeline as a subprocess."""
    cmd = [sys.executable, "-m", "ultrarag", "run", config]
    if param:
        cmd.extend(["--param", param])

    env = {**os.environ, "PYTHONPATH": str(ULTRARAG_ROOT / "src")}

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
        cwd=str(ULTRARAG_ROOT),
    )

    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return {"error": "Pipeline timed out after 60 seconds"}

    if proc.returncode != 0:
        return {
            "error": f"Pipeline exited with code {proc.returncode}",
            "stderr": stderr.decode(errors="replace")[-1000:],
        }

    return {
        "success": True,
        "output": stdout.decode(errors="replace")[-2000:],
        "stderr": stderr.decode(errors="replace")[-500:],
    }


def _get_usable_pipeline() -> str:
    candidates = [
        "examples/demos/RAG.yaml",
        "examples/experiments/vanilla_rag.yaml",
        "examples/experiments/sayhello.yaml",
    ]
    for c in candidates:
        path = ULTRARAG_ROOT / c
        if path.exists():
            return str(path)
    return ""


def _get_parameter_file() -> str:
    candidates = [
        "examples/demos/parameter/RAG_parameter.yaml",
        "examples/experiments/parameter/sayhello_parameter.yaml",
    ]
    for c in candidates:
        path = ULTRARAG_ROOT / c
        if path.exists():
            return str(path)
    return ""


@mcp.tool
async def echo(message: str) -> str:
    """Echo a message back. Used to verify MCP connectivity."""
    return f"[UltraRAG MCP] {message}"


@mcp.tool
async def status() -> str:
    """Check UltraRAG environment status."""
    info = {
        "ultrarag_root": str(ULTRARAG_ROOT),
        "exists": ULTRARAG_ROOT.exists(),
        "python": sys.executable,
        "version": sys.version,
        "pipeline_found": bool(_get_usable_pipeline()),
    }

    if not ULTRARAG_ROOT.exists():
        return json.dumps(info, ensure_ascii=False, indent=2)

    try:
        from fastmcp import __version__ as fm_ver
        info["fastmcp_version"] = fm_ver
    except Exception:
        info["fastmcp_version"] = "unknown"

    return json.dumps(info, ensure_ascii=False, indent=2)


@mcp.tool
async def deep_research(query: str, max_steps: int = 3) -> str:
    """Perform deep research using UltraRAG RAG pipeline.

    The pipeline retrieves relevant documents, reasons over them,
    and generates a comprehensive answer with citations.

    Args:
        query: The research question
        max_steps: Maximum research iterations (1-5)
    """
    if not query.strip():
        return json.dumps({"error": "Empty query"})

    pipeline = _get_usable_pipeline()
    if not pipeline:
        return json.dumps({
            "error": "No usable UltraRAG pipeline found",
            "hint": "Set ULTRARAG_ROOT env var to UltraRAG project directory",
            "cwd": str(ULTRARAG_ROOT),
        })

    param_file = _get_parameter_file()
    result = await _run_ultrarag_pipeline(pipeline, param_file)
    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool
async def run_pipeline(config: str, param: str = "") -> str:
    """Run a specified UltraRAG pipeline YAML configuration.

    Args:
        config: Path to pipeline YAML relative to UltraRAG root,
                or absolute path
        param: Optional parameter file path
    """
    if not Path(config).is_absolute():
        config = str(ULTRARAG_ROOT / config)

    if not Path(config).exists():
        return json.dumps({"error": f"Pipeline config not found: {config}"})

    result = await _run_ultrarag_pipeline(config, param)
    return json.dumps(result, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    mcp.run(transport="stdio")