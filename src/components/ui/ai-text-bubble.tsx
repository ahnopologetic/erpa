import React, { useState, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '~lib/utils';
import { useTTSSettings } from '~contexts/UserConfigContext';
import { ttsCoordinator } from '~lib/tts-coordinator';

interface AITextBubbleProps {
    content: string;
    isStreaming?: boolean;
    className?: string;
}

export const AITextBubble: React.FC<AITextBubbleProps> = ({
    content,
    isStreaming = false,
    className
}) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const ttsSettings = useTTSSettings();
    const requestIdRef = useRef<string | null>(null);

    // Remove all occurrences of <|task_complete|> (ignoring case just in case)
    const sanitizedContent = content.replace(/<\|task_complete\|>/gi, '').trim();

    const handlePlayTTS = React.useCallback(async () => {
        if (isPlaying) {
            // Stop current playback
            ttsCoordinator.cancelBySource('sidepanel');
            setIsPlaying(false);
            requestIdRef.current = null;
        } else {
            // Cancel any existing TTS from other sources
            ttsCoordinator.cancelBySource('sidepanel');
            
            // Get selected voice
            const voices = speechSynthesis.getVoices();
            let selectedVoice: SpeechSynthesisVoice | null = null;
            
            if (ttsSettings.voice && voices.length > 0) {
                selectedVoice = voices.find(v => v.voiceURI === ttsSettings.voice) || null;
                if (selectedVoice) {
                    console.log('Using selected voice:', selectedVoice.name, selectedVoice.voiceURI);
                } else {
                    console.warn('Selected voice not found, falling back to default');
                }
            }

            // Create unique request ID
            const requestId = `ai-bubble-${Date.now()}`;
            requestIdRef.current = requestId;

            // Request TTS through coordinator
            await ttsCoordinator.requestTTS({
                id: requestId,
                text: sanitizedContent,
                settings: {
                    voice: selectedVoice,
                    rate: ttsSettings.speed,
                    pitch: ttsSettings.pitch,
                    volume: ttsSettings.volume
                },
                priority: 'high', // AI responses have high priority
                source: 'sidepanel',
                onStart: () => {
                    setIsPlaying(true);
                },
                onEnd: () => {
                    setIsPlaying(false);
                    requestIdRef.current = null;
                },
                onError: (error) => {
                    console.error('TTS error:', error);
                    setIsPlaying(false);
                    requestIdRef.current = null;
                }
            });
        }
    }, [isPlaying, sanitizedContent, ttsSettings.speed, ttsSettings.pitch, ttsSettings.volume, ttsSettings.voice]);

    // Auto-readout when streaming completes and autoReadAloud is enabled
    React.useEffect(() => {
        // Only trigger auto-readout when:
        // 1. Not currently streaming (streaming just finished)
        // 2. Auto-readout is enabled in settings
        // 3. There's content to read
        // 4. Not already playing
        if (!isStreaming && ttsSettings.autoReadAloud && sanitizedContent.trim() && !isPlaying) {
            console.log('Auto-readout triggered for AI response');
            // Add a small delay to ensure any existing TTS is cancelled
            setTimeout(() => {
                // Double-check that we're still not playing and TTS coordinator is not busy
                if (!isPlaying && !ttsCoordinator.isCurrentlyPlaying()) {
                    handlePlayTTS();
                }
            }, 100);
        }
    }, [isStreaming, ttsSettings.autoReadAloud, sanitizedContent, isPlaying, handlePlayTTS]);

    // Clean up on unmount
    React.useEffect(() => {
        return () => {
            // Cancel any TTS from this component
            if (requestIdRef.current) {
                ttsCoordinator.cancelBySource('sidepanel');
            }
        };
    }, []);

    return (
        <div className={cn("flex justify-start my-2", className)}>
            <div className="rounded-lg px-4 py-3 max-w-[80%] relative group pb-8">
                <div className="text-sm text-gray-100 whitespace-pre-wrap pr-8">
                    {sanitizedContent}
                    {isStreaming && (
                        <span className="inline-block w-0.5 h-4 bg-blue-400 ml-1 animate-pulse" />
                    )}
                </div>
                
                {/* Read aloud button - only show when not streaming and has content */}
                {!isStreaming && sanitizedContent.trim() && (
                    <button
                        onClick={handlePlayTTS}
                        className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1.5 rounded-full bg-gray-700/80 hover:bg-gray-600/80 text-gray-300 hover:text-white"
                        aria-label={isPlaying ? "Stop reading" : "Read aloud"}
                        title={isPlaying ? "Stop reading" : "Read aloud"}
                    >
                        {isPlaying ? (
                            <VolumeX className="w-4 h-4" />
                        ) : (
                            <Volume2 className="w-4 h-4" />
                        )}
                    </button>
                )}
                
                {/* Playing indicator */}
                {isPlaying && (
                    <div className="absolute bottom-2 left-2 flex items-center space-x-1 text-xs text-blue-400">
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></div>
                        <span>Reading aloud</span>
                    </div>
                )}
            </div>
        </div>
    );
};
