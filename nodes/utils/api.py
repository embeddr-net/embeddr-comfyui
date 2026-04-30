import requests

from .config import get_auth_headers, get_embeddr_base_url


def _fetch_collection_options(category: str | None = None) -> list[str]:
    try:
        base_url = get_embeddr_base_url().rstrip("/")
        api_url = f"{base_url}/api/v1/collections"
        params = {"category": category} if category else None
        response = requests.get(api_url, params=params, headers=get_auth_headers())
        response.raise_for_status()

        data = response.json()
        items = data if isinstance(data, list) else data.get("items") or []
        out: list[str] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            item_id = str(item.get("id") or "").strip()
            label = str(item.get("label") or item.get("name") or "").strip()
            if not item_id or not label:
                continue
            out.append(f"{item_id}: {label}")
        return out
    except Exception as exc:
        print(f"[Embeddr] Failed to fetch collections(category={category}): {exc}")
        return []


def get_libraries():
    return _fetch_collection_options("library")


def get_collections():
    return _fetch_collection_options()
