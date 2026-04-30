import json
import os
import tempfile

import requests
from comfy_api.latest import io

from .EmbeddrUploadOptions import EmbeddrUploadArtifactOptions, EmbeddrUploadArtifactOptionsObject
from .types import EmbeddrArtifactID, EmbeddrArtifactIDObject
from .utils.config import get_auth_headers, get_embeddr_base_url, get_upload_mode
from .utils.ids import normalize_ids


class EmbeddrUploadVideo(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
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
                EmbeddrArtifactID.Input(
                    "parent_ids", optional=True, tooltip="Parent artifact UUIDs"
                ),
                EmbeddrUploadArtifactOptions.Input(
                    "options",
                    tooltip="Upload Artifact Options",
                    optional=True,
                    display_name="Options",
                ),
                io.Combo.Input("format", options=formats, default="mp4"),
                io.Combo.Input("codec", options=codecs, default="h264"),
            ],
            outputs=[
                EmbeddrArtifactID.Output("artifact_ids"),
            ],
        )

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def execute(
        cls,
        video,
        caption=None,
        parent_ids: EmbeddrArtifactIDObject = None,
        options: EmbeddrUploadArtifactOptionsObject = None,
        format="mp4",
        codec="h264",
        **kwargs,
    ):
        uploaded_ids = []
        base_url = get_embeddr_base_url()
        upload_mode = get_upload_mode()
        upload_url = f"{base_url}/api/v1/plugins/embeddr-comfyui/upload"

        normalized_parent_ids = normalize_ids(parent_ids)

        if upload_mode in {"skip", "disabled", "off", "none"}:
            print("[Embeddr] Upload disabled (EMBEDDR_UPLOAD_MODE). Skipping Embeddr upload.")
            return io.NodeOutput(EmbeddrArtifactIDObject(artifact_id=""))

        if upload_mode in {"best_effort", "auto"}:
            try:
                health_url = f"{base_url}/api/v1/system/routes"
                requests.get(health_url, timeout=2)
            except Exception as e:
                print(f"[Embeddr] Embeddr backend unavailable ({e}); skipping upload.")
                return io.NodeOutput(EmbeddrArtifactIDObject(artifact_id=""))

        try:
            # Create temp file
            with tempfile.NamedTemporaryFile(suffix=f".{format}", delete=False) as tmp:
                temp_path = tmp.name

            # Save video using the video object's save_to method
            # We pass format and codec as strings.
            # If the underlying library requires specific Enum types, this might fail without them.
            # But often strings work or we can map them if we knew the library.
            video.save_to(temp_path, format=format, codec=codec)

            storage_provider = None
            storage_path = None
            if options:
                if isinstance(options, dict):
                    storage_provider = options.get("storage_provider")
                    storage_path = options.get("storage_path")
                else:
                    storage_provider = getattr(options, "storage_provider", None)
                    storage_path = getattr(options, "storage_path", None)

            storage_provider = (
                str(storage_provider).strip().lower()
                if storage_provider not in (None, "", "__default__")
                else None
            )
            storage_path = (
                str(storage_path).strip() if storage_path not in (None, "", "__default__") else None
            )

            meta = {
                "parent_ids": normalized_parent_ids,
                "collection_ids": normalize_ids(options.related_artifact_ids) if options else [],
                "tags": normalize_ids(options.tags) if options else [],
                "trigger_automation": options.trigger_ingest if options else True,
                "compute_embedding": options.trigger_ingest if options else True,
                "caption": caption or "",
                "confirm": True,
            }

            if storage_provider:
                meta["storage_provider"] = storage_provider
                meta["storage_backend"] = storage_provider
            if storage_path:
                meta["storage_path"] = storage_path

            with open(temp_path, "rb") as f:
                files = {"file": (f"video.{format}", f, f"video/{format}")}
                data = {"metadata": json.dumps(meta)}

                response = requests.post(
                    upload_url,
                    files=files,
                    data=data,
                    headers=get_auth_headers(),
                )
                response.raise_for_status()
                result = response.json()
                uploaded_id = result.get("id")
                uploaded_ids.append(str(uploaded_id))

        except Exception as e:
            print(f"[Embeddr] Video upload failed: {e}")
            uploaded_ids.append("-1")
        finally:
            if "temp_path" in locals() and os.path.exists(temp_path):
                os.remove(temp_path)

        result_str = ",".join(uploaded_ids)
        return io.NodeOutput(EmbeddrArtifactIDObject(artifact_id=result_str))
