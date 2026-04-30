"""
EmbeddrAction - Dynamic Lotus Action node for ComfyUI.

Introspects Lotus capabilities (kind=action) at execution time and
dispatches the selected action via the Embeddr REST API.

The frontend extension (ui/nodes/EmbeddrAction.ts) handles the
dynamic input/widget creation based on the selected action's schema.
"""

import contextlib
import json

import requests
from comfy_api.latest import io

from .types import EmbeddrArtifactID, EmbeddrArtifactIDObject
from .utils.config import get_auth_headers, get_embeddr_base_url


def _log(msg: str):
    print(f"[Embeddr Action] {msg}")


_DYN_PREFIX = "dyn_"


def _fetch_actions() -> list[dict]:
    """Fetch all exposed Lotus actions from the backend."""
    try:
        base_url = get_embeddr_base_url()
        resp = requests.get(
            f"{base_url}/api/v1/lotus/list",
            params={"kind": "action", "limit": 500},
            headers=get_auth_headers(),
            timeout=5,
        )
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("items", []) if isinstance(data, dict) else data
            # Only return actions that are exposed via lotus API
            exposed = []
            for cap in items:
                action = cap.get("action") or {}
                expose = action.get("expose") or {}
                # Include if exposed, or if no expose policy (lenient)
                if expose.get("lotus", True):
                    exposed.append(cap)
            return exposed
    except Exception as e:
        _log(f"Failed to fetch actions: {e}")
    return []


# ── Cache for capability schema lookup ──
_cap_cache: dict[str, dict] = {}
_cap_cache_ts: float = 0.0
_CAP_CACHE_TTL = 30.0


def _get_cap_schema(cap_id: str) -> dict | None:
    """Get the capability dict for a given cap_id, using a short-lived cache."""
    import time

    global _cap_cache, _cap_cache_ts

    now = time.time()
    if now - _cap_cache_ts > _CAP_CACHE_TTL:
        actions = _fetch_actions()
        _cap_cache = {a["id"]: a for a in actions if "id" in a}
        _cap_cache_ts = now

    return _cap_cache.get(cap_id)


def _get_input_schema_props(cap: dict) -> dict[str, dict]:
    """Extract the JSON Schema 'properties' from a capability's input schema."""
    action = cap.get("action") or cap.get("data", {})
    inp = action.get("input") or {}
    schema = inp.get("schema") or {}
    return schema.get("properties", {})


def _get_output_schema_props(cap: dict) -> dict[str, dict]:
    """Extract JSON Schema 'properties' for action output."""
    action = cap.get("action") or cap.get("data", {})
    out = action.get("output") or {}
    schema = out.get("schema") or {}
    return schema.get("properties", {})


def _pick_first_value(source: dict, keys: list[str]):
    for key in keys:
        if key in source and source.get(key) is not None:
            return source.get(key)
    return None


def _pick_first_value_deep(source, keys: list[str]):
    """Depth-first search through nested dict/list values for preferred keys."""
    if not isinstance(source, (dict, list)):
        return None

    stack = [source]
    seen_ids: set[int] = set()
    while stack:
        cur = stack.pop()
        cur_id = id(cur)
        if cur_id in seen_ids:
            continue
        seen_ids.add(cur_id)

        if isinstance(cur, dict):
            val = _pick_first_value(cur, keys)
            if val is not None:
                return val
            for v in cur.values():
                if isinstance(v, (dict, list)):
                    stack.append(v)
        elif isinstance(cur, list):
            for item in cur:
                if isinstance(item, (dict, list)):
                    stack.append(item)

    return None


def _build_action_choices() -> list[str]:
    """Build a list of action IDs for the combo dropdown."""
    actions = _fetch_actions()
    choices = ["(select action)"]
    for cap in actions:
        cap_id = cap.get("id", "")
        title = cap.get("title", cap_id)
        plugin = cap.get("plugin", "")
        label = f"{cap_id}"
        if title and title != cap_id:
            label = f"{cap_id} [{title}]"
        if plugin:
            label = f"{plugin}/{label}"
        choices.append(label)
    return choices


def _extract_cap_id(choice: str) -> str:
    """Extract the raw capability ID from a combo label.

    Labels look like:
      - "plugin/cap.id [Title]"
      - "plugin/cap.id"
      - "cap.id [Title]"
      - "cap.id"
    """
    if not choice or choice == "(select action)":
        return ""

    # Strip plugin prefix if present
    if "/" in choice:
        choice = choice.split("/", 1)[1]

    # Strip title suffix
    if " [" in choice:
        choice = choice.split(" [", 1)[0]

    return choice.strip()


class EmbeddrActionNode(io.ComfyNode):
    """
    Executes any Lotus action dynamically.

    The node exposes a combo dropdown populated with available actions
    and a JSON payload input.  The frontend extension adds typed widgets
    for each input declared by the selected action's schema; those values
    are merged into the payload at execution time.
    """

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="embeddr.Action",
            display_name="Embeddr Action",
            description=(
                "Execute any Lotus action. Select an action from the "
                "dropdown — input widgets are created automatically."
            ),
            category="Embeddr/Lotus",
            inputs=[
                # String input — the frontend extension converts this into
                # a combo widget populated with live Lotus actions.
                # We intentionally avoid io.Combo.Input because ComfyUI
                # validates combo values against the static options list
                # defined at schema time, which cannot include actions
                # discovered dynamically from the backend.
                io.String.Input(
                    "action_id",
                    default="",
                    tooltip="Select a Lotus action to execute (populated by frontend)",
                ),
                io.String.Input(
                    "payload_json",
                    default="{}",
                    multiline=True,
                    tooltip=(
                        "Additional JSON payload merged with widget inputs. "
                        "Widget values take precedence."
                    ),
                ),
                # Optional artifact input for actions that operate on artifacts
                EmbeddrArtifactID.Input(
                    "artifact_id",
                    optional=True,
                    tooltip="Artifact ID input (passed as 'artifact_id' in payload)",
                ),
                EmbeddrArtifactID.Input(
                    "artifact_ids",
                    optional=True,
                    tooltip="Multiple artifact IDs (passed as 'artifact_ids' in payload)",
                ),
            ],
            outputs=[
                io.String.Output(
                    "result_json",
                    tooltip="Full JSON response from the action",
                ),
                io.String.Output(
                    "status",
                    tooltip="'ok', 'error', or 'pending'",
                ),
                EmbeddrArtifactID.Output(
                    "output_artifact_ids",
                    tooltip="Artifact IDs extracted from the result (if any)",
                ),
                io.String.Output(
                    "text",
                    tooltip="Primary text content (caption, message, value, etc.)",
                ),
                io.String.Output(
                    "error",
                    tooltip="Error message (empty on success)",
                ),
            ],
        )

    @classmethod
    def execute(
        cls,
        action_id: str,
        payload_json: str = "{}",
        artifact_id: EmbeddrArtifactIDObject | None = None,
        artifact_ids: EmbeddrArtifactIDObject | None = None,
        **kwargs,
    ):
        cap_id = _extract_cap_id(action_id)
        if not cap_id:
            _log("No action selected")
            return io.NodeOutput(
                json.dumps({"error": "No action selected"}),
                "error",
                "",
                "",
                "No action selected",
            )

        # ── Build payload from payload_json ──
        # The frontend packs all dyn_* widget values into payload_json
        # before serialization (since ComfyUI only passes schema-declared
        # inputs to execute).
        try:
            payload = json.loads(payload_json) if payload_json.strip() else {}
        except json.JSONDecodeError as e:
            _log(f"Invalid payload JSON: {e}")
            payload = {}

        # Merge connected dynamic inputs (dyn_*) so graph-linked values
        # can drive action payload fields. These override payload_json.
        for key, val in (kwargs or {}).items():
            if not isinstance(key, str) or not key.startswith(_DYN_PREFIX):
                continue

            payload_key = key[len(_DYN_PREFIX) :]
            if not payload_key:
                continue

            runtime_val = val
            if isinstance(runtime_val, list) and len(runtime_val) == 1:
                runtime_val = runtime_val[0]

            if isinstance(runtime_val, EmbeddrArtifactIDObject):
                runtime_val = runtime_val.artifact_id

            if isinstance(runtime_val, str):
                trimmed = runtime_val.strip()
                if trimmed.startswith("{") or trimmed.startswith("["):
                    with contextlib.suppress(Exception):
                        runtime_val = json.loads(trimmed)

            if runtime_val is None:
                continue
            if isinstance(runtime_val, str) and runtime_val == "":
                continue

            payload[payload_key] = runtime_val

        # ── Schema-aware artifact_id mapping ──
        cap = _get_cap_schema(cap_id)
        schema_props = _get_input_schema_props(cap) if cap else {}
        has_resource_field = "resource" in schema_props

        # Extract connected artifact IDs
        raw_aid = None
        if artifact_id:
            raw_aid = (
                artifact_id.artifact_id
                if isinstance(artifact_id, EmbeddrArtifactIDObject)
                else artifact_id
            )

        raw_aids = None
        if artifact_ids:
            raw_aids = (
                artifact_ids.artifact_id
                if isinstance(artifact_ids, EmbeddrArtifactIDObject)
                else artifact_ids
            )
            if raw_aids and not isinstance(raw_aids, list):
                raw_aids = [raw_aids]

        if raw_aid or raw_aids:
            # Deduplicate
            seen: set[str] = set()
            unique_ids: list[str] = []
            for aid in (
                [raw_aid]
                if isinstance(raw_aid, str) and raw_aid
                else (raw_aid if isinstance(raw_aid, list) else [])
            ):
                if aid and aid not in seen:
                    seen.add(aid)
                    unique_ids.append(aid)
            for aid in raw_aids or []:
                if aid and aid not in seen:
                    seen.add(aid)
                    unique_ids.append(aid)

            if unique_ids:
                if has_resource_field and "resource" not in payload:
                    payload["resource"] = unique_ids[0] if len(unique_ids) == 1 else unique_ids
                else:
                    if "artifact_id" not in payload:
                        payload["artifact_id"] = unique_ids[0]
                    if len(unique_ids) > 1 and "artifact_ids" not in payload:
                        payload["artifact_ids"] = unique_ids

        # Dispatch the action
        base_url = get_embeddr_base_url()
        url = f"{base_url}/api/v1/lotus/{cap_id}"

        _log(f"Invoking action '{cap_id}' with payload: {json.dumps(payload, default=str)[:500]}")

        try:
            resp = requests.post(
                url,
                json=payload,
                headers={
                    **get_auth_headers(),
                    "Content-Type": "application/json",
                },
                timeout=120,
            )

            _log(f"Response: {resp.status_code}")

            if resp.status_code >= 400:
                error_text = resp.text[:500]
                _log(f"Action error: {error_text}")
                return io.NodeOutput(
                    json.dumps({"error": error_text, "status_code": resp.status_code}),
                    "error",
                    "",
                    "",
                    error_text,
                )

            result = (
                resp.json()
                if resp.headers.get("content-type", "").startswith("application/json")
                else {"raw": resp.text}
            )

            # ── Extract typed outputs from result ──
            output_ids = ""
            text_output = ""
            error_output = ""
            status_str = "ok"

            if isinstance(result, dict):
                outputs_obj = (
                    result.get("outputs") if isinstance(result.get("outputs"), dict) else {}
                )
                output_schema_props = _get_output_schema_props(cap) if cap else {}

                # Status
                if "status" in result:
                    status_str = str(result["status"])
                elif result.get("ok") is False:
                    status_str = "error"

                # Artifact IDs
                artifact_keys = [
                    key
                    for key in (
                        "artifact_id",
                        "id",
                        "artifact_ids",
                        "ids",
                        "output_artifact_id",
                    )
                    if (not output_schema_props) or key in output_schema_props
                ] or ["artifact_id", "id", "artifact_ids", "ids", "output_artifact_id"]
                artifact_val = _pick_first_value(outputs_obj, artifact_keys)
                if artifact_val is None:
                    artifact_val = _pick_first_value(result, artifact_keys)
                if artifact_val:
                    output_ids = (
                        artifact_val if isinstance(artifact_val, str) else json.dumps(artifact_val)
                    )

                # Primary text content (captions, messages, values, etc.)
                _TEXT_KEYS = (
                    "response_text",
                    "caption_text",
                    "caption",
                    "value",
                    "text",
                    "message",
                    "content",
                    "description",
                    "summary",
                    "output",
                    "answer",
                    "response",
                )
                text_keys = [
                    key
                    for key in _TEXT_KEYS
                    if (not output_schema_props) or key in output_schema_props
                ] or list(_TEXT_KEYS)
                text_val = _pick_first_value(outputs_obj, text_keys)
                if text_val is None:
                    text_val = _pick_first_value(result, text_keys)
                if text_val is None:
                    text_val = _pick_first_value_deep(outputs_obj, text_keys)
                if text_val is None:
                    text_val = _pick_first_value_deep(result, text_keys)
                if isinstance(text_val, str) and text_val.strip().lower() in {
                    "completed",
                    "queued",
                    "pending",
                    "ok",
                    "success",
                }:
                    better_val = _pick_first_value_deep(
                        outputs_obj,
                        [k for k in text_keys if k != "message"],
                    )
                    if better_val is None:
                        better_val = _pick_first_value_deep(
                            result,
                            [k for k in text_keys if k != "message"],
                        )
                    if better_val is not None:
                        text_val = better_val
                if text_val is not None:
                    text_output = str(text_val) if not isinstance(text_val, str) else text_val

                # Error
                if result.get("error"):
                    error_output = str(result["error"])
                elif isinstance(outputs_obj, dict) and outputs_obj.get("error"):
                    error_output = str(outputs_obj["error"])

            return io.NodeOutput(
                json.dumps(result, default=str),
                status_str,
                output_ids,
                text_output,
                error_output,
            )

        except requests.Timeout:
            _log(f"Action '{cap_id}' timed out")
            return io.NodeOutput(
                json.dumps({"error": "Request timed out (120s)"}),
                "error",
                "",
                "",
                "Request timed out (120s)",
            )
        except Exception as e:
            _log(f"Action '{cap_id}' failed: {e}")
            return io.NodeOutput(
                json.dumps({"error": str(e)}),
                "error",
                "",
                "",
                str(e),
            )
