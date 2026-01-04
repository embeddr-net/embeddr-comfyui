import folder_paths
from .utils.api import get_libraries, get_collections
import os
import json
import requests
import numpy as np
from PIL import Image
from PIL.PngImagePlugin import PngInfo
from comfy_api.latest import io, ui
from comfy_api.latest._io import _UIOutput, ComfyNode, FolderType
import io as pyio
import random
from .utils import get_config


def Embeddr_Log(message: str):
    print(f"[Embeddr] {message}")


class EmbeddrImage(ui.PreviewImage):
    def __init__(self, image: io.Image.Type, ids=None, animated: bool = False, cls: type[ComfyNode] = None, **kwargs):
        super().__init__(image, animated, cls=cls)
        self.extra = {}
        if ids is not None:
            self.extra["embeddr_ids"] = ids

    def as_dict(self):
        d = {
            "images": self.values,
            "animated": (self.animated,)
        }
        d.update(self.extra)
        return d


class EmbeddrSaveToFolderNode(io.ComfyNode):

    @classmethod
    def define_schema(cls) -> io.Schema:
        libraries = ["Default"] + get_libraries()
        collections = ["None"] + get_collections()

        return io.Schema(
            node_id="embeddr.SaveToFolder",
            display_name="Embeddr Upload Image",
            category="Embeddr",
            is_output_node=True,
            inputs=[
                io.Image.Input("image"),
                io.String.Input("caption", optional=True),
                io.String.Input("parent_ids", optional=True),
                io.Combo.Input("library", options=libraries,
                               default="Default"),
                io.Combo.Input(
                    "collection", options=collections, default="None"),
                io.String.Input("tags", optional=True, default=""),
                io.Boolean.Input("allow_duplicates", default=False,
                                 display_name="Allow Duplicates"),
                io.Boolean.Input("save_backup", default=False,
                                 display_name="Save to Comfy History"),
            ],
            outputs=[
                # THIS IS KEY: output name must match
                io.String.Output("embeddr_id"),
            ],
        )

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def execute(cls, image, caption=None, parent_ids=None, library="Default", collection="None", tags="", allow_duplicates=False, save_backup=False, **kwargs):
        """
        image: input tensor(s) from previous node
        caption: optional string
        parent_ids: optional string (comma separated) or list of IDs
        Returns the backend ID in the outputs so Comfy history sees it.
        """
        uploaded_ids = []

        config = get_config()
        print("Loaded Config: ", config)
        endpoint = config.get("endpoint", "http://localhost:8003")
        api_base_url = endpoint.rstrip("/") + "/api/v1"
        upload_url = f"{api_base_url}/images/upload"

        # Loop over batch images
        for i in range(image.shape[0]):
            img_array = (image[i].cpu().numpy() * 255).astype(np.uint8)
            img = Image.fromarray(np.clip(img_array, 0, 255))

            # Save backup if requested
            if save_backup:
                try:
                    output_dir = folder_paths.get_output_directory()
                    filename_prefix = "Embeddr_Backup"
                    full_output_folder, filename, counter, subfolder, filename_prefix = folder_paths.get_save_image_path(
                        filename_prefix, output_dir, img.size[0], img.size[1])

                    metadata = PngInfo()
                    if caption:
                        metadata.add_text("parameters", caption)

                    file = f"{filename}_{counter:05}_.png"
                    img.save(os.path.join(full_output_folder, file),
                             pnginfo=metadata, compress_level=4)
                except Exception as e:
                    print(f"[Embeddr] Failed to save backup: {e}")

            buf = pyio.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)

            files = {"file": ("image.png", buf, "image/png")}
            data = {"prompt": caption or ""}

            if allow_duplicates:
                data["force"] = "true"

            if tags:
                data["tags"] = tags

            if library != "Default":
                try:
                    data["library_id"] = int(library.split(":")[0])
                except:
                    pass

            if parent_ids:
                if isinstance(parent_ids, list):
                    data["parent_ids"] = ",".join(map(str, parent_ids))
                else:
                    data["parent_ids"] = str(parent_ids)

            try:
                response = requests.post(upload_url, files=files, data=data)
                response.raise_for_status()
                result = response.json()
                uploaded_id = result.get("id")
                uploaded_ids.append(str(uploaded_id))

                # Add to collection if selected
                if collection and collection != "None" and uploaded_id:
                    try:
                        collection_id = int(collection.split(":")[0])
                        requests.post(
                            f"{api_base_url}/collections/{collection_id}/items",
                            json={"image_id": uploaded_id}
                        )
                    except Exception as e:
                        print(f"[Embeddr] Failed to add to collection: {e}")

            except Exception as e:
                print(f"[Embeddr] Upload failed: {e}")
                uploaded_ids.append("-1")

        # Create preview
        preview = EmbeddrImage(image, uploaded_ids, cls=cls)

        # Return IDs as comma-separated string
        return io.NodeOutput(",".join(uploaded_ids), ui=preview)
