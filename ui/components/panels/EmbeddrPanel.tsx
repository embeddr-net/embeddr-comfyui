import React, { useEffect, useState } from "react";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@embeddr/react-ui/components/tabs";
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from "@embeddr/react-ui/components/resizable";
import { GlobeIcon, Search, Settings } from "lucide-react";
import { Button } from "@embeddr/react-ui/components/button";
import { SettingsForm } from "@components/ui/SettingsForm";
import { ImageGrid } from "@components/ui/ImageGrid";
import { useEmbeddrApi } from "@hooks/useEmbeddrApi";
import { useNodeScanner } from "@hooks/useNodeScanner";
// @ts-ignore
import { app } from "../../../../scripts/app.js";
import { ImageDetails } from "./ImageDetails";
import { SearchBar } from "./SearchBar";
import type { PromptImageRead } from "@hooks/useEmbeddrApi";

export default function EmbeddrPanel() {
    const {
        endpoint,
        setEndpoint,
        mode,
        setMode,
        gridSize,
        setGridSize,
        images,
        loading,
        hasMore,
        fetchImages,
        saveSettings,
        configLoaded,
        gridPreviewContain,
        setGridPreviewContain,
        libraries,
        similarImageId,
        setSimilarImageId,
        theme,
        setTheme,
    } = useEmbeddrApi();

    const { targetNodes, handleLoadIntoNode, handleUseImage } =
        useNodeScanner();

    const [activeTab, setActiveTab] = useState("explore");
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<"all" | "mine">("all");
    const [selectedLibrary, setSelectedLibrary] = useState<string>("all");
    const [selectedImage, setSelectedImage] = useState<PromptImageRead | null>(
        null
    );

    // Initial fetch
    useEffect(() => {
        if (configLoaded) {
            const libId =
                selectedLibrary === "all" ? null : parseInt(selectedLibrary);
            fetchImages(true, searchQuery, viewMode, libId, similarImageId);
        }
    }, [viewMode, configLoaded, selectedLibrary, mode, similarImageId]); // Re-fetch when view mode changes or config is loaded

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const libId =
            selectedLibrary === "all" ? null : parseInt(selectedLibrary);
        fetchImages(true, searchQuery, viewMode, libId, similarImageId);
    };

    const handleSave = async () => {
        const success = await saveSettings(
            endpoint,
            mode,
            gridSize,
            gridPreviewContain
        );
        if (success) {
            const libId =
                selectedLibrary === "all" ? null : parseInt(selectedLibrary);
            fetchImages(true, searchQuery, viewMode, libId, similarImageId);
        }
    };

    return (
        <div
            className="flex flex-col h-full text-foreground"
            style={{ contain: "none" }}
        >
            <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="flex-1 flex flex-col overflow-hidden gap-0!"
            >
                <div className="pt-2 flex flex-col gap-2 p-2 pb-0!">
                    <div className="flex items-center gap-2">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger
                                value="explore"
                                className="flex items-center gap-2"
                            >
                                <Search className="w-4 h-4" /> Explore
                            </TabsTrigger>
                            <TabsTrigger
                                value="settings"
                                className="flex items-center gap-2"
                            >
                                <Settings className="w-4 h-4" />
                            </TabsTrigger>
                        </TabsList>
                        <a href={endpoint} target="_blank" rel="noreferrer">
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="ml-auto"
                                onClick={() =>
                                    app.extensionManager?.openExternalLink()
                                }
                            >
                                <GlobeIcon className="w-4 h-4" />
                            </Button>
                        </a>
                    </div>

                    {activeTab === "explore" && (
                        <SearchBar
                            searchQuery={searchQuery}
                            setSearchQuery={setSearchQuery}
                            onSearch={handleSearch}
                            loading={loading}
                            similarImageId={similarImageId}
                            setSimilarImageId={setSimilarImageId}
                            mode={mode}
                            selectedLibrary={selectedLibrary}
                            setSelectedLibrary={setSelectedLibrary}
                            libraries={libraries}
                            viewMode={viewMode}
                            setViewMode={setViewMode}
                        />
                    )}
                </div>

                <TabsContent
                    value="explore"
                    className="flex-1 overflow-hidden p-2 pt-0! m-0 flex flex-col mt-2"
                >
                    {configLoaded ? (
                        <ResizablePanelGroup orientation="vertical">
                            <ResizablePanel
                                defaultSize={70}
                                minSize={30}
                                className="mb-1"
                            >
                                <ImageGrid
                                    images={images}
                                    loading={loading}
                                    hasMore={hasMore}
                                    gridSize={gridSize}
                                    imagePreviewContain={gridPreviewContain}
                                    onLoadMore={() => {
                                        const libId =
                                            selectedLibrary === "all"
                                                ? null
                                                : parseInt(selectedLibrary);
                                        fetchImages(
                                            false,
                                            searchQuery,
                                            viewMode,
                                            libId,
                                            similarImageId
                                        );
                                    }}
                                    onSelect={setSelectedImage}
                                    onSimilarSearch={setSimilarImageId}
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
                </TabsContent>

                <TabsContent value="settings" className="flex-1 overflow-auto">
                    <SettingsForm
                        gridPreviewContain={gridPreviewContain}
                        setGridPreviewContain={setGridPreviewContain}
                        endpoint={endpoint}
                        setEndpoint={setEndpoint}
                        mode={mode}
                        setMode={setMode}
                        gridSize={gridSize}
                        setGridSize={setGridSize}
                        theme={theme}
                        setTheme={setTheme}
                        onSave={handleSave}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}
