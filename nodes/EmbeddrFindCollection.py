import requests
from comfy_api.latest import io

from .utils.config import get_auth_headers, get_config


def Embeddr_Log(message: str):
    print(f"[Embeddr] {message}")


class EmbeddrFindCollectionNode(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="embeddr.FindCollection",
            display_name="Embeddr Find Collection",
            category="Embeddr",
            inputs=[
                io.String.Input(
                    "collection_name",
                    default="",
                    optional=True,
                    tooltip="Name to find (or create if missing)",
                ),
                io.String.Input(
                    "collection_id", default="", tooltip="Direct Collection ID (overrides Name)"
                ),
                io.Boolean.Input(
                    "create_if_missing",
                    default=True,
                    tooltip="Create collection if it doesn't exist (Only applies to Name)",
                ),
            ],
            outputs=[
                io.String.Output("collection_id"),
            ],
        )

    @classmethod
    def execute(cls, collection_name, create_if_missing, collection_id=""):
        Embeddr_Log(
            f"EXECUTE FindCollection: name='{collection_name}', id='{collection_id}', create={create_if_missing}"
        )
        config = get_config()
        base_url = config.get("embeddr_url") or config.get("endpoint") or "http://localhost:8003"
        base_url = base_url.rstrip("/")

        # 1. Direct ID Priority
        if collection_id and len(str(collection_id).strip()) > 10:
            Embeddr_Log(f"Using Direct Collection ID: {collection_id}")
            # Assume valid UUID if present
            return io.NodeOutput(collection_id)

        try:
            # 2. List Collections to Find by Name
            # Note: Removed limit=1000 to avoid potential 422 if API doesn't support it
            resp = requests.get(f"{base_url}/api/v1/collections", headers=get_auth_headers())
            # If 404, maybe endpoint is different.
            if resp.status_code == 404:
                # Fallback to V1? Or just fail.
                pass

            collections = []
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list):
                    collections = data
                elif isinstance(data, dict) and "items" in data:
                    collections = data["items"]

            found = None
            if collection_name:
                for c in collections:
                    # Case insensitive match? user might prefer exact.
                    # API returns 'label' usually, but maybe 'name' in some versions
                    label = c.get("label") or c.get("name")
                    if label and label.lower() == collection_name.lower():
                        found = c
                        break

            if found:
                Embeddr_Log(
                    f"Found Collection: {found.get('label', 'Unnamed')} ({found.get('id')})"
                )
                return io.NodeOutput(str(found.get("id")))

            if collection_name and create_if_missing:
                # Create
                payload = {
                    "label": collection_name,
                    "type_name": "collection:mix",
                    "uri": f"embeddr:///collections/{collection_name.lower().replace(' ', '_')}",
                }
                resp = requests.post(
                    f"{base_url}/api/v1/collections", json=payload, headers=get_auth_headers()
                )
                resp.raise_for_status()
                new_col = resp.json()
                Embeddr_Log(f"Created Collection: {new_col.get('label')} ({new_col.get('id')})")
                return io.NodeOutput(str(new_col.get("id")))

            Embeddr_Log(f"Collection '{collection_name}' not found and creation disabled.")
            # Fallback to empty string
            return io.NodeOutput("")

        except Exception as e:
            Embeddr_Log(f"FindCollection error: {e}")
            return io.NodeOutput("")
