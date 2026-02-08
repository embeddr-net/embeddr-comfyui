from comfy_api.latest import io
from .types import EmbeddrArtifactInfo, EmbeddrArtifactID, EmbeddrArtifactIDObject


class EmbeddrExtractArtifactInfoNode(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="embeddr.ExtractArtifactInfo",
            display_name="Embeddr Extract Artifact Info (V2)",
            description="Extracts specific metadata fields from an Artifact Info object.",
            category="Embeddr",
            inputs=[
                EmbeddrArtifactInfo.Input(
                    "artifact_info", tooltip="Artifact Info object from Load Artifact"),
            ],
            outputs=[
                EmbeddrArtifactID.Output(
                    "parent_ids", tooltip="List of parent Artifact IDs"),
                # EmbeddrArtifactID.Output("collection_ids", tooltip="List of collection IDs"),
                io.String.Output("tags", tooltip="Comma-separated tags"),
                io.String.Output(
                    "all_json", tooltip="Full JSON dump of the artifact metadata"),
            ],
        )

    @classmethod
    def execute(cls, artifact_info):
        if not artifact_info:
            return io.NodeOutput(EmbeddrArtifactIDObject(artifact_id=""), "", "{}")

        data = artifact_info.data

        # Parse Parents (from relations or metadata)
        # Note: API usually returns `parents` relation list in `relations` key or similar depending on implementation
        # For now, let's assume standard Artifact response structure.
        # If the API doesn't return relations inline, we might need to rely on metadata_json['parent_ids']

        parents = []

        # Helper to safely dig into dicts
        def get_parents_from_dict(d):
            if not isinstance(d, dict):
                return []
            res = []
            # Check direct key
            if "parent_ids" in d:
                val = d["parent_ids"]
                if isinstance(val, list):
                    res.extend([str(v) for v in val])
                elif isinstance(val, str):
                    res.extend([v.strip() for v in val.split(",")])

            # Check comfy_meta subkey
            if "comfy_meta" in d:
                res.extend(get_parents_from_dict(d["comfy_meta"]))

            return res

        # 1. Try Top Level
        parents.extend(get_parents_from_dict(data))

        # 2. Try metadata_json (if distinct from data root)
        meta = data.get("metadata_json")
        if meta and isinstance(meta, dict):
            parents.extend(get_parents_from_dict(meta))

        # Dedup
        parents = list(set(parents))
        parent_str = ",".join(parents)

        # Tags (often in relations or separate 'tags' key)
        tags = []
        if "tags" in data:
            # If tags are objects
            if isinstance(data["tags"], list):
                for t in data["tags"]:
                    if isinstance(t, dict):
                        tags.append(t.get("label", ""))
                    else:
                        tags.append(str(t))
        elif "tags" in meta:
            tags = meta["tags"]

        tags_str = ",".join(tags)

        import json
        json_str = json.dumps(data, indent=2)

        return io.NodeOutput(
            EmbeddrArtifactIDObject(artifact_id=parent_str),
            tags_str,
            json_str
        )
