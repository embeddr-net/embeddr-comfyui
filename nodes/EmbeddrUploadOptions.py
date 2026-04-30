from comfy_api.latest import io

from .types import EmbeddrUploadArtifactOptions, EmbeddrUploadArtifactOptionsObject


class UploadArtifactOptionsNode(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="embeddr.UploadArtifact.Options",
            display_name="Upload Artifact Options",
            category="Embeddr",
            inputs=[
                io.String.Input(
                    "storage_provider",
                    tooltip="Override default storage provider for the artifact",
                    default=None,
                ),
                io.String.Input(
                    "storage_path",
                    tooltip="Override default storage path for the artifact",
                    default=None,
                ),
                io.Boolean.Input(
                    "trigger_ingest",
                    default=True,
                    tooltip="Trigger ingest process after upload",
                    display_name="Trigger Ingest",
                ),
                io.String.Input(
                    "tags",
                    default=[],
                    tooltip="Tags to associate with the uploaded artifact",
                    display_name="Tags",
                ),
                io.String.Input(
                    "related_artifact_ids",
                    default=[],
                    tooltip="IDs of related artifacts",
                    display_name="Related Artifact IDs",
                ),
                # io.Combo.Input(
                #     "scale_mode", options=[e.value for e in ResizeModeEnum], default="contain",
                #     tooltip="Choose how images are scaled to fit the target size", display_name="Scale Mode"),
            ],
            outputs=[
                EmbeddrUploadArtifactOptions.Output(
                    "options", tooltip="Upload Artifact Options Object", display_name="options"
                ),
            ],
        )

    @classmethod
    def execute(cls, storage_provider, storage_path, trigger_ingest, tags, related_artifact_ids):
        options = EmbeddrUploadArtifactOptionsObject(
            storage_provider=storage_provider,
            storage_path=storage_path,
            trigger_ingest=trigger_ingest,
            tags=tags,
            related_artifact_ids=related_artifact_ids,
        )

        return io.NodeOutput(options)
