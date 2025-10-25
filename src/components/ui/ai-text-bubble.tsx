import React, { useState, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '~lib/utils';

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
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

    // Remove all occurrences of <|task_complete|> (ignoring case just in case)
    const sanitizedContent = content.replace(/<\|task_complete\|>/gi, '').trim();

    const handlePlayTTS = () => {
        if (isPlaying) {
            // Stop current playback
            window.speechSynthesis.cancel();
            setIsPlaying(false);
            utteranceRef.current = null;
        } else {
            // Start new playback
            const utterance = new SpeechSynthesisUtterance(sanitizedContent);
            
            // Configure voice settings
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            // Select the best available voice
            const voices = speechSynthesis.getVoices();
            const englishVoice = voices.find(voice =>
                voice.lang.startsWith('en') && voice.default
            ) || voices.find(voice => voice.lang.startsWith('en'));

            if (englishVoice) {
                utterance.voice = englishVoice;
            }

            // Set up event handlers
            utterance.onstart = () => {
                setIsPlaying(true);
            };

            utterance.onend = () => {
                setIsPlaying(false);
                utteranceRef.current = null;
            };

            utterance.onerror = (event) => {
                console.error('TTS error:', event);
                setIsPlaying(false);
                utteranceRef.current = null;
            };

            utteranceRef.current = utterance;
            window.speechSynthesis.speak(utterance);
        }
    };

    // Clean up on unmount
    React.useEffect(() => {
        return () => {
            if (utteranceRef.current) {
                window.speechSynthesis.cancel();
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
