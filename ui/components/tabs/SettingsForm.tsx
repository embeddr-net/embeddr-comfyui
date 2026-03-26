import React, { useCallback, useEffect, useState } from "react";
import { Input } from "@embeddr/react-ui/components/ui";
import { Label } from "@embeddr/react-ui/components/ui";
import { Button } from "@embeddr/react-ui/components/ui";
import { Badge } from "@embeddr/react-ui/components/ui";
import { Slider } from "@embeddr/react-ui/components/ui";
import { Switch } from "@embeddr/react-ui/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@embeddr/react-ui/components/ui";

import { Moon, Server, Sun, Shield, LogOut, User } from "lucide-react";
import { createEmbeddrOAuth } from "@embeddr/client-typescript";
import { proxyFetch } from "../../utils/proxyFetch";
import type { ApiMode } from "@hooks/useEmbeddrApi";
import { useThemePacks } from "@hooks/useThemePacks";

const OAUTH_CLIENT_ID = "embeddr:comfyui";

/* ── Embeddr Connection (OAuth or manual key) ── */

function EmbeddrConnectionSection({
  endpoint,
  apiKey,
  setApiKey,
}: {
  endpoint: string;
  apiKey: string;
  setApiKey?: (key: string) => void;
}) {
  const [profile, setProfile] = useState<{
    username: string;
    display_name: string | null;
    operator_name: string | null;
    instance_name: string;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [showManualKey, setShowManualKey] = useState(false);

  // Check connection on mount and when apiKey changes
  const checkConnection = useCallback(async () => {
    if (!apiKey) {
      setProfile(null);
      return;
    }
    setChecking(true);
    try {
      const apiBase = endpoint.replace(/\/+$/, "");
      const [whoamiRes, publicRes] = await Promise.all([
        proxyFetch(`${apiBase}/api/security/whoami`),
        proxyFetch(`${apiBase}/api/system/public`),
      ]);
      if (whoamiRes.ok) {
        const data = await whoamiRes.json();
        let instanceName = "Embeddr";
        if (publicRes.ok) {
          const pub = await publicRes.json();
          instanceName = pub.instance?.name || instanceName;
        }
        setProfile({
          username: data.user?.username || "",
          display_name: data.user?.display_name || null,
          operator_name: data.operator?.display_name || data.operator?.name || null,
          instance_name: instanceName,
        });
      } else {
        setProfile(null);
      }
    } catch {
      setProfile(null);
    } finally {
      setChecking(false);
    }
  }, [apiKey]);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;

    const oauth = createEmbeddrOAuth({
      embeddrUrl: endpoint,
      clientId: OAUTH_CLIENT_ID,
    });

    oauth
      .handleCallback(window.location.search)
      .then((token) => {
        if (setApiKey) setApiKey(token.access_token);
        localStorage.setItem("embeddr_api_key", token.access_token);
        // Save to server config too
        fetch("/embeddr/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: token.access_token }),
        }).catch(() => {});
        // Clean URL
        window.history.replaceState({}, "", window.location.pathname);
      })
      .catch((e) => {
        console.error("OAuth callback failed:", e);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOAuthConnect = async () => {
    console.log("[Embeddr] OAuth connect clicked", { endpoint });
    try {
      const oauth = createEmbeddrOAuth({
        embeddrUrl: endpoint,
        clientId: OAUTH_CLIENT_ID,
      });
      console.log("[Embeddr] Starting OAuth flow to", endpoint);
      await oauth.startAuthFlow({
        scopes: [
          "artifacts:read",
          "artifacts:write",
          "collections:read",
          "collections:write",
          "executions:read",
          "executions:write",
          "plugins:read",
          "config:read",
          "themes:read",
          "lotus:dispatch",
          "lotus:list",
        ],
        redirectUri: window.location.origin + window.location.pathname,
      });
    } catch (e) {
      console.error("[Embeddr] OAuth flow error:", e);
    }
  };

  const handleDisconnect = () => {
    if (setApiKey) setApiKey("");
    localStorage.removeItem("embeddr_api_key");
    setProfile(null);
    fetch("/embeddr/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: "" }),
    }).catch(() => {});
  };

  const displayName = profile?.display_name || profile?.username || "";
  const initials = displayName.slice(0, 2).toUpperCase() || "?";

  return (
    <div className="space-y-2">
      <Label>Embeddr Connection</Label>
      {profile ? (
        <div className="rounded-md border p-3 space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-semibold text-primary">
                {initials}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium truncate">{displayName}</div>
              <div className="text-[10px] text-muted-foreground truncate">
                {profile.operator_name && (
                  <span>{profile.operator_name} &middot; </span>
                )}
                {profile.instance_name}
              </div>
            </div>
            <Badge variant="outline" className="text-[9px] shrink-0">
              connected
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={handleDisconnect}
          >
            <LogOut className="h-3 w-3 mr-1.5" />
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-3 space-y-2">
          <Button
            className="w-full"
            onClick={handleOAuthConnect}
            disabled={checking || !endpoint}
          >
            <Shield className="h-4 w-4 mr-2" />
            {checking ? "Checking..." : "Connect to Embeddr"}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            Opens Embeddr to approve access for this ComfyUI instance.
          </p>
          {showManualKey && (
            <div className="space-y-1 pt-1 border-t">
              <p className="text-[10px] text-muted-foreground">
                Or enter an API key manually:
              </p>
              <Input
                type="password"
                placeholder="em_..."
                value={apiKey}
                onChange={(e) => setApiKey && setApiKey(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
          )}
          {!showManualKey && (
            <button
              type="button"
              className="text-[10px] text-muted-foreground underline w-full text-center"
              onClick={() => setShowManualKey(true)}
            >
              Use API key instead
            </button>
          )}
        </div>
      )}
    </div>
  );
}

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
  apiKey?: string;
  setApiKey?: (key: string) => void;
  apiBase: string;
  themePackId: string;
  setThemePackId: (value: string) => void;
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
  apiKey = "",
  setApiKey,
  apiBase,
  themePackId,
  setThemePackId,
  onSave,
}: SettingsFormProps) {
  const { packs, isLoading } = useThemePacks(apiBase, Boolean(apiBase));
  const hasPacks = packs.length > 0;

  return (
    <div className="space-y-4 p-2">
      <div className="space-y-2">
        <div className="flex gap-2">
          <Button
            variant={mode === "local" ? "default" : "outline"}
            className="flex-1"
            onClick={() => {
              setMode("local");
              if (endpoint === "") {
                setEndpoint("http://localhost:8003");
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

      <EmbeddrConnectionSection
        endpoint={endpoint}
        apiKey={apiKey}
        setApiKey={setApiKey}
      />

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
        <Label htmlFor="grid-preview-contain">Grid Preview Contain</Label>
        <div className="flex items-center gap-4">
          <Switch
            id="grid-preview-contain"
            className="mx-2"
            checked={gridPreviewContain}
            onCheckedChange={(value) => setGridPreviewContain(value)}
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
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
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

      <div className="space-y-2">
        <Label htmlFor="theme-pack">Theme Pack</Label>
        <Select
          value={themePackId || "default"}
          onValueChange={(value) =>
            setThemePackId(value === "default" ? "" : value)
          }
          disabled={isLoading || !hasPacks}
        >
          <SelectTrigger id="theme-pack">
            <SelectValue
              placeholder={isLoading ? "Loading..." : "Select theme pack"}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default</SelectItem>
            {packs.map((pack) => (
              <SelectItem key={pack.id} value={pack.id}>
                {pack.name || pack.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Theme packs apply token overrides and optional CSS.
        </p>
      </div>

      <Button onClick={onSave} className="w-full">
        Save Settings
      </Button>
    </div>
  );
}
