import React, { useEffect, useState } from "react";
import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  ScrollArea,
} from "@embeddr/react-ui/components/ui";
import { Folder, Plus, Search } from "lucide-react";
import type { Collection } from "../../hooks/useEmbeddrCollections";

interface CollectionSelectorProps {
  collections: Array<Collection>;
  loading: boolean;
  onSelect: (collection: Collection) => void;
  fetchCollections: () => void;
  createCollection: (label: string) => Promise<boolean>;
  creating: boolean;
}

export function CollectionSelector({
  collections,
  loading,
  onSelect,
  fetchCollections,
  createCollection,
  creating,
}: CollectionSelectorProps) {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => {
    fetchCollections();
  }, []);

  const handleCreate = async () => {
    if (!newLabel.trim()) return;
    const success = await createCollection(newLabel);
    if (success) {
      setNewLabel("");
      setShowCreate(false);
    }
  };

  const filtered = collections.filter((c) =>
    (c.label || "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search collections..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button
          variant={showCreate ? "secondary" : "default"}
          onClick={() => setShowCreate(!showCreate)}
        >
          <Plus className="h-4 w-4 mr-2" />
          New
        </Button>
      </div>

      {showCreate && (
        <Card className="p-4 bg-muted/50 border-dashed">
          <h4 className="text-sm font-medium mb-2">Create New Collection</h4>
          <div className="flex gap-2">
            <Input
              placeholder="Collection Name"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </div>
        </Card>
      )}

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-40">Scanning collections...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
            <div className="mb-2">No collections found</div>
            <div className="text-sm">Create one above to get started</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((collection) => (
              <Card
                key={collection.id}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => onSelect(collection)}
              >
                <CardHeader className="flex flex-row items-center gap-4 p-4">
                  <div className="p-2 bg-muted rounded-md">
                    <Folder className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <CardTitle className="truncate text-base" title={collection.label}>
                      {collection.label}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {collection.file_count ?? 0} items
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
