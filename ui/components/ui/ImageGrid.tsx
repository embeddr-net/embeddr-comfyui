import React, { useEffect, useRef } from "react";
import { ScrollArea } from "@embeddr/react-ui/components/scroll-area";
import { Eye, PenLineIcon } from "lucide-react";
import { Button } from "@embeddr/react-ui/components/button";
import { cn } from "@embeddr/react-ui/lib/utils";

import type { PromptImageRead } from "@hooks/useEmbeddrApi";

interface ImageGridProps {
    images: Array<PromptImageRead>;
    loading: boolean;
    hasMore: boolean;
    onLoadMore: () => void;
    onSelect?: (image: PromptImageRead) => void;
    onSimilarSearch?: (imageId: number) => void;
    selectedId?: number;
    gridSize?: number;
    imagePreviewContain?: boolean;
}

export function ImageGrid({
    images,
    loading,
    hasMore,
    onLoadMore,
    onSelect,
    onSimilarSearch,
    selectedId,
    gridSize = 3,
    imagePreviewContain = true,
}: ImageGridProps) {
    const observerTarget = useRef(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loading) {
                    onLoadMore();
                }
            },
            { threshold: 0, rootMargin: "200px" }
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

    const handleDragStart = (e: React.DragEvent, imageUrl: string) => {
        e.dataTransfer.setData("text/plain", imageUrl);
        e.dataTransfer.setData("text/uri-list", imageUrl);
    };

    return (
        <ScrollArea className="h-full" type="always">
            <div
                className="grid gap-1 p-0 pr-3"
                style={{
                    gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
                }}
            >
                {images.map((image) => (
                    <div
                        key={image.id}
                        className={`relative aspect-square group cursor-pointer overflow-hidden border bg-muted ${
                            selectedId === image.id
                                ? "border-2 border-primary"
                                : ""
                        }`}
                        onClick={() => onSelect?.(image)}
                        draggable
                        onDragStart={(e) => handleDragStart(e, image.image_url)}
                    >
                        <img
                            src={`${image.thumb_url || image.image_url}`}
                            alt={image.prompt}
                            className={cn(
                                "w-full h-full transition-transform group-hover:scale-105",
                                imagePreviewContain
                                    ? "object-contain"
                                    : "object-cover"
                            )}
                            loading="lazy"
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
                            {image.prompt && (
                                <PenLineIcon className="w-4 h-4" />
                            )}
                        </div>
                    </div>
                ))}

                <div
                    ref={observerTarget}
                    className="h-4 w-full col-span-full"
                />
            </div>
        </ScrollArea>
    );
}
