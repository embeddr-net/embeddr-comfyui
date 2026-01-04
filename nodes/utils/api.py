import requests
from .config import get_config


def get_libraries():
    try:
        config = get_config()
        endpoint = config.get("endpoint", "http://localhost:8003")
        api_url = endpoint.rstrip("/") + "/api/v1/libraries"
        response = requests.get(api_url)
        if response.status_code == 200:
            data = response.json()
            # Return list of names, but we might need IDs.
            # ComfyUI Combo inputs usually take a list of strings.
            # We can format as "Name (ID)" or just names if unique.
            # Let's return a list of strings formatted as "ID: Name" for easy parsing
            return [f"{lib['id']}: {lib['name']}" for lib in data]
    except Exception as e:
        print(f"[Embeddr] Failed to fetch libraries: {e}")
    return []


def get_collections():
    try:
        config = get_config()
        endpoint = config.get("endpoint", "http://localhost:8003")
        api_url = endpoint.rstrip("/") + "/api/v1/collections"
        response = requests.get(api_url)
        if response.status_code == 200:
            data = response.json()
            return [f"{col['id']}: {col['name']}" for col in data]
    except Exception as e:
        print(f"[Embeddr] Failed to fetch collections: {e}")
    return []
