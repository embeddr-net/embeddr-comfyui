/**
 * EmbeddrAction – Frontend extension for dynamic Lotus Action input management.
 *
 * When the user selects an action from the combo, this extension:
 *   1. Fetches the action's capability schema (inputs/outputs)
 *   2. Removes any previously-created dynamic widgets
 *   3. Creates typed widgets for each declared input
 *   4. Before serialization, packs all dyn_* values into payload_json
 *      (because ComfyUI only passes schema-declared inputs to execute)
 *
 * Input sources (checked in order):
 *   - cap.inputs[]            → explicit LotusIOType array
 *   - cap.action.input.schema → JSON Schema from Pydantic model
 *   - cap.data.input.schema   → fallback path
 *
 * Dynamic widget names are prefixed with "dyn_" so the Python node
 * knows they came from schema introspection.
 */

// @ts-ignore
import { app } from "../../../scripts/app.js";

const NODE_ID = "embeddr.Action";
const DYN_PREFIX = "dyn_";

function ensureDynInput(node: any, name: string, type = "*") {
  if (node.inputs?.some((i: any) => i.name === name)) return;
  node.addInput(name, type);
}

/**
 * Fields already handled by the node's static inputs
 * (artifact_id / artifact_ids connections). The Python node
 * maps these into the correct schema field (e.g. "resource").
 * We skip creating dyn_ widgets for them.
 */
const SKIP_SCHEMA_FIELDS = new Set(["resource", "artifact_id", "artifact_ids"]);

/* ────────────────────────────────────────────────────────── */
/*  Sync dyn_ widget values ↔ payload_json                   */
/* ────────────────────────────────────────────────────────── */

/**
 * Collect all dyn_* widget values and merge them into the
 * payload_json widget. Called before serialization so that
 * the Python execute() receives them via the declared
 * payload_json input.
 */
function syncDynToPayload(node: any) {
  const payloadWidget = (node.widgets ?? []).find((w: any) => w.name === "payload_json");
  if (!payloadWidget) return;

  // Parse existing payload_json (user may have typed extra values)
  let base: Record<string, any> = {};
  try {
    base = JSON.parse(payloadWidget.value || "{}");
  } catch {
    base = {};
  }

  // Collect dyn_ widget values
  for (const w of node.widgets ?? []) {
    if (!w.name?.startsWith(DYN_PREFIX)) continue;
    const key = w.name.slice(DYN_PREFIX.length);
    let val = w.value;

    // Try to parse JSON strings for complex types
    if (typeof val === "string" && val.trim().length > 0) {
      const trimmed = val.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          val = JSON.parse(trimmed);
        } catch {
          /* keep as string */
        }
      }
    }

    // Skip empty strings — don't override model defaults with blanks
    if (val === "" || val === undefined || val === null) continue;

    base[key] = val;
  }

  payloadWidget.value = JSON.stringify(base, null, 2);
}

/**
 * After creating dynamic widgets (e.g. loading a saved workflow),
 * restore their values from payload_json.
 */
function syncPayloadToDyn(node: any) {
  const payloadWidget = (node.widgets ?? []).find((w: any) => w.name === "payload_json");
  if (!payloadWidget) return;

  let values: Record<string, any> = {};
  try {
    values = JSON.parse(payloadWidget.value || "{}");
  } catch {
    return;
  }

  for (const w of node.widgets ?? []) {
    if (!w.name?.startsWith(DYN_PREFIX)) continue;
    const key = w.name.slice(DYN_PREFIX.length);
    if (key in values) {
      const val = values[key];
      if (typeof val === "object" && val !== null) {
        w.value = JSON.stringify(val);
      } else {
        w.value = val;
      }
    }
  }

  if (node.graph) node.graph.setDirtyCanvas(true);
}

/* ────────────────────────────────────────────────────────── */
/* JSON Schema type → widget factory                         */
/* ────────────────────────────────────────────────────────── */

function addWidgetForJsonSchemaProp(
  node: any,
  name: string,
  prop: Record<string, any>,
  _required: boolean,
) {
  const wName = `${DYN_PREFIX}${name}`;

  if (
    node.widgets?.some((w: any) => w.name === wName) ||
    node.inputs?.some((i: any) => i.name === wName)
  )
    return;

  // Resolve type (handle anyOf / allOf / oneOf)
  let type = prop.type as string | undefined;
  if (!type && prop.anyOf) {
    const nonNull = (prop.anyOf as Array<any>).find((s: any) => s.type && s.type !== "null");
    if (nonNull) type = nonNull.type;
  }

  const defaultVal = prop.default;
  const tooltip = prop.description || name;

  if (type === "string") ensureDynInput(node, wName, "STRING");
  else if (type === "integer" || type === "number") ensureDynInput(node, wName, "NUMBER");
  else if (type === "boolean") ensureDynInput(node, wName, "BOOLEAN");
  else ensureDynInput(node, wName, "*");

  switch (type) {
    case "string": {
      if (prop.enum && Array.isArray(prop.enum)) {
        node.addWidget("combo", wName, defaultVal ?? prop.enum[0], () => {}, {
          values: prop.enum,
          tooltip,
        });
      } else {
        const isLong =
          (prop.maxLength && prop.maxLength > 200) || name === "prompt" || name.includes("json");
        node.addWidget("text", wName, defaultVal ?? "", () => {}, {
          multiline: isLong,
          tooltip,
        });
      }
      break;
    }
    case "integer":
    case "number":
      node.addWidget("number", wName, defaultVal ?? 0, () => {}, {
        min: prop.minimum ?? prop.exclusiveMinimum ?? -Infinity,
        max: prop.maximum ?? prop.exclusiveMaximum ?? Infinity,
        step: prop.multipleOf ?? (type === "integer" ? 1 : 0.1),
        precision: type === "integer" ? 0 : 2,
        tooltip,
      });
      break;
    case "boolean":
      node.addWidget("toggle", wName, defaultVal ?? false, () => {}, {
        tooltip,
      });
      break;
    case "array":
    case "object":
      node.addWidget(
        "text",
        wName,
        defaultVal != null ? JSON.stringify(defaultVal) : "",
        () => {},
        { multiline: true, tooltip },
      );
      break;
    default:
      node.addWidget("text", wName, defaultVal ?? "", () => {}, { tooltip });
  }
}

/* ────────────────────────────────────────────────────────── */
/* LotusIOKind → widget factory (for cap.inputs[])           */
/* ────────────────────────────────────────────────────────── */

type WidgetFactory = (node: any, name: string, io: any) => void;

const KIND_TO_WIDGET: Record<string, WidgetFactory> = {
  text: (node, name, io) => {
    ensureDynInput(node, name, "STRING");
    node.addWidget("text", name, io.description || "", () => {}, {
      multiline: (io.json_schema?.maxLength ?? 0) > 200,
    });
  },
  number: (node, name, io) => {
    ensureDynInput(node, name, "NUMBER");
    const schema = io.json_schema || {};
    node.addWidget("number", name, schema.default ?? 0, () => {}, {
      min: schema.minimum ?? -Infinity,
      max: schema.maximum ?? Infinity,
      step: schema.multipleOf ?? 1,
    });
  },
  boolean: (node, name, _io) => {
    ensureDynInput(node, name, "BOOLEAN");
    node.addWidget("toggle", name, false, () => {});
  },
  json: (node, name, _io) => {
    ensureDynInput(node, name, "*");
    node.addWidget("text", name, "{}", () => {}, { multiline: true });
  },
  artifact_ref: (node, name, _io) => {
    node.addInput(name, "EMBEDDR_ARTIFACT_ID");
  },
  artifact_refs: (node, name, _io) => {
    node.addInput(name, "EMBEDDR_ARTIFACT_ID");
  },
  collection_ref: (node, name, _io) => {
    node.addWidget("text", name, "", () => {});
  },
  image: (node, name, _io) => {
    node.addInput(name, "IMAGE");
  },
  video: (node, name, _io) => {
    node.addInput(name, "VIDEO");
  },
  uri: (node, name, _io) => {
    node.addWidget("text", name, "", () => {});
  },
};

interface LotusIOType {
  name: string;
  kind: string;
  description?: string;
  required?: boolean;
  array?: boolean;
  json_schema?: Record<string, any>;
}

interface LotusCapability {
  id: string;
  kind: string;
  title: string;
  description?: string;
  plugin?: string;
  inputs?: Array<LotusIOType>;
  outputs?: Array<LotusIOType>;
  data?: Record<string, any>;
  action?: {
    action?: string;
    input?: {
      schema?: Record<string, any>;
      model?: string;
      ui?: {
        order?: Array<string>;
        widgets?: Record<string, string>;
        options?: Record<string, Array<string>>;
      };
    };
    output?: {
      schema?: Record<string, any>;
      model?: string;
    };
  };
}

/** Cached actions list */
let _actionsCache: Array<LotusCapability> | null = null;
let _actionsCacheTime = 0;
const CACHE_TTL_MS = 30_000;

async function fetchActions(): Promise<Array<LotusCapability>> {
  const now = Date.now();
  if (_actionsCache && now - _actionsCacheTime < CACHE_TTL_MS) {
    return _actionsCache;
  }

  try {
    const cfgResp = await fetch("/embeddr/config");
    let baseUrl = "http://localhost:8003";
    if (cfgResp.ok) {
      const cfg = await cfgResp.json();
      baseUrl = (cfg.endpoint || baseUrl).replace(/\/+$/, "");
    }

    const targetUrl = `${baseUrl}/api/v1/lotus/list?kind=action&limit=500`;
    const resp = await fetch(`/embeddr/proxy?url=${encodeURIComponent(targetUrl)}`);
    if (!resp.ok) {
      console.warn("[Embeddr Action] Proxy returned", resp.status);
      return _actionsCache ?? [];
    }
    const data = await resp.json();
    _actionsCache = data.items ?? data ?? [];
    _actionsCacheTime = now;
    return _actionsCache;
  } catch (e) {
    console.warn("[Embeddr Action] Failed to fetch actions:", e);
    return _actionsCache ?? [];
  }
}

function buildComboLabel(cap: LotusCapability): string {
  const parts: Array<string> = [];
  if (cap.plugin) parts.push(cap.plugin);
  let label = cap.id;
  if (cap.title && cap.title !== cap.id) {
    label = `${cap.id} [${cap.title}]`;
  }
  if (parts.length) label = `${parts.join("/")}/${label}`;
  return label;
}

function extractCapId(label: string): string {
  if (!label || label.startsWith("(")) return "";
  let s = label;
  if (s.includes("/")) s = s.split("/").slice(-1)[0];
  if (s.includes(" [")) s = s.split(" [")[0];
  return s.trim();
}

/** Remove all dynamic widgets/inputs from a node */
function clearDynamicWidgets(node: any) {
  if (node.widgets) {
    for (let i = node.widgets.length - 1; i >= 0; i--) {
      if (node.widgets[i].name?.startsWith(DYN_PREFIX)) {
        node.widgets.splice(i, 1);
      }
    }
  }
  if (node.inputs) {
    for (let i = node.inputs.length - 1; i >= 0; i--) {
      if (node.inputs[i].name?.startsWith(DYN_PREFIX)) {
        node.removeInput(i);
      }
    }
  }
}

/* ────────────────────────────────────────────────────────── */
/* Dynamic output labeling based on output schema            */
/* ────────────────────────────────────────────────────────── */

/**
 * Static output slot indices (must match define_schema() in Python).
 * result_json=0, status=1, output_artifact_ids=2, text=3, error=4
 */
const OUTPUT_SLOTS = {
  result_json: 0,
  status: 1,
  output_artifact_ids: 2,
  text: 3,
  error: 4,
} as const;

const DEFAULT_OUTPUT_LABELS: Record<number, string> = {
  0: "result_json",
  1: "status",
  2: "output_artifact_ids",
  3: "text",
  4: "error",
};

/** Keys Python's execute() checks when extracting a text output. */
const TEXT_EXTRACT_KEYS = [
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
];

/** Keys Python checks when extracting artifact IDs. */
const ARTIFACT_EXTRACT_KEYS = ["artifact_id", "id", "artifact_ids", "ids", "output_artifact_id"];

/**
 * Relabel the static output slots based on the selected action's
 * output schema so users can see at a glance what each output carries.
 *
 * Data sources (checked in order):
 *   1. cap.action.output.schema   (JSON Schema from Pydantic model)
 *   2. cap.data.output.schema     (fallback path)
 *   3. cap.outputs[]              (explicit LotusIOType array)
 */
function updateOutputLabels(node: any, cap: LotusCapability) {
  if (!node.outputs) return;

  // Reset first
  resetOutputLabels(node);

  // Try to get output schema properties
  const outSchema = cap.action?.output?.schema ?? (cap as any).data?.output?.schema;
  const outProps: Record<string, any> | undefined = outSchema?.properties;

  // Also check cap.outputs (LotusIOType array)
  const lotusOutputs = cap.outputs ?? [];

  if (!outProps && lotusOutputs.length === 0) return;

  // Build a set of known output field names
  const fieldNames: Set<string> = new Set();
  if (outProps) {
    for (const key of Object.keys(outProps)) {
      fieldNames.add(key);
    }
  }
  for (const out of lotusOutputs) {
    fieldNames.add(out.name);
  }

  // ── Relabel "text" slot to the actual field name ──
  for (const key of TEXT_EXTRACT_KEYS) {
    if (fieldNames.has(key)) {
      const slot = node.outputs[OUTPUT_SLOTS.text];
      if (slot) {
        slot.name = key;
        const desc = outProps?.[key]?.description;
        if (desc) slot.tooltip = desc;
      }
      break;
    }
  }

  // ── Relabel "output_artifact_ids" slot ──
  for (const key of ARTIFACT_EXTRACT_KEYS) {
    if (fieldNames.has(key)) {
      const slot = node.outputs[OUTPUT_SLOTS.output_artifact_ids];
      if (slot) {
        slot.name = key;
        const desc = outProps?.[key]?.description;
        if (desc) slot.tooltip = desc;
      }
      break;
    }
  }

  // ── Relabel "status" slot if schema has a status-like field ──
  for (const key of ["status", "ok"]) {
    if (fieldNames.has(key)) {
      const slot = node.outputs[OUTPUT_SLOTS.status];
      if (slot) {
        slot.name = key;
      }
      break;
    }
  }

  // ── Relabel "error" slot ──
  if (fieldNames.has("error")) {
    const slot = node.outputs[OUTPUT_SLOTS.error];
    if (slot) {
      const desc = outProps?.["error"]?.description;
      if (desc) slot.tooltip = desc;
    }
  }

  // ── Add tooltip to result_json showing the model name ──
  const modelName = cap.action?.output?.model ?? (cap as any).data?.output?.model;
  if (modelName && node.outputs[OUTPUT_SLOTS.result_json]) {
    node.outputs[OUTPUT_SLOTS.result_json].tooltip =
      `Full JSON: ${modelName.split(":").pop() ?? modelName}`;
  }

  node.setSize(node.computeSize());
  if (node.graph) node.graph.setDirtyCanvas(true, true);
}

/** Reset output slot labels to defaults */
function resetOutputLabels(node: any) {
  if (!node.outputs) return;
  for (const [idx, label] of Object.entries(DEFAULT_OUTPUT_LABELS)) {
    const slot = node.outputs[+idx];
    if (slot) {
      slot.name = label;
      slot.tooltip = undefined;
    }
  }
  if (node.graph) node.graph.setDirtyCanvas(true);
}

/** Create dynamic widgets for a given capability.
 *  Skips fields in SKIP_SCHEMA_FIELDS (handled by static inputs).
 */
function createDynamicInputs(node: any, cap: LotusCapability) {
  const lotusInputs = cap.inputs ?? [];

  if (lotusInputs.length > 0) {
    // ── Path A: explicit LotusIOType inputs ──
    for (const input of lotusInputs) {
      if (SKIP_SCHEMA_FIELDS.has(input.name)) continue;

      const widgetName = `${DYN_PREFIX}${input.name}`;
      const exists =
        node.widgets?.some((w: any) => w.name === widgetName) ||
        node.inputs?.some((i: any) => i.name === widgetName);
      if (exists) continue;

      const factory = KIND_TO_WIDGET[input.kind];
      if (factory) {
        factory(node, widgetName, input);
      } else {
        node.addWidget("text", widgetName, "", () => {}, { multiline: false });
      }
    }
  } else {
    // ── Path B: JSON Schema from action.input.schema ──
    const jsonSchema = cap.action?.input?.schema ?? (cap as any).data?.input?.schema;

    if (jsonSchema && jsonSchema.properties) {
      const props = jsonSchema.properties as Record<string, any>;
      const requiredSet = new Set(jsonSchema.required ?? []);

      const uiOrder: Array<string> =
        cap.action?.input?.ui?.order ?? (cap as any).data?.input?.ui?.order ?? Object.keys(props);

      const ordered = [
        ...uiOrder.filter((k: string) => k in props),
        ...Object.keys(props).filter((k: string) => !uiOrder.includes(k)),
      ];

      for (const propName of ordered) {
        if (SKIP_SCHEMA_FIELDS.has(propName)) continue;
        addWidgetForJsonSchemaProp(node, propName, props[propName], requiredSet.has(propName));
      }
    }
  }

  node.setSize(node.computeSize());
  if (node.graph) {
    node.graph.setDirtyCanvas(true, true);
  }
}

/**
 * Convert the action_id string widget into a combo widget
 * populated with live Lotus actions from the backend.
 */
async function populateActionCombo(node: any) {
  const actions = await fetchActions();

  const options = ["(select action)"];
  for (const cap of actions) {
    options.push(buildComboLabel(cap));
  }

  const existingIdx = (node.widgets ?? []).findIndex((w: any) => w.name === "action_id");

  let prevValue = "";
  if (existingIdx >= 0) {
    prevValue = node.widgets[existingIdx].value ?? "";
    node.widgets.splice(existingIdx, 1);
  }

  node.addWidget(
    "combo",
    "action_id",
    options.includes(prevValue) ? prevValue : "(select action)",
    (value: string) => {
      onActionChanged(node, value);
    },
    { values: options },
  );

  if (existingIdx >= 0 && node.widgets.length > 1) {
    const moved = node.widgets.pop();
    node.widgets.splice(existingIdx, 0, moved);
  }

  node.setSize(node.computeSize());
  if (node.graph) {
    node.graph.setDirtyCanvas(true, true);
  }
}

/** Handle action selection change */
async function onActionChanged(node: any, value: string) {
  clearDynamicWidgets(node);

  const capId = extractCapId(value);
  if (!capId) {
    resetOutputLabels(node);
    return;
  }

  const actions = await fetchActions();
  const cap = actions.find((a) => a.id === capId);
  if (!cap) {
    console.warn(`[Embeddr Action] Capability '${capId}' not found`);
    resetOutputLabels(node);
    return;
  }

  node._embeddrActionCap = cap;
  createDynamicInputs(node, cap);
  updateOutputLabels(node, cap);

  // Restore any saved widget values from payload_json
  syncPayloadToDyn(node);
}

app.registerExtension({
  name: "embeddr.dynamic_action",

  async beforeRegisterNodeDef(nodeType: any, nodeData: any, _app: any) {
    if (nodeData.name !== NODE_ID) return;

    // ── Override serialize to pack dyn_ values into payload_json ──
    const origSerialize = nodeType.prototype.serialize;
    nodeType.prototype.serialize = function () {
      syncDynToPayload(this);
      return origSerialize?.apply(this, arguments);
    };

    // ── On node creation ──
    const origOnNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = origOnNodeCreated?.apply(this, arguments);
      populateActionCombo(this);
      return result;
    };

    // ── On configure (loading saved graph) ──
    const origOnConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (data: any) {
      const result = origOnConfigure?.apply(this, arguments);

      populateActionCombo(this).then(() => {
        const comboWidget = this.widgets?.find((w: any) => w.name === "action_id");
        const val = comboWidget?.value;
        if (val && val !== "(select action)" && val !== "") {
          onActionChanged(this, val);
        }
      });

      return result;
    };
  },
});
