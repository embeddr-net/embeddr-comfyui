import json
import mimetypes
import os
import re
import tempfile
from pathlib import Path

import aiohttp
from aiohttp import web
from comfy_api.latest import ComfyExtension, io
from server import PromptServer

try:
    import folder_paths
except Exception:
    folder_paths = None

import contextlib

from .nodes.EmbeddrAction import EmbeddrActionNode
from .nodes.EmbeddrExtractArtifactInfo import EmbeddrExtractArtifactInfoNode
from .nodes.EmbeddrFindCollection import EmbeddrFindCollectionNode
from .nodes.EmbeddrFindSimilarArtifacts import EmbeddrFindSimilarArtifactsNode
from .nodes.EmbeddrFindSimilarText import EmbeddrFindSimilarTextNode
from .nodes.EmbeddrFindSimilarToArtifact import EmbeddrFindSimilarToArtifactNode
from .nodes.EmbeddrLoadArtifact import EmbeddrLoadArtifactNode
from .nodes.EmbeddrLoadArtifacts import EmbeddrLoadArtifactsNode
from .nodes.EmbeddrLoadVideo import EmbeddrLoadVideoNode
from .nodes.EmbeddrLoRAStack import EmbeddrLoRAStack
from .nodes.EmbeddrMergeIDs import EmbeddrMergeIDsNode
from .nodes.EmbeddrSplitIDs import EmbeddrSplitIDsNode
from .nodes.EmbeddrUploadArtifact import EmbeddrUploadArtifactNode
from .nodes.EmbeddrUploadOptions import UploadArtifactOptionsNode
from .nodes.EmbeddrUploadVideo import EmbeddrUploadVideo

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")

print("[Embeddr Extension] Loading... Proxy routes registered.")


def get_api_key():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH) as f:
                config = json.load(f)
                return config.get("api_key", "")
        except Exception:
            return ""
    return ""


def _load_config() -> dict:
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH) as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _normalize_base_url(url: str | None, default: str = "http://localhost:8003") -> str:
    if not url:
        return default
    clean = str(url).strip().rstrip("/")
    if clean.endswith("/api/v1"):
        clean = clean[:-7]
    elif clean.endswith("/api"):
        clean = clean[:-4]
    return clean.rstrip("/")


def _sanitize_filename(value: str | None, fallback: str) -> str:
    candidate = Path(str(value or "").strip()).name
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", candidate).strip("._")
    return cleaned or fallback


def _candidate_library_roots(library_kind: str) -> list[Path]:
    normalized = str(library_kind or "loras").strip().lower() or "loras"
    candidates: list[Path] = []

    if folder_paths is not None:
        getter = getattr(folder_paths, "get_folder_paths", None)
        if callable(getter):
            try:
                values = getter(normalized)
                if isinstance(values, (list, tuple, set)):
                    candidates.extend(Path(str(item)).expanduser() for item in values if item)
                elif values:
                    candidates.append(Path(str(values)).expanduser())
            except Exception:
                pass

        mapping = getattr(folder_paths, "folder_names_and_paths", None)
        if isinstance(mapping, dict):
            entry = mapping.get(normalized)
            roots = None
            if isinstance(entry, tuple) and entry:
                roots = entry[0]
            elif isinstance(entry, (list, tuple, set)):
                roots = entry
            if isinstance(roots, (list, tuple, set)):
                candidates.extend(Path(str(item)).expanduser() for item in roots if item)
            elif roots:
                candidates.append(Path(str(roots)).expanduser())

        models_dir = getattr(folder_paths, "models_dir", None)
        if models_dir:
            candidates.append(Path(str(models_dir)).expanduser() / normalized)

    deduped: list[Path] = []
    seen = set()
    for candidate in candidates:
        try:
            resolved = candidate.expanduser().resolve(strict=False)
        except Exception:
            resolved = candidate.expanduser()
        key = str(resolved)
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(resolved)
    return deduped


def _guess_install_filename(
    artifact_payload: dict,
    *,
    artifact_id: str,
    file_name_override: str | None = None,
) -> str:
    metadata = artifact_payload.get("metadata_json") if isinstance(artifact_payload, dict) else {}
    metadata = metadata if isinstance(metadata, dict) else {}
    comfy_meta = metadata.get("comfyui") if isinstance(metadata.get("comfyui"), dict) else {}
    civitai_meta = metadata.get("civitai") if isinstance(metadata.get("civitai"), dict) else {}

    fallback_name = f"{artifact_id}.bin"
    candidates = [
        file_name_override,
        comfy_meta.get("suggested_filename"),
        metadata.get("filename"),
        Path(str(civitai_meta.get("local_path") or "")).name
        if civitai_meta.get("local_path")
        else None,
        metadata.get("name"),
    ]

    selected = next((value for value in candidates if str(value or "").strip()), None)
    file_name = _sanitize_filename(selected, fallback_name)
    if Path(file_name).suffix:
        return file_name

    format_hint = str(metadata.get("format") or "").strip().lower()
    ext_map = {
        "safetensor": ".safetensors",
        "safetensors": ".safetensors",
        "ckpt": ".ckpt",
        "pt": ".pt",
        "pth": ".pth",
        "bin": ".bin",
        "onnx": ".onnx",
    }
    suffix = ext_map.get(format_hint)
    if not suffix:
        guessed = mimetypes.guess_extension(
            str(artifact_payload.get("content_type") or "").split(";", 1)[0].strip()
        )
        suffix = guessed or ".bin"
    return f"{file_name}{suffix}"


def _build_sidecar_metadata(artifact_payload: dict, target_path: Path) -> dict:
    metadata = artifact_payload.get("metadata_json") if isinstance(artifact_payload, dict) else {}
    metadata = metadata if isinstance(metadata, dict) else {}
    civitai_meta = metadata.get("civitai") if isinstance(metadata.get("civitai"), dict) else {}
    size_bytes = metadata.get("size_bytes")
    size_kb = None
    try:
        size_kb = float(size_bytes) / 1024 if size_bytes is not None else None
    except Exception:
        size_kb = None

    installed_at = None
    try:
        installed_at = target_path.stat().st_mtime
    except Exception:
        installed_at = None

    file_name = target_path.name
    sidecar = {
        "file_path": str(target_path),
        "model_name": metadata.get("name") or civitai_meta.get("model_name"),
        "base_model": metadata.get("base_model_name"),
        "from_civitai": metadata.get("source") == "civitai",
        "metadata_source": "embeddr-sync",
        "size": size_bytes,
        "modified": installed_at,
        "downloadUrl": civitai_meta.get("download_url"),
        "civitai": {
            "name": metadata.get("name"),
            "baseModel": metadata.get("base_model_name"),
            "downloadUrl": civitai_meta.get("download_url"),
            "model": {
                "name": civitai_meta.get("model_name") or metadata.get("name"),
                "baseModel": metadata.get("base_model_name"),
                "type": civitai_meta.get("model_type"),
            },
            "files": [
                {
                    "name": file_name,
                    "type": metadata.get("format"),
                    "sizeKB": size_kb,
                    "downloadUrl": civitai_meta.get("download_url"),
                }
            ],
            "images": [],
            "stats": {},
            "creator": {},
        },
    }
    return sidecar


@PromptServer.instance.routes.get("/embeddr/proxy")
@PromptServer.instance.routes.post("/embeddr/proxy")
@PromptServer.instance.routes.put("/embeddr/proxy")
@PromptServer.instance.routes.delete("/embeddr/proxy")
async def proxy_request(request):
    url = request.rel_url.query.get("url")
    if not url:
        return web.Response(status=400, text="Missing url param")

    # Load config to get API key
    config = {}
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH) as f:
                config = json.load(f)
        except Exception:
            pass

    api_key = config.get("api_key", "")

    headers = {}
    if api_key:
        headers["X-API-Key"] = api_key

    # Forward Content-Type if present
    if "Content-Type" in request.headers:
        headers["Content-Type"] = request.headers["Content-Type"]

    method = request.method
    data = None
    if request.can_read_body:
        data = await request.read()

    async with aiohttp.ClientSession() as session:
        try:
            async with session.request(method, url, headers=headers, data=data) as resp:
                # Create response with status code from upstream
                response = web.StreamResponse(status=resp.status, reason=resp.reason)

                # Forward relevant headers
                for h in ["Content-Type", "Content-Length", "Content-Disposition"]:
                    if h in resp.headers:
                        response.headers[h] = resp.headers[h]

                await response.prepare(request)

                async for chunk in resp.content.iter_chunked(1024 * 64):
                    await response.write(chunk)

                return response
        except Exception as e:
            print(f"[Embeddr Proxy Error] {e}")
            return web.Response(status=500, text=str(e))


@PromptServer.instance.routes.post("/embeddr/config")
async def save_config(request):
    try:
        data = await request.json()
        print(f"[Embeddr] Saving config: {data}")
        api_key = data.get("api_key")
        endpoint = data.get("endpoint")
        mode = data.get("mode")
        grid_preview_contain = data.get("grid_preview_contain")

        config = {}
        if os.path.exists(CONFIG_PATH):
            try:
                with open(CONFIG_PATH) as f:
                    config = json.load(f)
            except Exception:
                pass

        if api_key is not None:
            config["api_key"] = api_key
        if endpoint is not None:
            config["endpoint"] = endpoint
        if mode is not None:
            config["mode"] = mode
        if grid_preview_contain is not None:
            config["grid_preview_contain"] = grid_preview_contain

        with open(CONFIG_PATH, "w") as f:
            json.dump(config, f)

        return web.json_response({"status": "success"})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)


@PromptServer.instance.routes.get("/embeddr/config")
async def get_config(request):
    config = _load_config()

    endpoint = config.get("endpoint", "http://localhost:8003")
    mode = config.get("mode", "local")
    grid_preview_contain = config.get("grid_preview_contain", False)
    api_key = config.get("api_key", "")

    auth_salt = config.get("auth_salt", os.environ.get("EMBEDDR_AUTH_SALT", ""))

    # Return key for UI so frontend can make authorized requests
    return web.json_response(
        {
            "endpoint": endpoint,
            "mode": mode,
            "grid_preview_contain": grid_preview_contain,
            "api_key": api_key,
            "auth_salt": auth_salt,
        }
    )


@PromptServer.instance.routes.get("/embeddr/health")
async def embeddr_health(request):
    config = _load_config()
    endpoint = config.get("endpoint") or "http://localhost:8003"
    api_key = config.get("api_key")
    base_url = _normalize_base_url(endpoint)

    if not api_key:
        return web.json_response(
            {
                "ok": False,
                "status": "missing_key",
                "endpoint": base_url,
                "note": "ComfyUI API key is not configured.",
            },
            status=400,
        )

    url = f"{base_url}/api/v1/plugins/embeddr-comfyui/check"
    headers = {"X-API-Key": api_key}

    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url, headers=headers, timeout=5) as resp:
                payload = None
                try:
                    payload = await resp.json()
                except Exception:
                    payload = None

                if resp.status == 403:
                    return web.json_response(
                        {
                            "ok": False,
                            "status": "unauthorized",
                            "endpoint": base_url,
                            "note": "Embeddr rejected the API key.",
                            "embeddr": payload,
                        },
                        status=403,
                    )

                return web.json_response(
                    {
                        "ok": resp.status < 400,
                        "status": resp.status,
                        "endpoint": base_url,
                        "embeddr": payload,
                    },
                    status=200 if resp.status < 400 else resp.status,
                )
        except Exception as e:
            return web.json_response(
                {
                    "ok": False,
                    "status": "error",
                    "endpoint": base_url,
                    "note": str(e),
                },
                status=500,
            )


@PromptServer.instance.routes.post("/embeddr/install-artifact")
async def install_artifact(request):
    try:
        payload = await request.json()
        if not isinstance(payload, dict):
            payload = {}
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=400)

    artifact_id = str(payload.get("artifact_id") or "").strip()
    if not artifact_id:
        return web.json_response(
            {"ok": False, "error": "artifact_id_required"},
            status=400,
        )

    library_kind = str(payload.get("library_kind") or "loras").strip().lower() or "loras"
    overwrite = bool(payload.get("overwrite"))
    file_name_override = payload.get("file_name")

    roots = _candidate_library_roots(library_kind)
    if not roots:
        return web.json_response(
            {
                "ok": False,
                "error": "library_root_not_found",
                "message": f"Could not resolve a ComfyUI library root for '{library_kind}'.",
            },
            status=500,
        )

    target_root = roots[0]
    target_root.mkdir(parents=True, exist_ok=True)

    config = _load_config()
    base_url = _normalize_base_url(config.get("endpoint") or os.environ.get("EMBEDDR_BACKEND_URL"))
    api_key = config.get("api_key", "")
    headers = {"X-API-Key": api_key} if api_key else {}

    metadata_url = f"{base_url}/api/v1/artifacts/{artifact_id}"
    content_url = f"{base_url}/api/v1/artifacts/{artifact_id}/content?proxy=1"

    timeout = aiohttp.ClientTimeout(total=None, connect=15, sock_read=300)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(metadata_url, headers=headers) as response:
            if response.status >= 400:
                detail = await response.text()
                return web.json_response(
                    {
                        "ok": False,
                        "error": "artifact_lookup_failed",
                        "status": response.status,
                        "detail": detail,
                    },
                    status=response.status,
                )
            try:
                artifact_payload = await response.json()
            except Exception:
                artifact_payload = {}

        file_name = _guess_install_filename(
            artifact_payload,
            artifact_id=artifact_id,
            file_name_override=file_name_override,
        )
        target_path = target_root / file_name
        sidecar_path = target_path.with_name(f"{target_path.stem}.metadata.json")

        if target_path.exists() and not overwrite:
            return web.json_response(
                {
                    "ok": True,
                    "cached": True,
                    "artifact_id": artifact_id,
                    "library_kind": library_kind,
                    "file_name": target_path.name,
                    "local_path": str(target_path),
                    "sidecar_path": str(sidecar_path) if sidecar_path.exists() else None,
                    "message": "File already present on this instance.",
                }
            )

        tmp_fd, tmp_name = tempfile.mkstemp(
            prefix="embeddr-sync-",
            suffix=target_path.suffix or ".bin",
            dir=str(target_root),
        )
        os.close(tmp_fd)
        tmp_path = Path(tmp_name)

        try:
            async with session.get(content_url, headers=headers) as response:
                if response.status >= 400:
                    detail = await response.text()
                    return web.json_response(
                        {
                            "ok": False,
                            "error": "artifact_download_failed",
                            "status": response.status,
                            "detail": detail,
                        },
                        status=response.status,
                    )

                bytes_written = 0
                with tmp_path.open("wb") as handle:
                    async for chunk in response.content.iter_chunked(1024 * 256):
                        if not chunk:
                            continue
                        handle.write(chunk)
                        bytes_written += len(chunk)

            target_path.parent.mkdir(parents=True, exist_ok=True)
            os.replace(tmp_path, target_path)
        finally:
            if tmp_path.exists():
                with contextlib.suppress(Exception):
                    tmp_path.unlink()

    sidecar_payload = _build_sidecar_metadata(artifact_payload, target_path)
    try:
        with sidecar_path.open("w", encoding="utf-8") as handle:
            json.dump(sidecar_payload, handle, indent=2)
    except Exception as exc:
        return web.json_response(
            {
                "ok": False,
                "error": "sidecar_write_failed",
                "detail": str(exc),
                "local_path": str(target_path),
            },
            status=500,
        )

    return web.json_response(
        {
            "ok": True,
            "cached": False,
            "artifact_id": artifact_id,
            "library_kind": library_kind,
            "file_name": target_path.name,
            "local_path": str(target_path),
            "sidecar_path": str(sidecar_path),
            "message": f"Installed {target_path.name} into {library_kind}.",
        }
    )


class EmbeddrComfyUIExtension(ComfyExtension):
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [
            EmbeddrFindSimilarArtifactsNode,
            EmbeddrFindSimilarToArtifactNode,
            EmbeddrFindSimilarTextNode,
            EmbeddrLoadArtifactNode,
            EmbeddrLoadArtifactsNode,
            EmbeddrMergeIDsNode,
            EmbeddrSplitIDsNode,
            EmbeddrExtractArtifactInfoNode,
            EmbeddrUploadArtifactNode,
            UploadArtifactOptionsNode,
            EmbeddrUploadVideo,
            EmbeddrLoadVideoNode,
            EmbeddrLoRAStack,
            EmbeddrFindCollectionNode,
            EmbeddrActionNode,
        ]


async def comfy_entrypoint() -> ComfyExtension:
    print("[EmbeddrComfyUIExtension] Initializing Embeddr ComfyUI Extension...")
    print("[EmbeddrComfyUIExtension] Extension initialized.")
    return EmbeddrComfyUIExtension()


WEB_DIRECTORY = "./js"
__all__ = ["WEB_DIRECTORY", "EmbeddrComfyUIExtension", "comfy_entrypoint"]
