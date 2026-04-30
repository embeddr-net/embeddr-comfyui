import io as pyio

import numpy as np
import requests
import torch
from comfy_api.latest import io
from PIL import Image

from .utils import get_config
from .utils.config import get_auth_headers


class EmbeddrFindSimilarArtifactsNode(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="embeddr.FindSimilarArtifacts",
            display_name="Embeddr Find Similar Artifacts (V2)",
            description="Finds similar artifacts using an input image via V2 API.",
            category="Embeddr",
            inputs=[
                io.Image.Input("image"),
                io.Int.Input("limit", default=5, min=1, max=50),
                io.String.Input("model_name", default="lotus"),
            ],
            outputs=[
                io.Image.Output("images", is_output_list=True),
                io.String.Output("artifact_ids", is_output_list=True),
            ],
        )

    @classmethod
    def execute(cls, image, limit, model_name="lotus"):
        config = get_config()
        base_url = config.get("embeddr_url") or config.get("endpoint") or "http://localhost:8003"
        base_url = base_url.rstrip("/")

        # Endpoint in Plugin
        api_url = f"{base_url}/api/v1/plugins/embeddr-comfyui/find_similar"

        # Prepare image (take first of batch for query)
        img_array = (image[0].cpu().numpy() * 255).astype(np.uint8)
        img = Image.fromarray(np.clip(img_array, 0, 255))

        buf = pyio.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)

        files = {"file": ("query.png", buf, "image/png")}
        data = {"limit": limit, "model_name": model_name}

        try:
            # Upload & Search
            response = requests.post(api_url, files=files, data=data, headers=get_auth_headers())
            response.raise_for_status()
            results = response.json()
            items = results.get("items", [])  # List of objects {id, uri, ...}

            if not items:
                empty = torch.zeros((1, 64, 64, 3), dtype=torch.float32, device="cpu")
                return io.NodeOutput([empty], ["-1"])

            output_images = []
            output_ids = []

            for item in items:
                art_id = item.get("id")
                content_url = f"{base_url}/api/v1/plugins/embeddr-comfyui/content/{art_id}"

                try:
                    img_resp = requests.get(content_url, headers=get_auth_headers())
                    if img_resp.status_code == 200:
                        i = Image.open(pyio.BytesIO(img_resp.content))
                        i = i.convert("RGB")
                        i_np = np.array(i).astype(np.float32) / 255.0
                        # Add batch dim [1, H, W, C]
                        output_images.append(torch.from_numpy(i_np)[None,])
                        output_ids.append(str(art_id))
                except Exception as e:
                    print(f"Failed to fetch content for similar item {art_id}: {e}")

            if not output_images:
                empty = torch.zeros((1, 64, 64, 3), dtype=torch.float32, device="cpu")
                return io.NodeOutput([empty], ["-1"])

            return io.NodeOutput(output_images, output_ids)

        except Exception as e:
            print(f"[Embeddr] FindSimilar Error: {e}")
            empty = torch.zeros((1, 64, 64, 3), dtype=torch.float32, device="cpu")
            return io.NodeOutput([empty], ["-1"])
