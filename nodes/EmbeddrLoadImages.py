import requests
from urllib.parse import urljoin, urlparse
import logging
import os
import torch
import numpy as np
from PIL import Image, ImageOps
from io import BytesIO
import random
from comfy_api.latest import io, ui
from .utils import get_config
from .utils.api import get_collections, get_libraries
from .utils.config import get_auth_headers


class EmbeddrLoadImagesNode(io.ComfyNode):
    _cache = {}

    _logger = logging.getLogger("embeddr.comfyui.load_images")

    @classmethod
    def _debug(cls, message: str, **fields):
        if os.environ.get("EMBEDDR_COMFYUI_DEBUG", "").lower() not in {
            "1",
            "true",
            "yes",
        }:
            return
        try:
            cls._logger.info("%s | %s", message, fields)
        except Exception:
            cls._logger.info("%s", message)

    @classmethod
    def _resolve_artifact_url(cls, base_url: str, artifact_id: str):
        resolve_url = f"{base_url}/api/v1/artifacts/{artifact_id}/resolve?variant=original&proxy=1"
        cls._debug("resolving_artifact", artifact_id=artifact_id,
                   resolve_url=resolve_url)
        res = requests.get(resolve_url, headers=get_auth_headers())
        res.raise_for_status()
        data = res.json()
        url = data.get("url")
        headers = data.get("headers") or {}
        if url and url.startswith("/"):
            url = urljoin(base_url, url)

        if url and "/api/v1/artifacts/" in url and "/content" in url and "proxy=" not in url:
            url = f"{url}?proxy=1"

        base_netloc = urlparse(base_url).netloc
        url_netloc = urlparse(url).netloc if url else ""
        if url and base_netloc and url_netloc and url_netloc != base_netloc:
            proxy_url = f"{base_url}/api/v1/artifacts/{artifact_id}/content?proxy=1"
            cls._debug(
                "forcing_proxy_url",
                artifact_id=artifact_id,
                resolved_url=url,
                proxy_url=proxy_url,
            )
            return proxy_url, {}
        cls._debug("resolved_artifact", artifact_id=artifact_id,
                   url=url, headers=headers)
        return url, headers

    @classmethod
    def define_schema(cls) -> io.Schema:
        # Note: Dynamic fetching (get_collections) might need updates to V2 too
        # but for now we focus on the execution logic
        collections = ["All"] + get_collections()
        # Legacy libraries -> Folders/Collections?
        libraries = ["All"] + get_libraries()

        return io.Schema(
            node_id="embeddr.EmbeddrLoadImages",
            display_name="Embeddr Load Images",
            description="Loads images from Embeddr using V2 Artifacts API.",
            category="Embeddr",
            inputs=[
                io.Combo.Input("library", options=libraries, default="All"),
                io.Combo.Input(
                    "collection", options=collections, default="All"),
                io.Combo.Input("sort_by", options=[
                               "newest", "random"], default="newest"),
                io.Int.Input("limit", default=5, min=1, max=100),
                io.Int.Input("seed", default=0,
                             display_name="Seed (Random Sort)"),
            ],
            outputs=[
                io.Image.Output("images", is_output_list=True),
                io.String.Output("embeddr_ids", is_output_list=True),
                io.Mask.Output("masks", is_output_list=True),
            ],
        )

    @classmethod
    def execute(cls, library, collection, sort_by, limit, seed):
        # Cache key based on inputs
        cache_key = (library, collection, sort_by, limit, seed)
        if cache_key in cls._cache:
            return cls._cache[cache_key]

        try:
            config = get_config()
            base_url = config.get("embeddr_url") or config.get(
                "endpoint") or "http://localhost:8003"
            base_url = base_url.rstrip("/")

            # V2 API: List Artifacts
            api_url = f"{base_url}/api/v1/artifacts/"

            params = {
                "limit": limit,
                "type_name": "image",  # Filter for images
                "offset": 0
            }

            # Parse Collection ID (UUID in V2?)
            # Legacy logic assumed "123: Name"
            if collection != "All":
                try:
                    col_id = collection.split(":")[0].strip()
                    params["collection_id"] = col_id
                except:
                    pass

            # Legacy Libraries mapped to ?
            # In V2 we might ignore library or treat as another collection filter
            if library != "All":
                try:
                    lib_id = library.split(":")[0].strip()
                    params["library_id"] = lib_id
                except:
                    pass

            if sort_by == "random":
                params["sort"] = "random"
                params["seed"] = seed  # Pass seed if API supports it
            else:
                params["sort"] = "new"

            response = requests.get(
                api_url, params=params, headers=get_auth_headers())
            response.raise_for_status()
            data = response.json()
            items = data.get("items", [])

            if not items:
                return cls._return_empty()

            images_list = []
            masks_list = []
            ids_list = []

            for item in items:
                art_id = item.get("id")
                if not art_id:
                    continue

                # Fetch Content via Plugin Endpoint
                # Uses the plugin endpoint we defined to get raw content
                content_url, content_headers = cls._resolve_artifact_url(
                    base_url, art_id)

                cls._debug(
                    "requesting_artifact_content",
                    artifact_id=str(art_id),
                    content_url=content_url,
                )

                try:
                    final_headers = get_auth_headers()
                    if content_headers:
                        final_headers.update(content_headers)

                    img_resp = requests.get(
                        content_url, headers=final_headers)
                    img_resp.raise_for_status()
                    cls._debug(
                        "artifact_content_response",
                        artifact_id=str(art_id),
                        status=img_resp.status_code,
                        content_type=img_resp.headers.get("content-type"),
                        length=img_resp.headers.get("content-length"),
                    )

                    img = Image.open(BytesIO(img_resp.content))
                    img = ImageOps.exif_transpose(img)

                    # Convert to tensor conformant
                    i = img.convert("RGB")
                    i_np = np.array(i).astype(np.float32) / 255.0
                    images_list.append(torch.from_numpy(i_np))

                    # Mask
                    if 'A' in img.getbands():
                        m_np = np.array(img.getchannel('A')).astype(
                            np.float32) / 255.0
                        masks_list.append(1. - torch.from_numpy(m_np))
                    else:
                        masks_list.append(torch.zeros(
                            (i_np.shape[0], i_np.shape[1]), dtype=torch.float32, device="cpu"))

                    ids_list.append(str(art_id))

                except Exception as e:
                    print(f"Failed to load artifact {art_id}: {e}")
                    cls._debug(
                        "artifact_load_failed",
                        artifact_id=str(art_id),
                        error=str(e),
                    )

            if not images_list:
                return cls._return_empty()

            # Stack images into batch [B, H, W, C]?
            # Note: If images have different sizes, stacking might fail.
            # ComfyUI usually expects same size for batch.
            # If size differs, we might return list or resize.
            # Since output is_output_list=True, likely returns list of individual tensors.

            # Correct return for output list
            # "images" -> list of [H, W, C] or list of [1, H, W, C]?
            # Usually list output means list of whatever single output is.
            # Single Image output is [1, H, W, C].

            # Ensure each is [1, H, W, C]
            final_images = [img[None,] for img in images_list]

            # Cache result
            result = io.NodeOutput(final_images, ids_list, masks_list)
            cls._cache[cache_key] = result
            return result

        except Exception as e:
            print(f"[Embeddr] LoadImages Error: {e}")
            return cls._return_empty()

    @classmethod
    def _return_empty(cls):
        empty_image = torch.zeros(
            (1, 64, 64, 3), dtype=torch.float32, device="cpu")
        empty_mask = torch.zeros(
            (1, 64, 64), dtype=torch.float32, device="cpu")
        return io.NodeOutput([empty_image], ["-1"], [empty_mask])
