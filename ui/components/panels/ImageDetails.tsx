import React, { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  ScrollArea,
  Separator,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@embeddr/react-ui/components/ui";
import { EmbeddrApiClient } from "@embeddr/client-typescript";
import { AuthorizedImage } from "@components/ui/AuthorizedImage";
import {
  ArrowBigRightDashIcon,
  Braces,
  Check,
  Copy,
  FileText,
  Folder,
  Info,
  Layers,
  MessageSquare,
  Plus,
  Tag,
} from "lucide-react";
import type { PromptImageRead } from "@hooks/useEmbeddrApi";
import type { TargetNode } from "@hooks/useNodeScanner";

interface ImageDetailsProps {
  selectedImage: PromptImageRead;
  targetNodes: Array<TargetNode>;
  onLoadIntoNode: (nodeId: number, imageUrl: string) => void;
  onUseImage: (imageUrl: string) => void;
  apiBase?: string;
  apiClient?: EmbeddrApiClient;
  apiKey?: string;
}

interface ArtifactDetail {
  id: string;
  created_at?: string;
  type_name: string;
  base_type_name?: string;
  uri: string;
  metadata_json: Record<string, any>;
  collections: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
}

interface ArtifactAnnotation {
  id: string;
  text: string;
  annotation_type: string;
  plugin_name?: string;
  confidence?: number;
  created_at?: string;
}

interface ArtifactEmbedding {
  id: string;
  model_name: string;
  plugin_name?: string;
  created_at?: string;
  vector_dim: number;
  space: string;
}

interface ArtifactFeatureRef {
  id: string;
  feature_type: string;
  name: string;
  producer_plugin?: string;
  producer_version?: string;
  created_at?: string;
  model_name?: string;
  space?: string;
  vector_dim?: number;
  metadata_json?: Record<string, any>;
}

interface ArtifactSignals {
  annotations: Array<ArtifactAnnotation>;
  embeddings: Array<ArtifactEmbedding>;
  features: Array<ArtifactFeatureRef>;
}

interface DerivedTextSignal {
  id: string;
  label: string;
  source: string;
  text: string;
  pluginName?: string;
  confidence?: number;
}

const EMPTY_SIGNALS: ArtifactSignals = {
  annotations: [],
  embeddings: [],
  features: [],
};

const TEXT_METADATA_KEYS = [
  "caption",
  "caption_text",
  "generated_caption",
  "summary",
  "description",
  "alt_text",
  "ocr_text",
  "text",
  "note",
];

function resolveApiV1Base(apiBase?: string) {
  const trimmed = (apiBase || "").replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/\/api\/v1$/i.test(trimmed)) return trimmed;
  if (/\/api\/v2$/i.test(trimmed)) return trimmed.replace(/\/api\/v2$/i, "/api/v1");
  if (/\/api$/i.test(trimmed)) return `${trimmed}/v1`;
  return `${trimmed}/api/v1`;
}

function getAuthHeaders(apiKey?: string | null) {
  const headers: Record<string, string> = {};
  if (apiKey) headers["X-API-Key"] = apiKey;
  return headers;
}

async function fetchJson<T>(url: string, apiKey?: string | null): Promise<T> {
  const response = await fetch(url, {
    headers: getAuthHeaders(apiKey),
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

function normalizeSignalText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function collectDerivedTextSignals(
  artifact: ArtifactDetail | null,
  annotations: Array<ArtifactAnnotation>,
  features: Array<ArtifactFeatureRef>,
): Array<DerivedTextSignal> {
  const seen = new Set<string>();
  const signals: Array<DerivedTextSignal> = [];

  const pushSignal = (signal: DerivedTextSignal | null) => {
    if (!signal) return;
    const normalized = signal.text.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    signals.push({ ...signal, text: normalized });
  };

  annotations.forEach((annotation) => {
    const text = normalizeSignalText(annotation.text);
    pushSignal(
      text
        ? {
            id: `annotation:${annotation.id}`,
            label: annotation.annotation_type || "annotation",
            source: "Annotation",
            text,
            pluginName: annotation.plugin_name,
            confidence: annotation.confidence,
          }
        : null,
    );
  });

  TEXT_METADATA_KEYS.forEach((key) => {
    const text = normalizeSignalText(artifact?.metadata_json?.[key]);
    pushSignal(
      text
        ? {
            id: `metadata:${key}`,
            label: key.replace(/_/g, " "),
            source: "Metadata",
            text,
          }
        : null,
    );
  });

  features.forEach((feature) => {
    const featureText =
      TEXT_METADATA_KEYS.map((key) => normalizeSignalText(feature.metadata_json?.[key])).find(
        Boolean,
      ) ||
      (/(caption|summary|ocr|text)/i.test(feature.feature_type)
        ? normalizeSignalText(feature.name)
        : null);

    pushSignal(
      featureText
        ? {
            id: `feature:${feature.id}`,
            label: feature.feature_type || "feature",
            source: "Feature",
            text: featureText,
            pluginName: feature.producer_plugin,
          }
        : null,
    );
  });

  return signals;
}

export function ImageDetails({
  selectedImage,
  targetNodes,
  onLoadIntoNode,
  onUseImage,
  apiBase,
  apiClient,
  apiKey,
}: ImageDetailsProps) {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [artifact, setArtifact] = useState<ArtifactDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState<ArtifactSignals>(EMPTY_SIGNALS);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [signalsError, setSignalsError] = useState<string | null>(null);

  const effectiveApiKey = useMemo(
    () =>
      apiKey || (typeof window !== "undefined" ? localStorage.getItem("embeddr_api_key") : null),
    [apiKey],
  );

  const resolvedApiBase = useMemo(() => resolveApiV1Base(apiBase), [apiBase]);

  const localClient = useMemo(() => {
    if (apiClient) return apiClient;
    if (!resolvedApiBase) return null;
    return new EmbeddrApiClient({ baseUrl: resolvedApiBase });
  }, [apiClient, resolvedApiBase]);

  useEffect(() => {
    if (!selectedImage?.id) {
      setArtifact(null);
      return;
    }

    let active = true;
    setLoading(true);

    (async () => {
      try {
        if (localClient) {
          const data = await localClient.artifacts.get(String(selectedImage.id));
          if (active) setArtifact(data as ArtifactDetail);
          return;
        }

        if (!resolvedApiBase) {
          if (active) setArtifact(null);
          return;
        }

        const data = await fetchJson<ArtifactDetail>(
          `${resolvedApiBase}/artifacts/${selectedImage.id}`,
          effectiveApiKey,
        );
        if (active) setArtifact(data);
      } catch (error) {
        console.error("Failed to fetch artifact details", error);
        if (active) setArtifact(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [effectiveApiKey, localClient, resolvedApiBase, selectedImage?.id]);

  useEffect(() => {
    if (!selectedImage?.id || !resolvedApiBase) {
      setSignals(EMPTY_SIGNALS);
      setSignalsLoading(false);
      setSignalsError(null);
      return;
    }

    let active = true;
    setSignalsLoading(true);
    setSignalsError(null);

    Promise.allSettled([
      fetchJson<Array<ArtifactAnnotation>>(
        `${resolvedApiBase}/artifacts/${selectedImage.id}/annotations`,
        effectiveApiKey,
      ),
      fetchJson<Array<ArtifactEmbedding>>(
        `${resolvedApiBase}/artifacts/${selectedImage.id}/embeddings`,
        effectiveApiKey,
      ),
      fetchJson<Array<ArtifactFeatureRef>>(
        `${resolvedApiBase}/artifacts/${selectedImage.id}/features`,
        effectiveApiKey,
      ),
    ])
      .then(([annotationsResult, embeddingsResult, featuresResult]) => {
        if (!active) return;

        const nextSignals: ArtifactSignals = {
          annotations: annotationsResult.status === "fulfilled" ? annotationsResult.value : [],
          embeddings: embeddingsResult.status === "fulfilled" ? embeddingsResult.value : [],
          features: featuresResult.status === "fulfilled" ? featuresResult.value : [],
        };

        const failedRequests = [annotationsResult, embeddingsResult, featuresResult].filter(
          (result) => result.status === "rejected",
        );

        setSignals(nextSignals);
        setSignalsError(
          failedRequests.length > 0 ? "Some artifact signals could not be loaded." : null,
        );
      })
      .catch((error) => {
        console.error("Failed to fetch artifact signals", error);
        if (active) {
          setSignals(EMPTY_SIGNALS);
          setSignalsError("Failed to load artifact signals.");
        }
      })
      .finally(() => {
        if (active) setSignalsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [effectiveApiKey, resolvedApiBase, selectedImage?.id]);

  const legacyPrompt = useMemo(
    () => normalizeSignalText(selectedImage?.prompt),
    [selectedImage?.prompt],
  );

  const derivedTextSignals = useMemo(
    () => collectDerivedTextSignals(artifact, signals.annotations, signals.features),
    [artifact, signals.annotations, signals.features],
  );

  const filename = useMemo(() => {
    const metadataName = normalizeSignalText(artifact?.metadata_json?.filename);
    if (metadataName) return metadataName;
    if (selectedImage.filename) return selectedImage.filename;
    if (artifact?.uri) {
      const lastSegment = artifact.uri.split("/").filter(Boolean).pop();
      if (lastSegment) return lastSegment;
    }
    return `artifact-${selectedImage.id}`;
  }, [artifact?.metadata_json, artifact?.uri, selectedImage.filename, selectedImage.id]);

  const rawArtifactPayload = useMemo(
    () =>
      JSON.stringify(
        {
          artifact,
          signals,
          selected_image: selectedImage,
        },
        null,
        2,
      ),
    [artifact, selectedImage, signals],
  );

  const handleCopyPrompt = () => {
    if (!legacyPrompt) return;
    navigator.clipboard.writeText(legacyPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3">
      <ScrollArea className="flex-1 min-h-0" type="always">
        <div className="flex flex-col gap-3 pr-3">
          <div className="group relative w-full shrink-0 overflow-hidden rounded-lg border bg-muted">
            <AuthorizedImage
              src={selectedImage.thumb_url || selectedImage.image_url}
              alt="Selected"
              className="h-full w-full object-cover"
              apiKey={apiKey}
            />

            <div className="pointer-events-none absolute inset-0 flex items-start justify-between p-2">
              <Button
                size="icon"
                variant="secondary"
                className="pointer-events-auto h-8 w-8 shadow-sm opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => onUseImage(selectedImage.image_url)}
                title="Create New Node"
              >
                <Plus className="h-4 w-4" />
              </Button>

              <div className="pointer-events-auto flex flex-col items-end gap-1">
                {legacyPrompt && (
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8 shadow-sm opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={handleCopyPrompt}
                    title="Copy legacy prompt"
                  >
                    {copiedPrompt ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                )}

                {targetNodes.map((node) => (
                  <Button
                    key={node.id}
                    size="sm"
                    variant="secondary"
                    className="h-6 whitespace-nowrap text-xs shadow-sm opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => onLoadIntoNode(node.id, selectedImage.image_url)}
                  >
                    {node.title}
                    <ArrowBigRightDashIcon className="ml-1 h-3 w-3" />
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-background/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold" title={filename}>
                  {filename}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-[10px]">
                    {artifact?.type_name || "image"}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    #{selectedImage.id}
                  </Badge>
                  {artifact?.collections?.length ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {artifact.collections.length} collections
                    </Badge>
                  ) : null}
                  {signals.features.length > 0 ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {signals.features.length} features
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="text-right text-[10px] text-muted-foreground">
                {artifact?.created_at || selectedImage.created_at}
              </div>
            </div>
          </div>

          <Tabs defaultValue="overview" className="flex flex-col gap-3">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview" className="text-xs">
                Overview
              </TabsTrigger>
              <TabsTrigger value="signals" className="text-xs">
                Signals
              </TabsTrigger>
              <TabsTrigger value="json" className="text-xs">
                JSON
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-0 space-y-4">
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full bg-muted" />
                  <Skeleton className="h-24 w-full bg-muted" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1 rounded-lg border bg-background/60 p-3">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Info className="h-3 w-3" />
                        Details
                      </div>
                      <div className="space-y-1.5 pt-1">
                        <div>
                          <div className="text-muted-foreground">Filename</div>
                          <div className="truncate font-medium" title={filename}>
                            {filename}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Artifact ID</div>
                          <div className="font-mono text-[11px] break-all">
                            {artifact?.id || selectedImage.id}
                          </div>
                        </div>
                        {selectedImage.model && (
                          <div>
                            <div className="text-muted-foreground">Model</div>
                            <div className="truncate font-medium">{selectedImage.model}</div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 rounded-lg border bg-background/60 p-3">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Layers className="h-3 w-3" />
                        Media
                      </div>
                      <div className="space-y-1.5 pt-1">
                        <div>
                          <div className="text-muted-foreground">Dimensions</div>
                          <div className="font-medium">
                            {artifact?.metadata_json?.width || selectedImage.width || "?"} x{" "}
                            {artifact?.metadata_json?.height || selectedImage.height || "?"}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Type</div>
                          <div className="font-medium uppercase">
                            {artifact?.metadata_json?.format || artifact?.type_name || "image"}
                          </div>
                        </div>
                        {artifact?.base_type_name && (
                          <div>
                            <div className="text-muted-foreground">Base Type</div>
                            <div className="font-medium">{artifact.base_type_name}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {artifact?.collections?.length ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                        <Folder className="h-3 w-3" />
                        Collections
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {artifact.collections.map((collection) => (
                          <Badge
                            key={collection.id}
                            variant="outline"
                            className="h-auto px-2 py-0.5 text-[10px] font-normal"
                          >
                            {collection.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {((artifact?.tags && artifact.tags.length > 0) ||
                    (artifact?.metadata_json?.tags &&
                      Array.isArray(artifact.metadata_json.tags))) && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                        <Tag className="h-3 w-3" />
                        Tags
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(artifact?.tags?.length
                          ? artifact.tags
                          : (artifact?.metadata_json?.tags as Array<string>).map((tag) => ({
                              id: tag,
                              name: tag,
                            }))
                        ).map((tag) => (
                          <Badge
                            key={tag.id}
                            variant="secondary"
                            className="h-auto px-2 py-0.5 text-[10px] font-normal"
                          >
                            #{tag.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {legacyPrompt ? (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                            <FileText className="h-3 w-3" />
                            Legacy Prompt
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={handleCopyPrompt}
                          >
                            {copiedPrompt ? (
                              <Check className="mr-1 h-3 w-3" />
                            ) : (
                              <Copy className="mr-1 h-3 w-3" />
                            )}
                            Copy
                          </Button>
                        </div>
                        <div className="max-h-48 overflow-y-auto rounded-md border bg-background p-2 font-mono text-xs text-muted-foreground whitespace-pre-wrap">
                          {legacyPrompt}
                        </div>
                      </div>
                    </>
                  ) : null}
                </>
              )}
            </TabsContent>

            <TabsContent value="signals" className="mt-0 space-y-4">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg border bg-background/60 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Text Signals
                  </div>
                  <div className="mt-1 text-lg font-semibold">{derivedTextSignals.length}</div>
                </div>
                <div className="rounded-lg border bg-background/60 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Features
                  </div>
                  <div className="mt-1 text-lg font-semibold">{signals.features.length}</div>
                </div>
                <div className="rounded-lg border bg-background/60 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Embeddings
                  </div>
                  <div className="mt-1 text-lg font-semibold">{signals.embeddings.length}</div>
                </div>
              </div>

              {signalsError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {signalsError}
                </div>
              )}

              {signalsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-24 w-full bg-muted" />
                  <Skeleton className="h-16 w-full bg-muted" />
                  <Skeleton className="h-16 w-full bg-muted" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <MessageSquare className="h-3 w-3" />
                      Text Signals
                    </div>
                    {derivedTextSignals.length > 0 ? (
                      <div className="space-y-2">
                        {derivedTextSignals.map((signal) => (
                          <div key={signal.id} className="rounded-lg border bg-background/60 p-3">
                            <div className="mb-2 flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">
                                {signal.source}
                              </Badge>
                              <Badge variant="secondary" className="text-[10px]">
                                {signal.label}
                              </Badge>
                              {signal.pluginName ? (
                                <span className="truncate text-[10px] text-muted-foreground">
                                  {signal.pluginName}
                                </span>
                              ) : null}
                              {signal.confidence != null ? (
                                <span className="ml-auto text-[10px] text-muted-foreground">
                                  {(signal.confidence * 100).toFixed(0)}%
                                </span>
                              ) : null}
                            </div>
                            <div className="whitespace-pre-wrap text-xs text-foreground/90">
                              {signal.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border/60 bg-background/50 px-4 py-6 text-center text-xs text-muted-foreground">
                        No captions, annotations, or generated text are attached to this artifact
                        yet.
                      </div>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <Layers className="h-3 w-3" />
                      Features
                    </div>
                    {signals.features.length > 0 ? (
                      <div className="space-y-2">
                        {signals.features.map((feature) => (
                          <div key={feature.id} className="rounded-lg border bg-background/60 p-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">
                                {feature.feature_type}
                              </Badge>
                              <span className="truncate text-xs font-medium">{feature.name}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {feature.producer_plugin ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  {feature.producer_plugin}
                                </Badge>
                              ) : null}
                              {feature.model_name ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  {feature.model_name}
                                </Badge>
                              ) : null}
                              {feature.space ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  {feature.space}
                                </Badge>
                              ) : null}
                              {feature.vector_dim ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  {feature.vector_dim}d
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border/60 bg-background/50 px-4 py-6 text-center text-xs text-muted-foreground">
                        No attached features found.
                      </div>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <Braces className="h-3 w-3" />
                      Embeddings
                    </div>
                    {signals.embeddings.length > 0 ? (
                      <div className="space-y-2">
                        {signals.embeddings.map((embedding) => (
                          <div
                            key={embedding.id}
                            className="rounded-lg border bg-background/60 p-3"
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">
                                {embedding.space}
                              </Badge>
                              <span className="truncate text-xs font-medium">
                                {embedding.model_name}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              <Badge variant="secondary" className="text-[10px]">
                                {embedding.vector_dim}d
                              </Badge>
                              {embedding.plugin_name ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  {embedding.plugin_name}
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border/60 bg-background/50 px-4 py-6 text-center text-xs text-muted-foreground">
                        No embeddings stored for this artifact.
                      </div>
                    )}
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="json" className="mt-0">
              <div className="rounded-lg border bg-background/60 p-3">
                <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-muted-foreground">
                  {rawArtifactPayload}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
