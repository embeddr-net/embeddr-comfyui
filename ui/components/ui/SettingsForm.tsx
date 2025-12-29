import React from "react";
import { Input } from "@embeddr/react-ui/components/input";
import { Label } from "@embeddr/react-ui/components/label";
import { Button } from "@embeddr/react-ui/components/button";
import { Slider } from "@embeddr/react-ui/components/slider";
import { Switch } from "@embeddr/react-ui/components/switch";

import { Cloud, Moon, Server, Sun } from "lucide-react";
// @ts-ignore
import { app } from "../../../../scripts/app.js";
import type { ApiMode } from "@hooks/useEmbeddrApi";

interface SettingsFormProps {
    endpoint: string;
    setEndpoint: (endpoint: string) => void;
    mode: ApiMode;
    setMode: (mode: ApiMode) => void;
    gridSize: number;
    setGridSize: (size: number) => void;
    gridPreviewContain: boolean;
    setGridPreviewContain: (contain: boolean) => void;
    theme: string;
    setTheme: (theme: string) => void;
    onSave: () => void;
}

export function SettingsForm({
    endpoint,
    setEndpoint,
    mode,
    setMode,
    gridSize,
    setGridSize,
    gridPreviewContain,
    setGridPreviewContain,
    theme,
    setTheme,
    onSave,
}: SettingsFormProps) {
    return (
        <div className="space-y-4 p-2">
            <div className="space-y-2">
                <div className="flex gap-2">
                    <Button
                        variant={mode !== "local" ? "default" : "outline"}
                        className="flex-1"
                        onClick={() => {
                            app.extensionManager.toast.addAlert(
                                "Cloud Coming Soon!"
                            );
                        }}
                    >
                        <Cloud className="w-4 h-4 mr-2" />
                        Cloud
                    </Button>
                    <Button
                        variant={mode === "local" ? "default" : "outline"}
                        className="flex-1"
                        onClick={() => {
                            setMode("local");
                            if (endpoint === "") {
                                setEndpoint("http://localhost:8003/api/v1");
                            }
                        }}
                    >
                        <Server className="w-4 h-4 mr-2" />
                        Local
                    </Button>
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="endpoint">API Endpoint</Label>
                <Input
                    id="endpoint"
                    placeholder={"http://localhost:8003"}
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                    {mode !== "local"
                        ? "Change this if you are using a self-hosted instance or development server."
                        : "The URL of your local Embeddr instance."}
                </p>
            </div>

            <div className="space-y-2">
                <Label htmlFor="grid-size">Grid Columns</Label>
                <div className="flex items-center gap-4">
                    <Slider
                        id="grid-size"
                        min={1}
                        max={10}
                        defaultValue={[gridSize]}
                        step={1}
                        onValueChange={(value) => setGridSize(value[0])}
                    />{" "}
                    <span className="w-6 text-right">{gridSize}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                    Number of columns in the image grid.
                </p>
            </div>
            <div className="space-y-2">
                <Label htmlFor="grid-preview-contain">
                    Grid Preview Contain
                </Label>
                <div className="flex items-center gap-4">
                    <Switch
                        id="grid-preview-contain"
                        className="mx-2"
                        checked={gridPreviewContain}
                        onCheckedChange={(value) =>
                            setGridPreviewContain(value)
                        }
                    />
                    <span className="w-6 text-right">
                        {gridPreviewContain ? "Contain" : "Cover"}
                    </span>
                </div>
                <p className="text-xs text-muted-foreground">
                    Switch between contain and cover for image previews.
                </p>
            </div>
            <div className="space-y-2">
                <Label htmlFor="theme-mode">Theme</Label>
                <div className="flex items-center gap-4">
                    <Switch
                        id="theme-mode"
                        className="mx-2"
                        checked={theme === "dark"}
                        onCheckedChange={(checked) =>
                            setTheme(checked ? "dark" : "light")
                        }
                    />
                    <span className="flex items-center gap-2 text-sm">
                        {theme === "dark" ? (
                            <>
                                <Moon className="w-4 h-4" /> Dark
                            </>
                        ) : (
                            <>
                                <Sun className="w-4 h-4" /> Light
                            </>
                        )}
                    </span>
                </div>
            </div>

            <Button onClick={onSave} className="w-full">
                Save Settings
            </Button>
        </div>
    );
}
