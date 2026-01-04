import os
import json
from aiohttp import web
from server import PromptServer
from comfy_api.latest import ComfyExtension, io

from .nodes.EmbeddrUploadImage import EmbeddrSaveToFolderNode
from .nodes.EmbeddrLoadImage import EmbeddrLoadImageNode
from .nodes.EmbeddrLoadImages import EmbeddrLoadImagesNode
from .nodes.EmbeddrMergeIDs import EmbeddrMergeIDsNode
from .nodes.EmbeddrFindSimilar import EmbeddrFindSimilarNode
from .nodes.EmbeddrFindSimilarText import EmbeddrFindSimilarTextNode
from .nodes.EmbeddrUploadVideo import EmbeddrUploadVideo

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")


def get_api_key():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r") as f:
                config = json.load(f)
                return config.get("api_key", "")
        except Exception:
            return ""
    return ""


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
    config = {}
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r") as f:
                config = json.load(f)
        except:
            pass

    endpoint = config.get("endpoint", "http://localhost:8003")
    mode = config.get("mode", "local")
    grid_preview_contain = config.get("grid_preview_contain", False)

    # Return masked key for UI
    return web.json_response({
        "endpoint": endpoint,
        "mode": mode,
        "grid_preview_contain": grid_preview_contain
    })


class EmbeddrComfyUIExtension(ComfyExtension):
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [
            EmbeddrFindSimilarNode,
            EmbeddrFindSimilarTextNode,
            EmbeddrLoadImageNode,
            EmbeddrLoadImagesNode,
            EmbeddrMergeIDsNode,
            EmbeddrSaveToFolderNode,
            EmbeddrUploadVideo,
        ]


async def comfy_entrypoint() -> ComfyExtension:
    print("[EmbeddrComfyUIExtension] Initializing Embeddr ComfyUI Extension...")
    print("[EmbeddrComfyUIExtension] Extension initialized.")
    return EmbeddrComfyUIExtension()


WEB_DIRECTORY = "./js"
__all__ = ["EmbeddrComfyUIExtension", "comfy_entrypoint", "WEB_DIRECTORY"]
