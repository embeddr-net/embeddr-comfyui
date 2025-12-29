import React from "react";
import { Input } from "@embeddr/react-ui/components/input";
import { Button } from "@embeddr/react-ui/components/button";
import { Globe, ScanEyeIcon, User } from "lucide-react";
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
            <form onSubmit={onSearch} className="flex gap-2">
                <Input
                    disabled={similarImageId !== null}
                    placeholder="Search prompts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8"
                />
                {loading ? (
                    <Button variant="secondary" className="h-8 w-20" disabled>
                        Searching...
                    </Button>
                ) : (
                    <Button type="submit" className="h-8 w-20">
                        Search
                    </Button>
                )}
            </form>

            {similarImageId && (
                <div className="flex items-center justify-between bg-primary/10 p-1 border border-primary/20">
                    <span className="text-xs font-medium text-primary">
                        <ScanEyeIcon className="w-4 h-4 inline-block mr-1" />{" "}
                        Showing similar images
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
            )}

            <div className="flex gap-1">
                {mode === "local" ? (
                    <select
                        value={selectedLibrary}
                        onChange={(e) => setSelectedLibrary(e.target.value)}
                        className="h-8 w-full bg-card border border-input px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                        <option value="all">All Libraries</option>
                        {libraries.map((lib) => (
                            <option key={lib.id} value={lib.id.toString()}>
                                {lib.name || lib.path}
                            </option>
                        ))}
                    </select>
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
                            variant={
                                viewMode === "mine" ? "default" : "outline"
                            }
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
