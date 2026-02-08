import os
import json
import aiohttp
from aiohttp import web
from server import PromptServer
from comfy_api.latest import ComfyExtension, io

from .nodes.EmbeddrUploadArtifact import EmbeddrUploadArtifactNode
from .nodes.EmbeddrLoadArtifact import EmbeddrLoadArtifactNode
from .nodes.EmbeddrLoadArtifacts import EmbeddrLoadArtifactsNode
from .nodes.EmbeddrMergeIDs import EmbeddrMergeIDsNode
from .nodes.EmbeddrExtractArtifactInfo import EmbeddrExtractArtifactInfoNode
from .nodes.EmbeddrSplitIDs import EmbeddrSplitIDsNode
from .nodes.EmbeddrFindSimilarArtifacts import EmbeddrFindSimilarArtifactsNode
from .nodes.EmbeddrFindSimilarToArtifact import EmbeddrFindSimilarToArtifactNode
from .nodes.EmbeddrFindSimilarText import EmbeddrFindSimilarTextNode
from .nodes.EmbeddrUploadVideo import EmbeddrUploadVideo
from .nodes.EmbeddrLoadVideo import EmbeddrLoadVideoNode
from .nodes.EmbeddrLoRAStack import EmbeddrLoRAStack
from .nodes.EmbeddrFindCollection import EmbeddrFindCollectionNode
from .nodes.EmbeddrUploadOptions import UploadArtifactOptionsNode

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")

print("[Embeddr Extension] Loading... Proxy routes registered.")


def get_api_key():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r") as f:
                config = json.load(f)
                return config.get("api_key", "")
        except Exception:
            return ""
    return ""


def _load_config() -> dict:
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r") as f:
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
            with open(CONFIG_PATH, "r") as f:
                config = json.load(f)
        except:
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
                response = web.StreamResponse(
                    status=resp.status, reason=resp.reason)

                # Forward relevant headers
                for h in ['Content-Type', 'Content-Length', 'Content-Disposition']:
                    if h in resp.headers:
                        response.headers[h] = resp.headers[h]

                await response.prepare(request)

                async for chunk in resp.content.iter_chunked(1024*64):
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
                with open(CONFIG_PATH, "r") as f:
                    config = json.load(f)
            except:
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

    # Return key for UI so frontend can make authorized requests
    return web.json_response({
        "endpoint": endpoint,
        "mode": mode,
        "grid_preview_contain": grid_preview_contain,
        "api_key": api_key
    })


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
        ]


async def comfy_entrypoint() -> ComfyExtension:
    print("[EmbeddrComfyUIExtension] Initializing Embeddr ComfyUI Extension...")
    print("[EmbeddrComfyUIExtension] Extension initialized.")
    return EmbeddrComfyUIExtension()


WEB_DIRECTORY = "./js"
__all__ = ["EmbeddrComfyUIExtension", "comfy_entrypoint", "WEB_DIRECTORY"]
