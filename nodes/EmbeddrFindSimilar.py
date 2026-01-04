import requests
import torch
import numpy as np
from PIL import Image
import io as pyio
from comfy_api.latest import io, ui
from .utils import get_config
from .utils.api import get_libraries, get_collections


class EmbeddrFindSimilarNode(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        # Fetch dynamic options
        libraries = ["All"] + get_libraries()
        collections = ["All"] + get_collections()

        return io.Schema(
            node_id="embeddr.FindSimilar",
            display_name="Embeddr Find Similar",
            description="Finds similar images in your Embeddr library using an input image.",
            category="Embeddr",
            inputs=[
                io.Image.Input("image"),
                io.Combo.Input("library", options=libraries, default="All"),
                io.Combo.Input(
                    "collection", options=collections, default="All"),
                io.Int.Input("limit", default=5, min=1, max=50),
                io.Float.Input("threshold", default=0.0, min=0.0,
                               max=1.0, step=0.01, display_name="Min Score"),
            ],
            outputs=[
                io.Image.Output("images", is_output_list=True),
                io.String.Output("embeddr_ids", is_output_list=True),
            ],
        )

    @classmethod
    def execute(cls, image, library="All", collection="All", limit=5, threshold=0.0):
        config = get_config()
        endpoint = config.get("endpoint", "http://localhost:8003")
        api_url = endpoint.rstrip("/") + "/api/v1/images/search/image"

        # Prepare image (take first of batch)
        img_array = (image[0].cpu().numpy() * 255).astype(np.uint8)
        img = Image.fromarray(np.clip(img_array, 0, 255))

        buf = pyio.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)

        files = {"file": ("image.png", buf, "image/png")}
        data = {
            "limit": limit,
        }

        # Parse IDs from "ID: Name" format
        if library != "All":
            try:
                lib_id = int(library.split(":")[0])
                data["library_id"] = lib_id
            except:
                pass

        if collection != "All":
            try:
                col_id = int(collection.split(":")[0])
                data["collection_id"] = col_id
            except:
                pass

        try:
            response = requests.post(api_url, files=files, data=data)
            response.raise_for_status()
            results = response.json()
            items = results.get("items", [])

            if not items:
                # Return empty
                empty = torch.zeros(
                    (1, 64, 64, 3), dtype=torch.float32, device="cpu")
                return io.NodeOutput(empty, "[]")

            # Load images
            output_images = []
            output_ids = []

            for item in items:
                # Fetch image file
                img_url = endpoint.rstrip(
                    "/") + f"/api/v1/images/{item['id']}/file"
                img_resp = requests.get(img_url)
                if img_resp.status_code == 200:
                    i = Image.open(pyio.BytesIO(img_resp.content))
                    i = i.convert("RGB")
                    i = np.array(i).astype(np.float32) / 255.0
                    output_images.append(torch.from_numpy(i))
                    output_ids.append(str(item['id']))

            if not output_images:
                return io.NodeOutput([], [])

            # Return list of images (unsqueeze to add batch dimension 1)
            final_images = [img.unsqueeze(0) for img in output_images]
            return io.NodeOutput(final_images, output_ids)

        except Exception as e:
            print(f"[Embeddr] Search failed: {e}")
            empty = torch.zeros(
                (1, 64, 64, 3), dtype=torch.float32, device="cpu")
            return io.NodeOutput(empty, "[]")
