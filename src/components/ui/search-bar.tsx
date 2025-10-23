import React, { useState, useEffect, useRef } from "react";
import { SearchIcon, XIcon, ChevronUpIcon, ChevronDownIcon, PlayIcon } from "lucide-react";
import { log } from "~lib/log";

interface SearchBarProps {
  onSearch: (query: string) => Promise<void>;
  onClear: () => void;
  isLoading?: boolean;
  resultCount?: number;
  currentResultIndex?: number;
  onNavigateResult?: (direction: 'prev' | 'next') => void;
  onPlayResult?: () => void;
  className?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  onClear,
  isLoading = false,
  resultCount = 0,
  currentResultIndex = 0,
  onNavigateResult,
  onPlayResult,
  className = ""
}) => {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+F to focus search
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }

      // Only handle other shortcuts when search is focused
      if (document.activeElement !== inputRef.current) return;

      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          if (query.trim()) {
            onSearch(query.trim());
          }
          break;
        case 'Escape':
          e.preventDefault();
          setQuery("");
          onClear();
          inputRef.current?.blur();
          break;
        case 'ArrowUp':
        case 'n':
        case 'N':
          e.preventDefault();
          onNavigateResult?.('prev');
          break;
        case 'ArrowDown':
        case 'p':
        case 'P':
          e.preventDefault();
          onNavigateResult?.('next');
          break;
        case ' ':
          e.preventDefault();
          onPlayResult?.();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [query, onSearch, onClear, onNavigateResult, onPlayResult]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const handleClear = () => {
    setQuery("");
    onClear();
  };

  const showResults = resultCount > 0 && !isLoading;
  const canNavigate = resultCount > 1;

  return (
    <div className={`fixed top-4 right-4 z-50 ${className}`}>
      <div className="bg-black/90 backdrop-blur-xl border border-gray-700 rounded-lg shadow-2xl min-w-80">
        {/* Search Input */}
        <form onSubmit={handleSubmit} className="flex items-center p-3">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Search page content..."
              className="w-full pl-10 pr-10 py-2 bg-transparent text-white placeholder-gray-400 border-none outline-none text-sm"
              disabled={isLoading}
            />
            {query && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>

        {/* Status Bar */}
        {(isLoading || showResults || isFocused) && (
          <div className="px-3 py-2 border-t border-gray-700 bg-gray-900/50">
            {isLoading ? (
              <div className="flex items-center space-x-2 text-sm text-gray-400">
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                <span>Searching...</span>
              </div>
            ) : showResults ? (
              <div className="flex items-center justify-between text-sm">
                <div className="text-gray-400">
                  {resultCount} result{resultCount !== 1 ? 's' : ''} found
                  {currentResultIndex >= 0 && (
                    <span className="ml-2 text-white">
                      ({currentResultIndex + 1} of {resultCount})
                    </span>
                  )}
                </div>
                
                {canNavigate && (
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => onNavigateResult?.('prev')}
                      className="p-1 text-gray-400 hover:text-white transition-colors"
                      title="Previous result (↑ or N)"
                    >
                      <ChevronUpIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onNavigateResult?.('next')}
                      className="p-1 text-gray-400 hover:text-white transition-colors"
                      title="Next result (↓ or P)"
                    >
                      <ChevronDownIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={onPlayResult}
                      className="p-1 text-gray-400 hover:text-white transition-colors"
                      title="Play result (Space)"
                    >
                      <PlayIcon className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ) : isFocused ? (
              <div className="text-xs text-gray-500">
                Press Enter to search • Esc to clear • Ctrl+Shift+F to focus
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};
