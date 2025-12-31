import React, { useState, useEffect } from "react";
import { cn } from "@embeddr/react-ui/lib/utils";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@embeddr/react-ui/components/tabs";
import { useExternalNav } from "@embeddr/react-ui";
import { GlobeIcon, MessageCircleIcon, Search, Settings } from "lucide-react";
import { Button } from "@embeddr/react-ui/components/button";
import { SettingsForm } from "../tabs/SettingsForm";
import { useEmbeddrApi } from "@hooks/useEmbeddrApi";
import { ExploreTab } from "../tabs/ExploreTab";

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

  const { openExternal } = useExternalNav();

  const [activeTab, setActiveTab] = useState("explore");

  const [searchQuery] = useState("");
  const [viewMode] = useState<"all" | "mine">("all");
  const [selectedLibrary] = useState<string>("all");

  // Initial fetch and refetch on change
  useEffect(() => {
    if (configLoaded) {
      const libId =
        selectedLibrary === "all" ? null : parseInt(selectedLibrary);
      fetchImages(true, searchQuery, viewMode, libId, similarImageId);
    }
  }, [viewMode, configLoaded, selectedLibrary, mode, similarImageId]);

  const handleSave = async () => {
    await saveSettings(endpoint, mode, gridSize, gridPreviewContain);
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
            <TabsList className="flex gap-1 w-full justify-start">
              <TabsTrigger
                value="explore"
                className="max-w-fit items-center gap-2"
              >
                <Search className="w-4 h-4" />
              </TabsTrigger>
              <TabsTrigger
                value="prompt"
                className="max-w-fit items-center gap-2"
              >
                <MessageCircleIcon className="w-4 h-4" />
              </TabsTrigger>
            </TabsList>
            <Button
              variant="link"
              size="icon"
              className={cn(
                "ml-auto",
                activeTab === "settings" ? "bg-primary/50" : ""
              )}
              onClick={() => setActiveTab("settings")}
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto"
              onClick={() => openExternal(endpoint)}
            >
              <GlobeIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <TabsContent value="explore" className="flex-1  p-0 m-0 flex flex-col">
          <ExploreTab
            images={images}
            loading={loading}
            hasMore={hasMore}
            fetchImages={fetchImages}
            libraries={libraries}
            similarImageId={similarImageId}
            setSimilarImageId={setSimilarImageId}
            mode={mode}
            gridSize={gridSize}
            gridPreviewContain={gridPreviewContain}
            configLoaded={configLoaded}
            activeTab={activeTab}
          />
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
