import requests
from urllib.parse import urljoin, urlparse
import logging
import os
import torch
import numpy as np
from PIL import Image, ImageOps
from io import BytesIO
from comfy_api.latest import io, ui
from .utils import get_config
from .utils.config import get_auth_headers
from .types import EmbeddrArtifactID, EmbeddrArtifactIDObject, EmbeddrArtifactInfo, EmbeddrArtifactInfoObject


class EmbeddrLoadArtifactNode(io.ComfyNode):
    _cache = {}

    _logger = logging.getLogger("embeddr.comfyui.load_artifact")

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
        return io.Schema(
            node_id="embeddr.LoadArtifact",
            display_name="Embeddr Load Artifact (V2)",
            description="Loads an image/artifact from Embeddr by UUID.",
            category="Embeddr",
            inputs=[
                io.String.Input("manual_artifact_id",
                                tooltip="Manual UUID string (used if input not connected)", default=""),
                EmbeddrArtifactID.Input("artifact_id",
                                        tooltip="UUID of the artifact to load", optional=True),
                io.Boolean.Input("use_cache", default=True)
            ],
            outputs=[
                io.Image.Output("image"),
                io.Mask.Output("mask"),
                EmbeddrArtifactID.Output("artifact_id_out"),
                EmbeddrArtifactInfo.Output("artifact_info"),
            ],
        )

    @classmethod
    def execute(cls, use_cache, artifact_id=None, manual_artifact_id=None):
        # Resolve artifact_id from connection or manual input
        resolved_id = ""

        if artifact_id is not None:
            if isinstance(artifact_id, EmbeddrArtifactIDObject):
                resolved_id = artifact_id.artifact_id
            else:
                resolved_id = str(artifact_id)

        # Fallback to manual input if connection is empty
        if not resolved_id and manual_artifact_id:
            resolved_id = str(manual_artifact_id).strip()

        if not resolved_id:
            # Return empty black image if no ID
            empty_image = torch.zeros(
                (1, 64, 64, 3), dtype=torch.float32, device="cpu")
            empty_mask = torch.zeros(
                (1, 64, 64), dtype=torch.float32, device="cpu")
            return io.NodeOutput(
                empty_image,
                empty_mask,
                EmbeddrArtifactIDObject(artifact_id=""),
                EmbeddrArtifactInfoObject(data={})
            )

        if use_cache and resolved_id in cls._cache:
            image, mask, info = cls._cache[resolved_id]
            return io.NodeOutput(image, mask, EmbeddrArtifactIDObject(artifact_id=resolved_id), info)

        try:
            config = get_config()
            base_url = config.get("embeddr_url") or config.get(
                "endpoint") or "http://localhost:8003"
            base_url = base_url.rstrip("/")

            # 1. Fetch JSON metadata first
            meta_url = f"{base_url}/api/v1/artifacts/{resolved_id}"
            meta_res = requests.get(meta_url, headers=get_auth_headers())
            meta_res.raise_for_status()
            artifact_data = meta_res.json()
            info_obj = EmbeddrArtifactInfoObject(data=artifact_data)

            # 2. Resolve content
            endpoint, content_headers = cls._resolve_artifact_url(
                base_url, resolved_id
            )

            cls._debug(
                "requesting_artifact_content",
                artifact_id=resolved_id,
                endpoint=endpoint,
            )

            # Merge auth headers with any resolved headers (e.g. S3 signed headers or similar)
            final_headers = get_auth_headers()
            if content_headers:
                final_headers.update(content_headers)

            response = requests.get(endpoint, headers=final_headers)
            response.raise_for_status()
            cls._debug(
                "artifact_content_response",
                status=response.status_code,
                content_type=response.headers.get("content-type"),
                length=response.headers.get("content-length"),
            )
            img = Image.open(BytesIO(response.content))

            img = ImageOps.exif_transpose(img)
            image = img.convert("RGB")
            image = np.array(image).astype(np.float32) / 255.0
            image = torch.from_numpy(image)[None,]

            if 'A' in img.getbands():
                mask = np.array(img.getchannel('A')).astype(np.float32) / 255.0
                mask = 1. - torch.from_numpy(mask)
            else:
                mask = torch.zeros((64, 64), dtype=torch.float32, device="cpu")

            if use_cache:
                cls._cache[resolved_id] = (image, mask, info_obj)

            return io.NodeOutput(image, mask, EmbeddrArtifactIDObject(artifact_id=resolved_id), info_obj, ui=ui.PreviewImage(image))

        except Exception as e:
            print(f"[Embeddr] Error loading artifact {resolved_id}: {e}")
            cls._debug("artifact_load_failed",
                       artifact_id=resolved_id, error=str(e))
            # Raise error to stop workflow if loading fails
            raise e
