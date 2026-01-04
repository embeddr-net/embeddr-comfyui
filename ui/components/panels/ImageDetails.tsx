import React, { useState } from "react";
import { Button } from "@embeddr/react-ui/components/button";
import { ScrollArea } from "@embeddr/react-ui/components/scroll-area";
import { ArrowBigRightDashIcon, Check, Copy, Plus } from "lucide-react";
import type { PromptImageRead } from "@hooks/useEmbeddrApi";
import type { TargetNode } from "@hooks/useNodeScanner";

interface ImageDetailsProps {
  selectedImage: PromptImageRead;
  targetNodes: Array<TargetNode>;
  onLoadIntoNode: (nodeId: number, imageUrl: string) => void;
  onUseImage: (imageUrl: string) => void;
}

export function ImageDetails({
  selectedImage,
  targetNodes,
  onLoadIntoNode,
  onUseImage,
}: ImageDetailsProps) {
  const [copied, setCopied] = useState(false);

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
            <img
              src={selectedImage.thumb_url || selectedImage.image_url}
              alt="Selected"
              className="w-full h-full object-cover"
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

          {selectedImage.prompt && (
            <div className="text-xs text-muted-foreground bg-background border p-2 whitespace-pre-wrap">
              {selectedImage.prompt}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
