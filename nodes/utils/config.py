import os
import json


def get_config():
    try:
        # Go up 3 levels: utils -> nodes -> embeddr-comfyui
        base_path = os.path.dirname(os.path.dirname(
            os.path.dirname(__file__)))
        config_path = os.path.join(base_path, "config.json")
        if os.path.exists(config_path):
            return json.load(open(config_path, "r"))
    except Exception:
        pass
    return {}
