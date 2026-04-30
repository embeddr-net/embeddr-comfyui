import React, { useEffect, useState } from "react";
import { cn, useExternalNav, useImageDialog } from "@embeddr/react-ui";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@embeddr/react-ui/components/ui";
import { GlobeIcon, LayoutTemplate, MessageCircleIcon, Search, Settings } from "lucide-react";
import { useEmbeddrApi } from "@hooks/useEmbeddrApi";
import { SettingsForm } from "../tabs/SettingsForm";
import { ExploreTab } from "../tabs/ExploreTab";
import { PromptTab } from "../tabs/PromptTab";

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
    themePackId,
    setThemePackId,
    apiBase,
    apiClient,
    apiKey,
    setApiKey,
  } = useEmbeddrApi();

  const { openExternal } = useExternalNav();
  const { setApiKey: setDialogApiKey } = useImageDialog();

  useEffect(() => {
    if (setDialogApiKey && apiKey) {
      setDialogApiKey(apiKey);
    }
  }, [apiKey, setDialogApiKey]);

  const [activeTab, setActiveTab] = useState("explore");

  const [searchQuery] = useState("");
  const [viewMode] = useState<"all" | "mine">("all");
  const [selectedLibrary] = useState<string>("all");

  // Initial fetch and refetch on change
  useEffect(() => {
    if (configLoaded) {
      const libId = selectedLibrary === "all" ? null : parseInt(selectedLibrary);
      fetchImages(true, searchQuery, viewMode, libId, similarImageId);
    }
  }, [viewMode, configLoaded, selectedLibrary, mode, similarImageId]);

  const handleSave = async () => {
    await saveSettings(endpoint, mode, gridSize, gridPreviewContain, apiKey);
  };

  const dispatchShellEvent = (name: string, detail?: Record<string, unknown>) => {
    const targets: Array<Window> = [];
    console.log("[EmbeddrPanel] Dispatching event", name, detail);
    const addTarget = (target?: Window | null) => {
      if (!target) return;
      if (!targets.includes(target)) targets.push(target);
    };
    addTarget(window);
    try {
      addTarget(window.parent);
    } catch (e) {
      console.warn("[EmbeddrPanel] Unable to access window.parent", e);
    }
    try {
      addTarget(window.top);
    } catch (e) {
      console.warn("[EmbeddrPanel] Unable to access window.top", e);
    }

    targets.forEach((target) => {
      const event = new CustomEvent(name, { detail });
      console.log("[EmbeddrPanel] Sending event to target", target, event);
      target.dispatchEvent(event);
    });
  };

  return (
    <div className="flex flex-col h-full text-foreground" style={{ contain: "none" }}>
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col overflow-hidden gap-0!"
      >
        <div className="pt-2 flex flex-col gap-2 p-2 pb-0!">
          <div className="flex items-center gap-2">
            <TabsList className="flex gap-1 w-full justify-start">
              <TabsTrigger value="explore" className="max-w-fit items-center gap-2">
                <Search className="w-4 h-4" />
              </TabsTrigger>
              <TabsTrigger value="prompt" className="max-w-fit items-center gap-2">
                <MessageCircleIcon className="w-4 h-4" />
              </TabsTrigger>
            </TabsList>
            <Button
              variant="link"
              size="icon"
              title="Toggle Zen Shell"
              onClick={() => dispatchShellEvent("embeddr-toggle-shell")}
            >
              <LayoutTemplate className="w-4 h-4" />
            </Button>
            <Button
              variant="link"
              size="icon"
              className={cn("ml-auto", activeTab === "settings" ? "bg-primary/50" : "")}
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
            apiBase={endpoint}
            apiClient={apiClient}
            gridSize={gridSize}
            gridPreviewContain={gridPreviewContain}
            configLoaded={configLoaded}
            activeTab={activeTab}
            apiKey={apiKey}
          />
        </TabsContent>

        <TabsContent value="prompt" className="flex-1 p-0 m-0 flex flex-col">
          <PromptTab
            endpoint={endpoint}
            apiKey={apiKey}
            onOpenDocs={() => openExternal(`${endpoint.replace(/\/+$/, "")}/docs`)}
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
            apiKey={apiKey}
            setApiKey={setApiKey}
            apiBase={apiBase}
            themePackId={themePackId}
            setThemePackId={setThemePackId}
            onSave={handleSave}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
