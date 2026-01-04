import folder_paths
from .utils.api import get_libraries, get_collections
import os
import json
import requests
import tempfile
from comfy_api.latest import io, ui
from comfy_api.latest._io import ComfyNode
from .utils import get_config


class EmbeddrUploadVideo(io.ComfyNode):

    @classmethod
    def define_schema(cls) -> io.Schema:
        libraries = ["Default"] + get_libraries()
        collections = ["None"] + get_collections()

        formats = ["mp4", "mkv", "webm", "mov", "avi"]
        codecs = ["h264", "h265", "vp9", "vp8", "prores"]

        return io.Schema(
            node_id="embeddr.SaveVideo",
            display_name="Embeddr Upload Video",
            category="Embeddr",
            is_output_node=True,
            inputs=[
                io.Video.Input("video", tooltip="The video to save."),
                io.String.Input("caption", optional=True),
                io.String.Input("parent_ids", optional=True),
                io.Combo.Input("library", options=libraries,
                               default="Default"),
                io.Combo.Input(
                    "collection", options=collections, default="None"),
                io.String.Input("tags", optional=True, default=""),
                io.Combo.Input("format", options=formats, default="mp4"),
                io.Combo.Input("codec", options=codecs, default="h264"),
                io.Boolean.Input("allow_duplicates", default=False,
                                 display_name="Allow Duplicates"),
                io.Boolean.Input("save_backup", default=False,
                                 display_name="Save to Comfy History"),
            ],
            outputs=[
                io.String.Output("embeddr_id"),
            ],
        )

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def execute(cls, video, caption=None, parent_ids=None, library="Default", collection="None", tags="", format="mp4", codec="h264", allow_duplicates=False, save_backup=False, **kwargs):
        uploaded_ids = []
        config = get_config()
        endpoint = config.get("endpoint", "http://localhost:8003")
        api_base_url = endpoint.rstrip("/") + "/api/v1"
        upload_url = f"{api_base_url}/images/upload"

        try:
            # Create temp file
            with tempfile.NamedTemporaryFile(suffix=f".{format}", delete=False) as tmp:
                temp_path = tmp.name

            # Save video using the video object's save_to method
            # We pass format and codec as strings.
            # If the underlying library requires specific Enum types, this might fail without them.
            # But often strings work or we can map them if we knew the library.
            video.save_to(temp_path, format=format, codec=codec)

            # Upload
            with open(temp_path, "rb") as f:
                files = {"file": (f"video.{format}", f, f"video/{format}")}
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
                    data["parent_ids"] = parent_ids

                response = requests.post(upload_url, files=files, data=data)
                response.raise_for_status()
                result = response.json()
                uploaded_id = result.get("id")
                uploaded_ids.append(str(uploaded_id))

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
            print(f"[Embeddr] Video upload failed: {e}")
            uploaded_ids.append("-1")
        finally:
            if 'temp_path' in locals() and os.path.exists(temp_path):
                os.remove(temp_path)

        return io.NodeOutput(",".join(uploaded_ids))
