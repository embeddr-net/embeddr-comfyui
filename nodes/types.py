from comfy_api.latest._io import ComfyTypeIO, comfytype


## Base Artifact ID Type##
@comfytype(io_type="EMBEDDR_ARTIFACT_ID")
class EmbeddrArtifactID(ComfyTypeIO):
    Type = str | list[str]


class EmbeddrArtifactIDObject:
    def __init__(self, artifact_id: str | list[str]):
        self.artifact_id: str | list[str] = artifact_id


## Upload Artifact Options Type ##
@comfytype(io_type="EMBEDDR_UPLOADARTIFACT_OPTS")
class EmbeddrUploadArtifactOptions(ComfyTypeIO):
    Type = object


class EmbeddrUploadArtifactOptionsObject:
    def __init__(
        self,
        storage_provider=None,
        storage_path=None,
        trigger_ingest=True,
        tags=None,
        related_artifact_ids=None,
    ):
        self.storage_provider: str | None = storage_provider
        self.storage_path: str | None = storage_path
        self.trigger_ingest: bool = trigger_ingest
        self.tags: list[str] | None = tags
        self.related_artifact_ids: list[str] | None = related_artifact_ids


## Artifact Info Type ##
@comfytype(io_type="EMBEDDR_ARTIFACT_INFO")
class EmbeddrArtifactInfo(ComfyTypeIO):
    Type = dict


class EmbeddrArtifactInfoObject:
    def __init__(self, data: dict):
        self.data = data
        self.id = data.get("id")
        self.uri = data.get("uri")
        self.type_name = data.get("type_name")
        self.metadata = data.get("metadata_json") or {}
