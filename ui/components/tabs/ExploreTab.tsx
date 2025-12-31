import React, { useEffect, useRef, useState } from "react";
import { useImageDialog } from "@embeddr/react-ui";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@embeddr/react-ui/components/resizable";
import { Search } from "lucide-react";
import { ImageGrid } from "@components/ui/ImageGrid";
import { useNodeScanner } from "@hooks/useNodeScanner";
import { ImageDetails } from "../panels/ImageDetails";
import { SearchBar } from "../ui/SearchBar";
import type {
  PromptImageRead,
  LibraryPath,
  ApiMode,
} from "@hooks/useEmbeddrApi";

interface ExploreTabProps {
  images: PromptImageRead[];
  loading: boolean;
  hasMore: boolean;
  fetchImages: (
    reset?: boolean,
    query?: string,
    viewMode?: "all" | "mine",
    libId?: number | null,
    similarId?: number | null
  ) => Promise<void>;
  libraries: LibraryPath[];
  similarImageId: number | null;
  setSimilarImageId: (id: number | null) => void;
  mode: ApiMode;
  gridSize: number;
  gridPreviewContain: boolean;
  configLoaded: boolean;
  activeTab: string;
}

export function ExploreTab({
  images,
  loading,
  hasMore,
  fetchImages,
  libraries,
  similarImageId,
  setSimilarImageId,
  mode,
  gridSize,
  gridPreviewContain,
  configLoaded,
  activeTab,
}: ExploreTabProps) {
  const { targetNodes, handleLoadIntoNode, handleUseImage } = useNodeScanner();
  const { openImage, closeImage, setGalleryImages, currentGallery } =
    useImageDialog();

  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"all" | "mine">("all");
  const [selectedLibrary, setSelectedLibrary] = useState<string>("all");
  const [selectedImage, setSelectedImage] = useState<PromptImageRead | null>(
    null
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialFetch = useRef(false);

  // Initial fetch
  useEffect(() => {
    if (!configLoaded) return;
    if (didInitialFetch.current) return;
    didInitialFetch.current = true;
    const libId = selectedLibrary === "all" ? null : parseInt(selectedLibrary);
    fetchImages(true, searchQuery, viewMode, libId, similarImageId);
  }, [viewMode, configLoaded, selectedLibrary, mode, similarImageId]); // Re-fetch when view mode changes or config is loaded

  // Sync images to lightbox when they change
  useEffect(() => {
    if (currentGallery?.id === "virtual-gallery" && images.length > 0) {
      const galleryImages = images.map((p) => ({
        src: p.image_url,
        title: p.prompt,
        metadata: p,
      }));
      const totalImages = hasMore ? images.length + 100 : images.length;
      setGalleryImages(galleryImages, true, undefined, totalImages);
    }
  }, [images, currentGallery?.id, setGalleryImages, hasMore]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const libId = selectedLibrary === "all" ? null : parseInt(selectedLibrary);
    fetchImages(true, searchQuery, viewMode, libId, similarImageId);
  };

  return (
    <div className="flex-1  p-2 pt-0! m-0 flex flex-col mt-2 h-full">
      <div className="pb-2">
        <SearchBar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onSearch={handleSearch}
          loading={loading}
          similarImageId={similarImageId}
          setSimilarImageId={(id) => {
            setSimilarImageId(id);
            if (!id) {
              scrollRef.current?.scrollTo({ top: 0 });
            }
          }}
          mode={mode}
          selectedLibrary={selectedLibrary}
          setSelectedLibrary={setSelectedLibrary}
          libraries={libraries}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />
      </div>

      {configLoaded ? (
        <ResizablePanelGroup orientation="vertical">
          <ResizablePanel defaultSize={70} minSize={30} className="mb-1">
            <ImageGrid
              images={images}
              loading={loading}
              hasMore={hasMore}
              gridSize={gridSize}
              imagePreviewContain={gridPreviewContain}
              scrollRef={scrollRef}
              onRightClick={(e) => {
                setSelectedImage(e);
              }}
              onLoadMore={() => {
                const libId =
                  selectedLibrary === "all" ? null : parseInt(selectedLibrary);
                fetchImages(
                  false,
                  searchQuery,
                  viewMode,
                  libId,
                  similarImageId
                );
              }}
              onSimilarSearch={(image) => {
                setSimilarImageId(image);
              }}
              onSelect={(image) => {
                if (!image) return;
                const galleryImages = images.map((p) => ({
                  src: p.image_url,
                  title: p.prompt,
                  metadata: p,
                }));
                const index = images.findIndex((p) => p.id === image.id);
                const totalImages = hasMore
                  ? images.length + 100
                  : images.length;

                openImage(
                  image.image_url,
                  {
                    id: "virtual-gallery",
                    name:
                      activeTab === "explore" ? "Explore" : "Search Results",
                    images: galleryImages,
                    totalImages: totalImages,
                    fetchMore: async (_dir: any, _offset: any) => {
                      if (hasMore) {
                        const libId =
                          selectedLibrary === "all"
                            ? null
                            : parseInt(selectedLibrary);
                        await fetchImages(
                          false,
                          searchQuery,
                          viewMode,
                          libId,
                          similarImageId
                        );
                      }
                    },
                  },
                  index >= 0 ? index : 0,
                  [
                    {
                      id: "search-by-image",
                      icon: <Search className="w-4 h-4" />,
                      label: "Search by Image",
                      onClick: (galleryImage) => {
                        const img = galleryImage?.metadata as
                          | PromptImageRead
                          | undefined;
                        if (img) {
                          setSimilarImageId(img.id);
                        } else {
                          setSimilarImageId(image.id);
                        }
                        closeImage();
                      },
                    },
                  ],
                  image.prompt
                );
              }}
              selectedId={selectedImage?.id}
            />
          </ResizablePanel>
          {selectedImage && (
            <>
              <ResizableHandle className="mt-1" />
              <ResizablePanel
                defaultSize={30}
                minSize={20}
                className="flex flex-col gap-3 py-1 "
              >
                <ImageDetails
                  selectedImage={selectedImage}
                  targetNodes={targetNodes}
                  onUseImage={handleUseImage}
                  onLoadIntoNode={handleLoadIntoNode}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Loading configuration...
        </div>
      )}
    </div>
  );
}
