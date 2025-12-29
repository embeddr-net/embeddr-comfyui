import torch
import numpy as np
from PIL import Image
import io as python_io
import requests
from comfy_api.latest import io, ui

# Import helper from parent package
# Note: In ComfyUI, nodes are imported dynamically, so relative imports can be tricky.
# We'll try a direct import or use the config file directly if needed.
import os
import json


def get_config():
    # Helper to read config directly to avoid circular imports or path issues
    try:
        config_path = os.path.join(os.path.dirname(
            os.path.dirname(__file__)), "config.json")
        if os.path.exists(config_path):
            with open(config_path, "r") as f:
                config = json.load(f)
                return config
    except:
        pass
    return {}


class EmbeddrSaveToFolderNode(io.ComfyNode):

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="embeddr.SaveToFolder",
            display_name="Embeddr Upload Image",
            description="Uploads an image to Embeddr using your saved API Key.",
            category="Embeddr",
            is_output_node=True,
            inputs=[
                io.Image.Input(
                    "image",
                ),
                io.String.Input(
                    "prompt",
                    optional=True
                ),
            ],
        )

    @classmethod
    def execute(cls, image, prompt):
        print("[Embeddr] Uploading image...")

        config = get_config()
        endpoint = config.get("endpoint", "http://localhost:8003")
        api_endpoint = endpoint + "/api/v1"

        try:
            # Convert Tensor to PIL Image
            # image is [B, H, W, C]
            for i in range(image.shape[0]):
                img_tensor = image[i]
                img_array = 255. * img_tensor.cpu().numpy()
                img = Image.fromarray(
                    np.clip(img_array, 0, 255).astype(np.uint8))

                # Save to bytes
                img_byte_arr = python_io.BytesIO()
                img.save(img_byte_arr, format='PNG')
                img_byte_arr.seek(0)

                # Prepare request
                files = {'file': ('comfy_gen.png', img_byte_arr, 'image/png')}
                data = {'prompt': prompt}

                # Send request
                if endpoint.endswith('/'):
                    endpoint = endpoint[:-1]
                url = f"{api_endpoint}/images/upload"

                response = requests.post(
                    url, files=files, data=data)

                if response.status_code == 200:
                    print(
                        f"[Embeddr] Upload successful: {response.json().get('id')}")
                else:
                    print(
                        f"[Embeddr] Upload failed: {response.status_code} - {response.text}")

        except Exception as e:
            print(f"[Embeddr] Error executing node: {e}")
        return io.NodeOutput(ui=ui.PreviewImage(image, cls=cls))
