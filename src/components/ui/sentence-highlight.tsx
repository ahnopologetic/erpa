import React, { useEffect, useRef } from "react";
import { PlayIcon, VolumeXIcon } from "lucide-react";
import { log } from "~lib/log";

interface SentenceHighlightProps {
  sentence: string;
  element: HTMLElement;
  selector: string;
  isActive?: boolean;
  onPlay?: () => void;
  onStop?: () => void;
  isPlaying?: boolean;
  className?: string;
}

export const SentenceHighlight: React.FC<SentenceHighlightProps> = ({
  sentence,
  element,
  selector,
  isActive = false,
  onPlay,
  onStop,
  isPlaying = false,
  className = ""
}) => {
  const highlightRef = useRef<HTMLDivElement>(null);

  // Safety check: if element is undefined, try to find it by selector
  const safeElement = React.useMemo(() => {
    if (element) return element;
    if (selector) {
      try {
        const foundElement = document.querySelector(selector) as HTMLElement;
        if (foundElement) {
          log('[sentence-highlight] Found element by selector:', selector);
          return foundElement;
        } else {
          log('[sentence-highlight] Element not found by selector:', selector);
          return null;
        }
      } catch (error) {
        log('[sentence-highlight] Error finding element by selector:', error);
        return null;
      }
    }
    log('[sentence-highlight] No element or selector provided');
    return null;
  }, [element, selector]);

  useEffect(() => {
    if (!isActive || !safeElement) return;

    try {
      // Scroll the element into view
      safeElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest"
      });

      // Position the highlight overlay
      const rect = safeElement.getBoundingClientRect();
      const highlight = highlightRef.current;
      
      if (highlight) {
        highlight.style.position = 'fixed';
        highlight.style.left = `${rect.left}px`;
        highlight.style.top = `${rect.top}px`;
        highlight.style.width = `${rect.width}px`;
        highlight.style.height = `${rect.height}px`;
        highlight.style.pointerEvents = 'none';
        highlight.style.zIndex = '1000';
      }

      log('Highlighted sentence:', sentence.substring(0, 100) + '...');
    } catch (error) {
      log('Error highlighting sentence:', error);
    }
  }, [isActive, safeElement, sentence]);

  if (!isActive) return null;

  // If we can't find the element, show a fallback message
  if (!safeElement) {
    return (
      <div className="fixed top-4 right-4 z-50 bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-2 rounded shadow-lg">
        <div className="text-sm font-medium">Search result found but element not visible</div>
        <div className="text-xs mt-1">"{sentence.substring(0, 50)}..."</div>
      </div>
    );
  }

  return (
    <>
      {/* Highlight overlay */}
      <div
        ref={highlightRef}
        className={`pointer-events-none ${className}`}
      >
        <div className="w-full h-full bg-yellow-400/20 border-2 border-yellow-400 rounded animate-pulse" />
      </div>

      {/* Play button overlay */}
      {onPlay && safeElement && (
        <div
          className="fixed z-50 pointer-events-auto"
          style={{
            left: `${safeElement.getBoundingClientRect().right + 10}px`,
            top: `${safeElement.getBoundingClientRect().top}px`
          }}
        >
          <button
            onClick={isPlaying ? onStop : onPlay}
            className="flex items-center justify-center w-8 h-8 bg-black/80 hover:bg-black text-white rounded-full shadow-lg transition-all duration-200 hover:scale-110"
            title={isPlaying ? "Stop playback" : "Play sentence"}
          >
            {isPlaying ? (
              <VolumeXIcon className="w-4 h-4" />
            ) : (
              <PlayIcon className="w-4 h-4" />
            )}
          </button>
        </div>
      )}
    </>
  );
};

/**
 * Hook for managing sentence highlighting across the page
 */
export const useSentenceHighlight = () => {
  const [activeHighlight, setActiveHighlight] = React.useState<{
    sentence: string;
    element: HTMLElement;
    selector: string;
  } | null>(null);

  const highlightSentence = React.useCallback((
    sentence: string,
    element: HTMLElement,
    selector: string
  ) => {
    setActiveHighlight({ sentence, element, selector });
  }, []);

  const clearHighlight = React.useCallback(() => {
    setActiveHighlight(null);
  }, []);

  return {
    activeHighlight,
    highlightSentence,
    clearHighlight
  };
};
