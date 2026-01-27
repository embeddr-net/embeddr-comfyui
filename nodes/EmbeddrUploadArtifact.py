import requests
import numpy as np
from PIL import Image
import io as pyio
import json
from comfy_api.latest import io, ui
from .utils import get_embeddr_base_url, get_upload_mode


def Embeddr_Log(message: str):
    print(f"[Embeddr] {message}")


def normalize_list(value):
    if not value:
        return []

    if isinstance(value, str):
        items = [v.strip() for v in value.split(",")]
    elif isinstance(value, list):
        items = [str(v).strip() for v in value]
    else:
        raise TypeError(f"Unsupported type: {type(value)}")

    out = []
    seen = set()
    for v in items:
        if not v:
            continue
        lv = v.lower()
        if lv in ("none", "null", "undefined"):
            continue
        if v not in seen:
            seen.add(v)
            out.append(v)
    return out


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
                io.String.Input("parent_ids", default="", optional=True,
                                tooltip="Comma separated parent artifact UUIDs"),
                io.String.Input("collection_ids", default="", optional=True,
                                tooltip="Comma separated Collection UUIDs (for grouping)"),
                io.String.Input("tags", default="generated,comfyui",
                                tooltip="Comma separated tags"),
                io.Boolean.Input("trigger_automation", default=True,
                                 tooltip="Trigger Auto-Analysis (Thumbnails, Embeddings, etc)"),
            ],
            outputs=[
                io.String.Output("artifact_ids"),
            ]
        )

    @classmethod
    def execute(cls, image, parent_ids, collection_ids, tags, trigger_automation):
        base_url = get_embeddr_base_url()
        upload_mode = get_upload_mode()
        endpoint = f"{base_url}/api/v2/plugins/embeddr-comfyui/upload"

        results = []

        if upload_mode in {"skip", "disabled", "off", "none"}:
            Embeddr_Log(
                "Upload disabled (EMBEDDR_UPLOAD_MODE). Skipping Embeddr upload."
            )
            return io.NodeOutput("", ui=ui.PreviewImage(image))

        if upload_mode in {"best_effort", "auto"}:
            try:
                health_url = f"{base_url}/api/v2/system/routes"
                requests.get(health_url, timeout=2)
            except Exception as e:
                Embeddr_Log(
                    f"Embeddr backend unavailable ({e}); skipping upload."
                )
                return io.NodeOutput("", ui=ui.PreviewImage(image))

        # 'image' input is a batch tensor [B, H, W, C]
        for batch_idx, img_tensor in enumerate(image):
            try:
                # Convert tensor to PIL
                i = 255. * img_tensor.cpu().numpy()
                img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))

                # Save to buffer
                img_byte_arr = pyio.BytesIO()
                img.save(img_byte_arr, format='PNG')
                img_byte_arr.seek(0)

                # Prepare Metadata
                meta = {
                    "parent_ids": normalize_list(parent_ids),
                    "collection_ids": normalize_list(collection_ids),
                    "tags": normalize_list(tags),
                    "trigger_automation": trigger_automation,
                    "compute_embedding": trigger_automation,  # Legacy Compat
                    "batch_index": batch_idx,
                    "confirm": True
                }

                # Prepare multipart upload
                files = {'file': (f'image_{batch_idx}.png',
                                  img_byte_arr, 'image/png')}
                data = {'metadata': json.dumps(meta)}

                # Post to Embeddr Core Plugin
                response = requests.post(endpoint, files=files, data=data)
                response.raise_for_status()
                res_json = response.json()

                art_id = res_json.get("id")
                results.append(str(art_id))
                Embeddr_Log(f"Uploaded Artifact: {art_id}")

            except Exception as e:
                Embeddr_Log(f"Upload failed for batch {batch_idx}: {e}")
                # We don't crash the whole node, but result might be partial

        result_str = ",".join(results)

        # Return IDs and UI Preview
        return io.NodeOutput(result_str, ui=ui.PreviewImage(image))
