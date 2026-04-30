from comfy_api.latest import io

from .types import EmbeddrArtifactID, EmbeddrArtifactIDObject
from .utils.ids import normalize_ids


class EmbeddrSplitIDsNode(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="embeddr.SplitIDs",
            display_name="Embeddr Split IDs",
            description="Splits a comma-separated list of Artifact IDs into individual items for batch processing.",
            category="Embeddr",
            inputs=[
                EmbeddrArtifactID.Input(
                    "artifact_ids", tooltip="Comma-separated IDs or list of IDs"
                ),
            ],
            outputs=[
                EmbeddrArtifactID.Output(
                    "split_ids", tooltip="Individual IDs (List Execution)", is_output_list=True
                ),
            ],
        )

    @classmethod
    def execute(cls, artifact_ids):
        # Normalize to list of ID strings
        final_ids = normalize_ids(artifact_ids)

        # Return a LIST of objects. ComfyUI will iterate this list for downstream nodes if they support it.
        results = [EmbeddrArtifactIDObject(artifact_id=fid) for fid in final_ids]

        return io.NodeOutput(results)
