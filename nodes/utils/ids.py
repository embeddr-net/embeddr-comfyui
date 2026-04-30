def normalize_ids(value) -> list[str]:
    """
    Normalizes a variety of input types (single string, list of strings,
    comma-separated strings, EmbeddrArtifactIDObjects) into a clean list of string IDs.
    """
    if not value:
        return []

    # Helper to extract string from potential ID objects
    def extract_val(x):
        if hasattr(x, "artifact_id"):
            # artifact_id can be str or list
            val = x.artifact_id
            if isinstance(val, list):
                return ",".join(str(v) for v in val)
            return str(val)
        return str(x)

    # Initial collection of strings
    raw_strings = []
    if isinstance(value, str):
        raw_strings = [value]
    elif isinstance(value, list):
        raw_strings = [extract_val(v) for v in value]
    elif hasattr(value, "artifact_id"):
        raw_strings = [extract_val(value)]
    else:
        # Fallback for other single types
        raw_strings = [str(value)]

    # Flatten by splitting commas and cleaning
    out = []
    seen = set()
    for s in raw_strings:
        parts = s.split(",")
        for p in parts:
            clean_p = p.strip()
            if not clean_p:
                continue
            if clean_p.lower() in ("none", "null", "undefined"):
                continue

            if clean_p not in seen:
                seen.add(clean_p)
                out.append(clean_p)
    return out
