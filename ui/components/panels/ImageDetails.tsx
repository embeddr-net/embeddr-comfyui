import React, { useMemo, useState, useEffect } from "react";
import { Button } from "@embeddr/react-ui/components/button";
import { ScrollArea } from "@embeddr/react-ui/components/scroll-area";
import { Badge } from "@embeddr/react-ui/components/badge";
import { Separator } from "@embeddr/react-ui/components/separator";
import { Skeleton } from "@embeddr/react-ui/components/skeleton";
import { EmbeddrApiClient } from "@embeddr/api";
import { AuthorizedImage } from "@components/ui/AuthorizedImage";

import {
  ArrowBigRightDashIcon,
  Check,
  Copy,
  Plus,
  Tag,
  Folder,
  Hash,
  Info,
  FileText,
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
  type_name: string;
  uri: string;
  metadata_json: Record<string, any>;
  collections: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
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
  const [copied, setCopied] = useState(false);
  const [artifact, setArtifact] = useState<ArtifactDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const localClient = useMemo(() => {
    if (apiClient) return apiClient;
    if (!apiBase) return null;
    let baseUrl = apiBase;
    if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
    if (!baseUrl.endsWith("/api/v1")) {
      baseUrl = `${baseUrl}/api/v1`;
    }
    return new EmbeddrApiClient({ baseUrl });
  }, [apiClient, apiBase]);

  useEffect(() => {
    if (!selectedImage?.id) {
      setArtifact(null);
      return;
    }

    setLoading(true);
    const client = localClient;
    const fallback = apiBase
      ? apiBase.replace(/\/+$/, "").replace(/\/+api\/v2$/, "") + "/api/v1"
      : "";

    if (client) {
      client.artifacts
        .get(selectedImage.id)
        .then((data) => setArtifact(data as ArtifactDetail))
        .catch((e) => {
          console.warn("Failed to fetch artifact, trying fallback headers", e);
          // If client fails, try raw fetch with token from local storage as backup
          if (fallback) {
            const token = localStorage.getItem("embeddr_api_key");
            const headers: any = {};
            if (token) headers["X-API-Key"] = token;

            fetch(`${fallback}/artifacts/${selectedImage.id}`, { headers })
              .then((res) => res.json())
              .then((data) => setArtifact(data))
              .catch((err) => console.error("Double fallback failed", err));
          }
        })
        .finally(() => setLoading(false));
      return;
    }

    if (!fallback) {
      setArtifact(null);
      setLoading(false);
      return;
    }

    const token = localStorage.getItem("embeddr_api_key");
    const headers: any = {};
    if (token) headers["X-API-Key"] = token;

    fetch(`${fallback}/artifacts/${selectedImage.id}`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setArtifact(data))
      .catch((e) => console.error("Failed to fetch artifact details", e))
      .finally(() => setLoading(false));
  }, [selectedImage.id, apiBase, localClient]);

  const handleCopyPrompt = () => {
    if (selectedImage?.prompt) {
      navigator.clipboard.writeText(selectedImage.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0 relative">
      <ScrollArea className="flex-1 min-h-0" type="always">
        <div className="flex flex-col gap-1 pr-3">
          <div className="w-full shrink-0 overflow-hidden bg-muted border relative group">
            <AuthorizedImage
              src={selectedImage.thumb_url || selectedImage.image_url}
              alt="Selected"
              className="w-full h-full object-cover"
              apiKey={apiKey}
            />

            {/* Overlay Controls */}
            <div className="absolute inset-0 p-2 flex justify-between items-start pointer-events-none">
              {/* Left: New Node / Smart Use */}
              <Button
                size="icon"
                variant="secondary"
                className="h-8 w-8 shadow-sm pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onUseImage(selectedImage.image_url)}
                title="Create New Node"
              >
                <Plus className="w-4 h-4" />
              </Button>

              {/* Right: Actions & Nodes */}
              <div className="flex flex-col gap-1 items-end pointer-events-auto">
                {/* Copy Prompt */}
                {selectedImage.prompt && (
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={handleCopyPrompt}
                    title="Copy Prompt"
                  >
                    {copied ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                )}

                {/* Target Nodes */}
                {targetNodes.map((node) => (
                  <Button
                    key={node.id}
                    size="sm"
                    variant="secondary"
                    className="h-6 text-xs shadow-sm opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                    onClick={() =>
                      onLoadIntoNode(node.id, selectedImage.image_url)
                    }
                  >
                    {node.title}{" "}
                    <ArrowBigRightDashIcon className="w-3 h-3 ml-1" />
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 p-1 mt-2">
            {selectedImage.prompt && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <FileText className="w-3 h-3" /> Prompt
                </div>
                <div className="text-xs text-muted-foreground bg-background border p-2 rounded-md whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                  {selectedImage.prompt}
                </div>
              </div>
            )}

            {loading && (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-3/4 bg-muted" />
                <Skeleton className="h-4 w-1/2 bg-muted" />
              </div>
            )}

            {!loading && artifact && (
              <>
                <Separator />
                {/* Tech Specs */}
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground font-medium">
                      Dimensions
                    </span>
                    <span>
                      {artifact.metadata_json?.width || selectedImage.width} x{" "}
                      {artifact.metadata_json?.height || selectedImage.height}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground font-medium">
                      Type
                    </span>
                    <span className="uppercase">
                      {artifact.metadata_json?.format || artifact.type_name}
                    </span>
                  </div>
                  {/* File Path (usually useful for debugging or local) */}
                </div>

                {/* Collections */}
                {artifact.collections && artifact.collections.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <Folder className="w-3 h-3" /> Collections
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {artifact.collections.map((c) => (
                        <Badge
                          key={c.id}
                          variant="outline"
                          className="text-[10px] px-2 py-0.5 h-auto font-normal"
                        >
                          {c.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {((artifact.tags && artifact.tags.length > 0) ||
                  (artifact.metadata_json?.tags &&
                    Array.isArray(artifact.metadata_json.tags))) && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <Tag className="w-3 h-3" /> Tags
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {/* Prefer relational tags, fallback to metadata tags */}
                      {(artifact.tags?.length > 0
                        ? artifact.tags
                        : (artifact.metadata_json.tags as string[]).map(
                            (t) => ({ id: t, name: t }),
                          )
                      ).map((t) => (
                        <Badge
                          key={t.id}
                          variant="secondary"
                          className="text-[10px] px-2 py-0.5 h-auto font-normal"
                        >
                          #{t.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
