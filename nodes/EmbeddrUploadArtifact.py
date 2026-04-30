import io as pyio
import json

import numpy as np
import requests
from comfy_api.latest import io, ui
from PIL import Image

from .EmbeddrUploadOptions import EmbeddrUploadArtifactOptions, EmbeddrUploadArtifactOptionsObject
from .types import EmbeddrArtifactID, EmbeddrArtifactIDObject
from .utils.config import get_auth_headers, get_embeddr_base_url, get_upload_mode
from .utils.ids import normalize_ids


def Embeddr_Log(message: str):
    print(f"[Embeddr] {message}")


def _has_auth_ticket(value) -> bool:
    if isinstance(value, (list, tuple)):
        value = value[0] if value else None
    if isinstance(value, dict):
        value = value.get("auth_ticket") or value.get("ticket")
    return bool(str(value).strip()) if value is not None else False


class EmbeddrUploadArtifactNode(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="embeddr.UploadArtifact",
            display_name="Embeddr Upload (V2)",
            category="Embeddr",
            is_output_node=True,
            inputs=[
                io.Image.Input("image"),
                EmbeddrArtifactID.Input(
                    "parent_ids", optional=True, tooltip="Parent artifact UUIDs"
                ),
                io.String.Input(
                    "auth_ticket",
                    default="",
                    tooltip="Ephemeral auth ticket for per-user ownership",
                    optional=True,
                ),
                EmbeddrUploadArtifactOptions.Input(
                    "options",
                    tooltip="Upload Artifact Options",
                    optional=True,
                    display_name="Options",
                ),
            ],
            outputs=[
                EmbeddrArtifactID.Output("artifact_ids"),
            ],
        )

    @classmethod
    def execute(
        cls,
        image,
        parent_ids: EmbeddrArtifactIDObject = None,
        auth_ticket: str = "",
        options: EmbeddrUploadArtifactOptionsObject = None,
    ) -> io.NodeOutput:
        base_url = get_embeddr_base_url()
        upload_mode = get_upload_mode()
        endpoint = f"{base_url}/api/v1/plugins/embeddr-comfyui/upload"

        # parent_ids could be handled by normalize_list directly
        normalized_parent_ids = normalize_ids(parent_ids)

        results = []

        if upload_mode in {"skip", "disabled", "off", "none"}:
            Embeddr_Log("Upload disabled (EMBEDDR_UPLOAD_MODE). Skipping Embeddr upload.")
            return io.NodeOutput(EmbeddrArtifactIDObject(artifact_id=""), ui=ui.PreviewImage(image))

        if upload_mode in {"best_effort", "auto"}:
            try:
                health_url = f"{base_url}/api/v1/system/routes"
                requests.get(health_url, timeout=2)
            except Exception as e:
                Embeddr_Log(f"Embeddr backend unavailable ({e}); skipping upload.")
                return io.NodeOutput(
                    EmbeddrArtifactIDObject(artifact_id=""), ui=ui.PreviewImage(image)
                )

        # 'image' input is a batch tensor [B, H, W, C]
        for batch_idx, img_tensor in enumerate(image):
            try:
                # Convert tensor to PIL
                i = 255.0 * img_tensor.cpu().numpy()
                img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))

                # Save to buffer
                img_byte_arr = pyio.BytesIO()
                img.save(img_byte_arr, format="PNG")
                img_byte_arr.seek(0)
                Embeddr_Log(f"""
                            Uploading artifact batch {batch_idx}...
                            Storage Provider: {options.storage_provider if options else "default"}
                            Storage Path: {options.storage_path if options else "default"}
                            Tags: {options.tags if options else "none"}
                            Related Artifacts: {options.related_artifact_ids if options else "none"}
                            Parent IDs: {normalized_parent_ids}
                            Auth Ticket: {"present" if _has_auth_ticket(auth_ticket) else "absent"}
                            """)

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
                    str(storage_path).strip()
                    if storage_path not in (None, "", "__default__")
                    else None
                )

                # Prepare Metadata
                meta = {
                    "parent_ids": normalized_parent_ids,
                    "collection_ids": normalize_ids(options.related_artifact_ids)
                    if options
                    else [],
                    "tags": normalize_ids(options.tags) if options else [],
                    "trigger_automation": options.trigger_ingest if options else True,
                    "compute_embedding": options.trigger_ingest
                    if options
                    else True,  # Legacy Compat
                    "batch_index": batch_idx,
                    "confirm": True,
                }

                if storage_provider:
                    meta["storage_provider"] = storage_provider
                    meta["storage_backend"] = storage_provider
                if storage_path:
                    meta["storage_path"] = storage_path

                if storage_provider or storage_path:
                    Embeddr_Log(
                        f"Upload storage overrides: provider={storage_provider or 'default'} path={storage_path or 'default'}"
                    )

                # Prepare multipart upload
                files = {"file": (f"image_{batch_idx}.png", img_byte_arr, "image/png")}
                data = {"metadata": json.dumps(meta)}

                # Post to Embeddr Core Plugin
                response = requests.post(
                    endpoint,
                    files=files,
                    data=data,
                    headers=get_auth_headers(auth_ticket=auth_ticket),
                )
                response.raise_for_status()
                res_json = response.json()

                art_id = res_json.get("id")
                results.append(str(art_id))
                Embeddr_Log(f"Uploaded Artifact: {art_id}")

            except requests.HTTPError as e:
                body = ""
                try:
                    body = e.response.text[:500] if e.response is not None else ""
                except Exception:
                    body = ""
                suffix = f" body={body}" if body else ""
                Embeddr_Log(f"Upload failed for batch {batch_idx}: {e}{suffix}")
            except Exception as e:
                Embeddr_Log(f"Upload failed for batch {batch_idx}: {e}")
                # We don't crash the whole node, but result might be partial

        result_str = ",".join(results)
        result_obj = EmbeddrArtifactIDObject(artifact_id=result_str)

        # Return IDs and UI Preview
        return io.NodeOutput(result_obj, ui=ui.PreviewImage(image))
