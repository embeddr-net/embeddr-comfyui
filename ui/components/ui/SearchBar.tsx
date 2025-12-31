import React from "react";
import { Input } from "@embeddr/react-ui/components/input";
import { Button } from "@embeddr/react-ui/components/button";
import { Spinner } from "@embeddr/react-ui/components/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@embeddr/react-ui/components/select";
import { Globe, ScanEyeIcon, Search, User } from "lucide-react";
import type { ApiMode, LibraryPath } from "@types";

interface SearchBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSearch: (e: React.FormEvent) => void;
  loading: boolean;
  similarImageId: number | null;
  setSimilarImageId: (id: number | null) => void;
  mode: ApiMode;
  selectedLibrary: string;
  setSelectedLibrary: (lib: string) => void;
  libraries: Array<LibraryPath>;
  viewMode: "all" | "mine";
  setViewMode: (mode: "all" | "mine") => void;
}

export function SearchBar({
  searchQuery,
  setSearchQuery,
  onSearch,
  loading,
  similarImageId,
  setSimilarImageId,
  mode,
  selectedLibrary,
  setSelectedLibrary,
  libraries,
  viewMode,
  setViewMode,
}: SearchBarProps) {
  return (
    <div className="flex flex-col gap-2">
      {similarImageId ? (
        <div className="flex items-center justify-between bg-primary/10 p-2 border border-primary/20 h-9">
          <span className="text-xs font-medium text-primary">
            <ScanEyeIcon className="w-4 h-4 inline-block mr-1" /> Showing
            similar images
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setSimilarImageId(null)}
          >
            Clear
          </Button>
        </div>
      ) : (
        <form onSubmit={onSearch} className="flex gap-2 items-center">
          <Input
            disabled={similarImageId !== null}
            placeholder="Search prompts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <Button type="submit" variant="ghost" size="icon" disabled={loading}>
            <Search className="" />
          </Button>
        </form>
      )}

      <div className="flex gap-1">
        {mode === "local" ? (
          <Select value={selectedLibrary} onValueChange={setSelectedLibrary}>
            <SelectTrigger className="h-8 w-full">
              <SelectValue placeholder="Select library" />
            </SelectTrigger>
            <SelectContent side="top" position="popper">
              <SelectItem value="all">All Libraries</SelectItem>
              {libraries.map((lib) => (
                <SelectItem key={lib.id} value={lib.id.toString()}>
                  {lib.name || lib.path}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <>
            <Button
              variant={viewMode === "all" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setViewMode("all")}
            >
              <Globe className="w-3 h-3 mr-1" /> Public
            </Button>
            <Button
              variant={viewMode === "mine" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setViewMode("mine")}
            >
              <User className="w-3 h-3 mr-1" /> Mine
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
