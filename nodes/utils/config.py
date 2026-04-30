import json
import os


def _normalize_base_url(url: str | None, default: str) -> str:
    if not url:
        return default

    clean = str(url).strip().rstrip("/")

    # Strip API suffixes to get the root base
    if clean.endswith("/api/v1") or clean.endswith("/api/v1"):
        clean = clean[:-7]
    elif clean.endswith("/api"):
        clean = clean[:-4]

    # Add scheme if missing
    if "://" not in clean:
        clean = f"http://{clean}"

    return clean.rstrip("/")


def get_config():
    try:
        # Go up 3 levels: utils -> nodes -> embeddr-comfyui
        base_path = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        config_path = os.path.join(base_path, "config.json")
        if os.path.exists(config_path):
            return json.load(open(config_path))
    except Exception:
        pass
    return {}


def get_embeddr_base_url(default: str = "http://localhost:8003") -> str:
    cfg = get_config()
    env_url = (
        os.environ.get("EMBEDDR_BACKEND_URL")
        or os.environ.get("EMBEDDR_URL")
        or os.environ.get("EMBEDDR_ENDPOINT")
    )
    cfg_url = cfg.get("embeddr_url") or cfg.get("backend_url") or cfg.get("endpoint")

    return _normalize_base_url(cfg_url or env_url, default)


def get_api_key() -> str | None:
    cfg = get_config()
    return (
        os.environ.get("EMBEDDR_API_KEY")
        or os.environ.get("EMBEDDR_KEY")
        or cfg.get("api_key")
        or cfg.get("key")
    )


def get_auth_headers(auth_ticket: str | None = None) -> dict[str, str]:
    headers: dict[str, str] = {}

    ticket_value = auth_ticket
    if isinstance(ticket_value, (list, tuple)):
        ticket_value = ticket_value[0] if ticket_value else None
    if isinstance(ticket_value, dict):
        ticket_value = ticket_value.get("auth_ticket") or ticket_value.get("ticket")

    if ticket_value is not None:
        ticket_text = str(ticket_value).strip()
        if ticket_text:
            headers["X-Embeddr-Ticket"] = ticket_text

    key = get_api_key()
    if key:
        headers["X-API-Key"] = key

    return headers


def get_upload_mode(default: str = "require") -> str:
    cfg = get_config()
    env_mode = os.environ.get("EMBEDDR_UPLOAD_MODE")
    cfg_mode = cfg.get("upload_mode")
    mode = (env_mode or cfg_mode or default or "require").strip().lower()
    return mode
