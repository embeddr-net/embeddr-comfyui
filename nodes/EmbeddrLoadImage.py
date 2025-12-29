import requests
import torch
import numpy as np
from PIL import Image, ImageOps
from io import BytesIO
from comfy_api.latest import io


class EmbeddrLoadImageNode(io.ComfyNode):
    _cache = {}

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="embeddr.LoadImage",
            display_name="Embeddr Load Image",
            description="Loads an image from a URL (Embeddr).",
            category="Embeddr",
            inputs=[
                io.String.Input("image_url", default=""),
            ],
            outputs=[
                io.Image.Output("image"),
                io.Mask.Output("mask"),
            ],
        )

    @classmethod
    def execute(cls, image_url):
        if not image_url:
            # Return empty black image if no URL
            empty_image = torch.zeros(
                (1, 64, 64, 3), dtype=torch.float32, device="cpu")
            empty_mask = torch.zeros(
                (1, 64, 64), dtype=torch.float32, device="cpu")
            return io.NodeOutput(empty_image, empty_mask)

        if image_url in cls._cache:
            image, mask = cls._cache[image_url]
            return io.NodeOutput(image, mask)

        try:
            response = requests.get(image_url)
            response.raise_for_status()
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

            cls._cache[image_url] = (image, mask)
            return io.NodeOutput(image, mask)

        except Exception as e:
            print(f"[Embeddr] Error loading image: {e}")
            empty_image = torch.zeros(
                (1, 64, 64, 3), dtype=torch.float32, device="cpu")
            empty_mask = torch.zeros(
                (1, 64, 64), dtype=torch.float32, device="cpu")
            return io.NodeOutput(empty_image, empty_mask)
