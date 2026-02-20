import React, { useEffect, useRef } from "react";
import { ScrollArea } from "@embeddr/react-ui/components/ui";
import { Eye, PenLineIcon } from "lucide-react";
import { Button } from "@embeddr/react-ui/components/ui";
import { cn } from "@embeddr/react-ui";
import { EmbeddrDnDTypes } from "@embeddr/react-ui";
import { AuthorizedImage } from "./AuthorizedImage";

import type { PromptImageRead } from "@hooks/useEmbeddrApi";

interface ImageGridProps {
  images: Array<PromptImageRead>;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onSelect?: (image: PromptImageRead) => void;
  onRightClick: (image: PromptImageRead) => void;
  onSimilarSearch?: (imageId: number) => void;
  selectedId?: number;
  gridSize?: number;
  imagePreviewContain?: boolean;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  apiKey?: string;
}

export function ImageGrid({
  images,
  loading,
  hasMore,
  onLoadMore,
  onSelect,
  onRightClick,
  onSimilarSearch,
  selectedId,
  gridSize = 3,
  imagePreviewContain = true,
  scrollRef,
  apiKey,
}: ImageGridProps) {
  const observerTarget = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          onLoadMore();
        }
      },
      { threshold: 0, rootMargin: "200px" },
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [hasMore, loading, onLoadMore]);

  const handleDragStart = (e: React.DragEvent, image: PromptImageRead) => {
    const artifactId = image.id.toString();
    const previewUrl = image.thumb_url || image.image_url;
    const payload = {
      id: artifactId,
      artifact_id: artifactId,
      type: "image",
      type_name: "image",
      prompt: image.prompt,
      image_url: image.image_url,
      thumb_url: image.thumb_url,
      preview_url: previewUrl,
      path: image.path,
      created_at: image.created_at,
      width: image.width,
      height: image.height,
      metadata: {
        prompt: image.prompt,
        filename: image.filename,
      },
    };

    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", image.image_url);
    e.dataTransfer.setData("text/uri-list", image.image_url);

    e.dataTransfer.setData(EmbeddrDnDTypes.ARTIFACT_ID, artifactId);
    e.dataTransfer.setData(EmbeddrDnDTypes.IMAGE_ID, artifactId);
    e.dataTransfer.setData(EmbeddrDnDTypes.ARTIFACT_TYPE, "image");
    e.dataTransfer.setData(EmbeddrDnDTypes.IMAGE_URL, image.image_url);
    e.dataTransfer.setData(EmbeddrDnDTypes.PREVIEW_URL, previewUrl);
    e.dataTransfer.setData(EmbeddrDnDTypes.ARTIFACT, JSON.stringify(payload));
    if (image.path) {
      e.dataTransfer.setData(EmbeddrDnDTypes.ARTIFACT_PATH, image.path);
    }

    e.dataTransfer.setData("embeddr/id", artifactId);
    e.dataTransfer.setData("embeddr/json", JSON.stringify(payload));
  };

  return (
    <ScrollArea className="h-full" type="always" viewportRef={scrollRef}>
      <div
        className="grid gap-1  pr-3"
        style={{
          gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
        }}
      >
        {images.map((image) => (
          <div
            key={image.id}
            className={`relative rounded-md aspect-square group cursor-pointer overflow-hidden border bg-muted ${
              selectedId === image.id ? "border-2 border-primary" : ""
            }`}
            onContextMenu={(e) => {
              e.preventDefault();
              onRightClick(image);
            }}
            onClick={() => onSelect?.(image)}
            draggable
            onDragStart={(e) => handleDragStart(e, image)}
          >
            <AuthorizedImage
              src={`${image.thumb_url || image.image_url}`}
              alt={image.prompt}
              className={cn(
                "w-full h-full transition-transform group-hover:scale-105",
                imagePreviewContain ? "object-contain" : "object-cover",
              )}
              apiKey={apiKey}
            />
            <div className="absolute inset-0  flex flex-col justify-between p-2">
              <div className="flex justify-end">
                {onSimilarSearch && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className=" text-white hover:bg-white/20 opacity-0 group-hover:opacity-100  transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSimilarSearch(image.id);
                    }}
                    title="Find similar images"
                  >
                    <Eye className="" />
                  </Button>
                )}
              </div>
              {image.prompt && <PenLineIcon className="w-4 h-4" />}
            </div>
          </div>
        ))}

        <div ref={observerTarget} className="h-4 w-full col-span-full" />
      </div>
    </ScrollArea>
  );
}
