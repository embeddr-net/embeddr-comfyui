import requests
import torch
import numpy as np
from PIL import Image, ImageOps
from io import BytesIO
import random
from comfy_api.latest import io, ui
from .utils import get_config
from .utils.api import get_collections, get_libraries


class EmbeddrLoadImagesNode(io.ComfyNode):
    _cache = {}

    @classmethod
    def define_schema(cls) -> io.Schema:
        collections = ["All"] + get_collections()
        libraries = ["All"] + get_libraries()

        return io.Schema(
            node_id="embeddr.EmbeddrLoadImages",
            display_name="Embeddr Load Images",
            description="Loads images from Embeddr with filtering and sorting.",
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
            endpoint = config.get("endpoint", "http://localhost:8003")
            api_base_url = endpoint.rstrip("/") + "/api/v1"

            params = {
                "limit": limit,
            }

            # Parse Library ID
            if library != "All":
                try:
                    lib_id = int(library.split(":")[0])
                    params["library_id"] = lib_id
                except:
                    pass

            # Parse Collection ID
            if collection != "All":
                try:
                    col_id = int(collection.split(":")[0])
                    params["collection_id"] = col_id
                except:
                    pass

            # Handle Sort
            if sort_by == "random":
                params["sort"] = "random"
                # Note: Server-side random might not respect seed, but we pass it just in case
                # or we could implement client-side shuffle if we fetched more.
                # For now, we rely on server-side random for efficiency.
            else:
                params["sort"] = "new"

            # Fetch images
            url = f"{api_base_url}/images"
            response = requests.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            items = data.get("items", [])

            if not items:
                return cls._return_empty()

            images_list = []
            masks_list = []
            ids_list = []

            for item in items:
                image_id = item.get("id")
                if not image_id:
                    continue

                image_url = f"{api_base_url}/images/{image_id}/file"

                try:
                    img_resp = requests.get(image_url)
                    img_resp.raise_for_status()
                    img = Image.open(BytesIO(img_resp.content))
                    img = ImageOps.exif_transpose(img)

                    image = img.convert("RGB")
                    image_np = np.array(image).astype(np.float32) / 255.0
                    # Add batch dimension: [1, H, W, C]
                    image_tensor = torch.from_numpy(image_np).unsqueeze(0)

                    if 'A' in img.getbands():
                        mask_np = np.array(img.getchannel(
                            'A')).astype(np.float32) / 255.0
                        mask_tensor = 1. - torch.from_numpy(mask_np)
                        mask_tensor = mask_tensor.unsqueeze(0)  # [1, H, W]
                    else:
                        mask_tensor = torch.zeros(
                            (1, img.height, img.width), dtype=torch.float32, device="cpu")

                    images_list.append(image_tensor)
                    masks_list.append(mask_tensor)
                    ids_list.append(str(image_id))
                except Exception as e:
                    print(f"[Embeddr] Failed to load image {image_id}: {e}")
                    continue

            if not images_list:
                return cls._return_empty()

            # Return lists
            result = io.NodeOutput(images_list, ids_list, masks_list)
            cls._cache[cache_key] = result
            return result

        except Exception as e:
            print(f"[Embeddr] Error loading images: {e}")
            return cls._return_empty()

    @staticmethod
    def _return_empty():
        return io.NodeOutput([], [], [])
