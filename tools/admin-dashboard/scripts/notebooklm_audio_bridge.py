#!/usr/bin/env python3
"""
NotebookLM audio bridge.

Reads a JSON payload, uses notebooklm-py to generate an audio overview, and
writes the downloaded audio file to the requested path.
"""

import asyncio
import json
import sys
import traceback
from pathlib import Path
from typing import Any, Iterable


def pick(obj: Any, *names: str) -> Any:
    for name in names:
        if isinstance(obj, dict) and name in obj:
            return obj[name]
        if hasattr(obj, name):
            return getattr(obj, name)
    return None


def as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, dict):
        maybe_items = value.get("items")
        if isinstance(maybe_items, list):
            return maybe_items
        return list(value.values())
    if isinstance(value, Iterable) and not isinstance(value, (str, bytes)):
        return list(value)
    return []


async def resolve_notebook(client: Any, title: str, reuse_existing: bool) -> tuple[str, bool]:
    notebook_obj = None

    if reuse_existing:
        listed = await client.notebooks.list()
        notebooks = as_list(listed)
        wanted = title.strip().lower()
        for nb in notebooks:
            nb_title = str(pick(nb, "title", "name", "label") or "").strip().lower()
            if nb_title == wanted:
                notebook_obj = nb
                break

    created = False
    if notebook_obj is None:
        notebook_obj = await client.notebooks.create(title)
        created = True

    notebook_id = str(pick(notebook_obj, "id", "notebook_id") or "").strip()
    if not notebook_id:
        raise RuntimeError("NotebookLM API did not return a notebook id.")
    return notebook_id, created


async def wait_for_audio(client: Any, notebook_id: str, task_id: str, timeout_sec: int) -> Any:
    if not hasattr(client, "artifacts") or not hasattr(client.artifacts, "wait_for_completion"):
        return None

    wait_fn = client.artifacts.wait_for_completion
    # Keep compatibility with different method signatures.
    try:
        return await wait_fn(notebook_id, task_id, timeout=timeout_sec)
    except TypeError:
        try:
            return await wait_fn(notebook_id, task_id, timeout_sec)
        except TypeError:
            return await wait_fn(notebook_id, task_id)


async def run(payload_path: Path) -> dict[str, Any]:
    payload = json.loads(payload_path.read_text(encoding="utf-8"))

    notebook_title = str(payload.get("notebookTitle") or "").strip()
    source_title = str(payload.get("sourceTitle") or "FINAL.md").strip()
    source_content = str(payload.get("sourceContent") or "").strip()
    instructions = str(payload.get("instructions") or "").strip()
    output_path = str(payload.get("outputPath") or "").strip()
    storage_path_raw = str(payload.get("storagePath") or "").strip()
    reuse_notebook = bool(payload.get("reuseNotebook", True))
    wait_timeout_sec = int(payload.get("waitTimeoutSec") or 900)
    wait_timeout_sec = max(60, min(wait_timeout_sec, 3600))

    if not notebook_title:
        raise ValueError("Missing notebookTitle in payload.")
    if not source_content:
        raise ValueError("sourceContent is empty; FINAL.md must not be empty.")
    if not output_path:
        raise ValueError("Missing outputPath in payload.")

    try:
        from notebooklm import NotebookLMClient
    except Exception as exc:  # pragma: no cover - depends on host env
        raise RuntimeError(
            "notebooklm-py is not installed. Install with: pip install notebooklm-py"
        ) from exc

    output_file = Path(output_path).expanduser()
    output_file.parent.mkdir(parents=True, exist_ok=True)

    storage_path = Path(storage_path_raw).expanduser() if storage_path_raw else None
    if storage_path:
        client_ctx = await NotebookLMClient.from_storage(str(storage_path))
    else:
        client_ctx = NotebookLMClient()

    async with client_ctx as client:
        notebook_id, notebook_created = await resolve_notebook(client, notebook_title, reuse_notebook)

        source_status = await client.sources.add_text(notebook_id, source_title, source_content)
        source_id = pick(source_status, "source_id", "id")

        generation = await client.artifacts.generate_audio(
            notebook_id,
            instructions=instructions or None,
        )
        task_id = str(pick(generation, "task_id", "id") or "").strip()

        wait_result = None
        if task_id:
            wait_result = await wait_for_audio(client, notebook_id, task_id, wait_timeout_sec)

        artifact_id = (
            pick(wait_result, "artifact_id", "id")
            or pick(generation, "artifact_id")
        )

        try:
            if artifact_id:
                download_result = await client.artifacts.download_audio(
                    notebook_id,
                    str(output_file),
                    artifact_id=artifact_id,
                )
            else:
                download_result = await client.artifacts.download_audio(
                    notebook_id,
                    str(output_file),
                )
        except TypeError:
            # Older variants may not accept artifact_id as kwarg.
            download_result = await client.artifacts.download_audio(notebook_id, str(output_file))

    result = {
        "success": True,
        "notebookId": notebook_id,
        "notebookCreated": notebook_created,
        "sourceId": source_id,
        "taskId": task_id or None,
        "artifactId": artifact_id,
        "downloadResult": download_result if isinstance(download_result, (dict, list, str, int, float, bool, type(None))) else str(download_result),
        "outputPath": str(output_file),
        "outputExists": output_file.exists(),
    }
    return result


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Usage: notebooklm_audio_bridge.py <payload.json>"}))
        return 1

    payload_path = Path(sys.argv[1]).expanduser()
    if not payload_path.exists():
        print(json.dumps({"success": False, "error": f"Payload file not found: {payload_path}"}))
        return 1

    try:
        result = asyncio.run(run(payload_path))
        print(json.dumps(result, ensure_ascii=True))
        return 0
    except Exception as exc:  # pragma: no cover - runtime diagnostics
        print(
            json.dumps(
                {
                    "success": False,
                    "error": str(exc),
                    "traceback": traceback.format_exc(limit=5),
                },
                ensure_ascii=True,
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
