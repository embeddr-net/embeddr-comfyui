from comfy_api.latest import io

from .types import EmbeddrArtifactID


class EmbeddrMergeIDsNode(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        # Inputs are handled dynamically by JS
        return io.Schema(
            node_id="embeddr.MergeIDs",
            display_name="Embeddr Merge IDs",
            description="Merges multiple Embeddr Image IDs into a list for lineage tracking.",
            category="Embeddr",
            inputs=[],
            outputs=[
                EmbeddrArtifactID.Output(
                    "artifact_ids",
                    tooltip="List of merged Artifact IDs",
                    display_name="artifact_ids",
                ),
            ],
        )

    @classmethod
    def execute(cls, **kwargs):
        ids = []
        # Iterate through all possible inputs
        for key, value in kwargs.items():
            if key.startswith("artifact_") and value:
                ids.append(value)

        # Return as list of strings
        return io.NodeOutput(ids)
