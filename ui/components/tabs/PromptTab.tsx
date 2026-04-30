import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Bot, Loader2, Send, Wrench } from "lucide-react";
import {
  Button,
  Card,
  Input,
  Label,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@embeddr/react-ui/components/ui";

type ChatMessage = {
  id?: string;
  role: "user" | "assistant" | "error";
  content: string;
};

type LlmProvider = {
  id: string;
  name?: string;
};

type LlmModel = {
  id: string;
  name?: string;
  provider_id?: string;
};

interface PromptTabProps {
  endpoint: string;
  apiKey?: string;
  onOpenDocs: () => void;
}

const POLL_INTERVAL_MS = 1200;
const MAX_POLL_ATTEMPTS = 120;

const withApiPrefix = (endpoint: string, path: string) => {
  const cleanEndpoint = endpoint.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (cleanEndpoint.endsWith("/api/v1")) {
    return `${cleanEndpoint}${cleanPath}`;
  }
  return `${cleanEndpoint}/api/v1${cleanPath}`;
};

const getHeaders = (apiKey?: string) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey?.trim()) {
    headers["X-API-Key"] = apiKey.trim();
  }
  return headers;
};

async function jsonRequest<T = any>(
  endpoint: string,
  path: string,
  init: RequestInit = {},
  apiKey?: string,
): Promise<T> {
  const url = withApiPrefix(endpoint, path);
  const res = await fetch(url, {
    ...init,
    headers: {
      ...getHeaders(apiKey),
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export function PromptTab({ endpoint, apiKey, onOpenDocs }: PromptTabProps) {
  const [checkingPlugin, setCheckingPlugin] = useState(true);
  const [hasLlmPlugin, setHasLlmPlugin] = useState(false);
  const [pluginCheckError, setPluginCheckError] = useState<string | null>(null);

  const [providers, setProviders] = useState<Array<LlmProvider>>([]);
  const [models, setModels] = useState<Array<LlmModel>>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("auto");
  const [selectedModel, setSelectedModel] = useState<string>("auto");

  const [systemPrompt, setSystemPrompt] = useState("");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Array<ChatMessage>>([]);
  const [isSending, setIsSending] = useState(false);

  const selectedProviderModels = useMemo(() => {
    if (selectedProviderId === "auto") {
      return models;
    }
    return models.filter((model) => model.provider_id === selectedProviderId);
  }, [models, selectedProviderId]);

  const refreshPluginState = useCallback(async () => {
    if (!endpoint) {
      setCheckingPlugin(false);
      setHasLlmPlugin(false);
      setPluginCheckError("No API endpoint configured.");
      return;
    }
    setCheckingPlugin(true);
    setPluginCheckError(null);
    try {
      const data = await jsonRequest<any>(endpoint, "/plugins", {}, apiKey);
      const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      const found = list.some((plugin: any) => {
        const id = String(plugin?.id || plugin?.plugin_id || "");
        return id === "embeddr-llm";
      });
      setHasLlmPlugin(found);
    } catch (e: any) {
      setHasLlmPlugin(false);
      setPluginCheckError(e?.message || "Failed to check installed plugins.");
    } finally {
      setCheckingPlugin(false);
    }
  }, [endpoint, apiKey]);

  const loadProvidersAndModels = useCallback(async () => {
    if (!hasLlmPlugin) return;
    try {
      const [providerRes, modelRes] = await Promise.all([
        jsonRequest<any>(endpoint, "/plugins/embeddr-llm/providers", {}, apiKey),
        jsonRequest<any>(endpoint, "/plugins/embeddr-llm/models", {}, apiKey),
      ]);

      const providerList = Array.isArray(providerRes?.data)
        ? providerRes.data
        : Array.isArray(providerRes)
          ? providerRes
          : [];
      const modelList = Array.isArray(modelRes?.data)
        ? modelRes.data
        : Array.isArray(modelRes)
          ? modelRes
          : [];

      setProviders(providerList);
      setModels(modelList);
    } catch {
      setProviders([]);
      setModels([]);
    }
  }, [endpoint, apiKey, hasLlmPlugin]);

  useEffect(() => {
    refreshPluginState();
  }, [refreshPluginState]);

  useEffect(() => {
    loadProvidersAndModels();
  }, [loadProvidersAndModels]);

  const runChat = useCallback(async () => {
    const text = prompt.trim();
    if (!text || isSending || !hasLlmPlugin) return;

    const pendingId = `pending-${Date.now()}`;
    setPrompt("");
    setIsSending(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { id: pendingId, role: "assistant", content: "Thinking..." },
    ]);

    try {
      const execution = await jsonRequest<any>(
        endpoint,
        "/executions",
        {
          method: "POST",
          body: JSON.stringify({
            plugin_name: "embeddr-llm",
            job_type: "llm.respond",
            inputs: {
              prompt: text,
              system_prompt: systemPrompt.trim() || undefined,
              provider_id: selectedProviderId !== "auto" ? selectedProviderId : undefined,
              model: selectedModel !== "auto" ? selectedModel : undefined,
            },
          }),
        },
        apiKey,
      );

      const executionId = execution?.id;
      if (!executionId) {
        throw new Error("No execution id returned.");
      }

      let assistantText = "";
      let failedText = "";

      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const job = await jsonRequest<any>(
          endpoint,
          `/executions/${executionId}`,
          { method: "GET" },
          apiKey,
        );

        if (job?.status === "completed") {
          assistantText =
            job?.outputs?.response_text ||
            job?.outputs?.response ||
            job?.outputs?.text ||
            JSON.stringify(job?.outputs || {}, null, 2);
          break;
        }

        if (job?.status === "failed") {
          failedText = job?.error || job?.message || "LLM execution failed.";
          break;
        }
      }

      if (assistantText) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === pendingId ? { role: "assistant", content: assistantText } : message,
          ),
        );
      } else if (failedText) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === pendingId ? { role: "error", content: failedText } : message,
          ),
        );
      } else {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === pendingId
              ? {
                  role: "error",
                  content: "Timed out while waiting for LLM response.",
                }
              : message,
          ),
        );
      }
    } catch (e: any) {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === pendingId
            ? { role: "error", content: e?.message || "Failed to send prompt." }
            : message,
        ),
      );
    } finally {
      setIsSending(false);
    }
  }, [
    apiKey,
    endpoint,
    hasLlmPlugin,
    isSending,
    prompt,
    selectedModel,
    selectedProviderId,
    systemPrompt,
  ]);

  if (checkingPlugin) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Checking LLM plugin...
      </div>
    );
  }

  if (!hasLlmPlugin) {
    return (
      <div className="flex-1 p-3">
        <Card className="h-full p-4 flex flex-col gap-3 justify-center">
          <div className="flex items-center gap-2 text-foreground">
            <Wrench className="w-4 h-4" />
            <span className="font-medium">LLM chat is not available</span>
          </div>
          <p className="text-sm text-muted-foreground">
            This tab needs the <strong>embeddr-llm</strong> plugin installed and enabled on your
            configured instance.
          </p>
          {pluginCheckError ? (
            <div className="text-xs text-amber-500 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {pluginCheckError}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={refreshPluginState}>
              Re-check
            </Button>
            <Button size="sm" onClick={onOpenDocs}>
              Open docs
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 p-2 pt-0 flex flex-col gap-2 min-h-0">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Provider</Label>
          <Select
            value={selectedProviderId}
            onValueChange={(value) => setSelectedProviderId(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Auto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              {providers.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.name || provider.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Model</Label>
          <Select value={selectedModel} onValueChange={(value) => setSelectedModel(value)}>
            <SelectTrigger>
              <SelectValue placeholder="Auto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              {selectedProviderModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name || model.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label>System prompt (optional)</Label>
        <Textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="You are a concise assistant..."
          rows={3}
        />
      </div>

      <Card className="flex-1 min-h-0 p-0 overflow-hidden">
        <ScrollArea className="h-full p-3">
          <div className="space-y-2">
            {messages.length === 0 ? (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Bot className="w-4 h-4" />
                Start chatting with your configured LLM plugin.
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={[
                    "rounded-md border p-2 text-sm whitespace-pre-wrap break-words",
                    message.role === "user"
                      ? "bg-primary/10 border-primary/30"
                      : message.role === "assistant"
                        ? "bg-muted/30 border-border"
                        : "bg-destructive/10 border-destructive/30 text-destructive",
                  ].join(" ")}
                >
                  {message.content}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </Card>

      <div className="flex gap-2">
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              runChat();
            }
          }}
          placeholder="Ask something..."
          disabled={isSending}
        />
        <Button onClick={runChat} disabled={isSending || !prompt.trim()}>
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
