import requests
import torch
import numpy as np
from PIL import Image, ImageOps
import io as pyio
from comfy_api.latest import io, ui
from .utils import get_config
from .utils.api import get_libraries, get_collections


class EmbeddrFindSimilarTextNode(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        # Fetch dynamic options
        libraries = ["All"] + get_libraries()
        collections = ["All"] + get_collections()

        return io.Schema(
            node_id="embeddr.FindSimilarText",
            display_name="Embeddr Find Similar (Text)",
            description="Finds similar images in your Embeddr library using a text prompt.",
            category="Embeddr",
            inputs=[
                io.String.Input("prompt", multiline=True),
                io.Combo.Input("library", options=libraries, default="All"),
                io.Combo.Input(
                    "collection", options=collections, default="All"),
                io.Int.Input("limit", default=5, min=1, max=50),
            ],
            outputs=[
                io.Image.Output("images", is_output_list=True),
                io.String.Output("embeddr_ids", is_output_list=True),
            ],
        )

    @classmethod
    def execute(cls, prompt, library="All", collection="All", limit=5):
        config = get_config()
        endpoint = config.get("endpoint", "http://localhost:8003")
        api_url = endpoint.rstrip("/") + "/api/v1/images"

        params = {
            "q": prompt,
            "limit": limit,
        }

        # Parse IDs from "ID: Name" format
        if library != "All":
            try:
                lib_id = int(library.split(":")[0])
                params["library_id"] = lib_id
            except:
                pass

        if collection != "All":
            try:
                col_id = int(collection.split(":")[0])
                params["collection_id"] = col_id
            except:
                pass

        try:
            response = requests.get(api_url, params=params)
            response.raise_for_status()
            results = response.json()
            items = results.get("items", [])

            if not items:
                # Return empty
                empty = torch.zeros(
                    (1, 64, 64, 3), dtype=torch.float32, device="cpu")
                return io.NodeOutput(empty, "")

            # Load images
            output_images = []
            output_ids = []

            first_width = 0
            first_height = 0

            for item in items:
                # Fetch image file
                img_url = endpoint.rstrip(
                    "/") + f"/api/v1/images/{item['id']}/file"
                img_resp = requests.get(img_url)
                if img_resp.status_code == 200:
                    i = Image.open(pyio.BytesIO(img_resp.content))
                    i = ImageOps.exif_transpose(i)

                    i = i.convert("RGB")
                    i = np.array(i).astype(np.float32) / 255.0
                    # Add batch dimension (1, H, W, C)
                    output_images.append(torch.from_numpy(i).unsqueeze(0))
                    output_ids.append(str(item['id']))

            if not output_images:
                return io.NodeOutput([], [])

            return io.NodeOutput(output_images, output_ids)

        except Exception as e:
            print(f"[Embeddr] Find Similar Text error: {e}")
            empty = torch.zeros(
                (1, 64, 64, 3), dtype=torch.float32, device="cpu")
            return io.NodeOutput(empty, "")
