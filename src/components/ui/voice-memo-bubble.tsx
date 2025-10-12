import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, Trash2, Clock, User, Bot } from 'lucide-react';
import type { VoiceMemoBubbleProps } from '~types/voice-memo';
import { cn } from '~lib/utils';

export const VoiceMemoBubble: React.FC<VoiceMemoBubbleProps> = ({
    voiceMemo,
    onPlay,
    onPause,
    onDelete,
    className
}) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(voiceMemo.duration || 0);
    const [audioUrl, setAudioUrl] = useState<string | null>(voiceMemo.audioUrl || null);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Generate audio URL from blob if not already available
    useEffect(() => {
        if (!audioUrl && voiceMemo.audioBlob) {
            const url = URL.createObjectURL(voiceMemo.audioBlob);
            setAudioUrl(url);
            return () => URL.revokeObjectURL(url);
        }
    }, [voiceMemo.audioBlob, audioUrl]);

    // Cleanup audio URL on unmount
    useEffect(() => {
        return () => {
            if (audioUrl && audioUrl.startsWith('blob:')) {
                URL.revokeObjectURL(audioUrl);
            }
        };
    }, [audioUrl]);

    // Handle audio metadata loading
    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
        }
    };

    // Handle audio time updates
    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    };

    // Handle audio end
    const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
        if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
        }
    };

    // Handle play/pause
    const handlePlayPause = async () => {
        if (!audioRef.current || !audioUrl) return;

        try {
            if (isPlaying) {
                audioRef.current.pause();
                setIsPlaying(false);
                if (progressIntervalRef.current) {
                    clearInterval(progressIntervalRef.current);
                    progressIntervalRef.current = null;
                }
                onPause?.(voiceMemo);
            } else {
                await audioRef.current.play();
                setIsPlaying(true);

                // Start progress tracking
                progressIntervalRef.current = setInterval(() => {
                    if (audioRef.current) {
                        setCurrentTime(audioRef.current.currentTime);
                    }
                }, 100);

                onPlay?.(voiceMemo);
            }
        } catch (error) {
            console.error('Error playing audio:', error);
            setIsPlaying(false);
        }
    };

    // Handle delete
    const handleDelete = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(false);
        }
        onDelete?.(voiceMemo.id);
    };

    // Format time for display
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Calculate progress percentage
    const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

    const isUser = voiceMemo.type === 'user';
    const isTranscribing = voiceMemo.isTranscribing;
    const hasError = voiceMemo.error;

    return (
        <div className={cn(
            "flex w-full mb-4",
            isUser ? "justify-end" : "justify-start",
            className
        )}>
            <div className={cn(
                "max-w-xs lg:max-w-md rounded-2xl p-4 shadow-lg",
                isUser
                    ? "bg-gray-800 text-white rounded-br-md border border-gray-800"
                    : "bg-gray-100 text-gray-900 rounded-bl-md border"
            )}>
                {/* Header with icon and timestamp */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                        {isUser ? (
                            <User className="w-4 h-4" />
                        ) : (
                            <Bot className="w-4 h-4" />
                        )}
                        <span className="text-xs opacity-75">
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Clock className="w-3 h-3 opacity-75" />
                        <span className="text-xs opacity-75">
                            {new Date(voiceMemo.timestamp).toLocaleTimeString()}
                        </span>
                    </div>
                </div>

                {/* Audio controls and progress */}
                <div className="space-y-3">
                    {/* Play/Pause button and progress bar */}
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={handlePlayPause}
                            disabled={!audioUrl || !!hasError || !audioUrl.startsWith('blob:')}
                            className={cn(
                                "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200",
                                isUser
                                    ? "bg-black hover:bg-gray-800 disabled:bg-gray-400"
                                    : "bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100",
                                "disabled:cursor-not-allowed"
                            )}
                        >
                            {isPlaying ? (
                                <Pause className="w-5 h-5" />
                            ) : (
                                <Play className="w-5 h-5 ml-0.5" />
                            )}
                        </button>

                        <div className="flex-1">
                            {/* Progress bar */}
                            <div className={cn(
                                "w-full h-2 rounded-full overflow-hidden",
                                isUser ? "bg-blue-400" : "bg-gray-300"
                            )}>
                                <div
                                    className={cn(
                                        "h-full transition-all duration-100",
                                        isUser ? "bg-blue-200" : "bg-gray-500"
                                    )}
                                    style={{ width: `${progressPercentage}%` }}
                                />
                            </div>
                        </div>

                        {/* Delete button */}
                        {onDelete && (
                            <button
                                onClick={handleDelete}
                                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {/* Transcription */}
                    <div className="space-y-2">
                        {isTranscribing && (
                            <div className="flex items-center space-x-2">
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                                <span className="text-xs opacity-75">Transcribing...</span>
                            </div>
                        )}

                        {hasError && (
                            <div className="text-xs text-red-500 bg-red-50 p-2 rounded">
                                Error: {voiceMemo.error}
                            </div>
                        )}

                        {voiceMemo.transcription && (
                            <div className={cn("text-xs leading-relaxed line-clamp-2 break-words hover:line-clamp-none", isUser ? "text-gray-100" : "text-gray-700")}>{voiceMemo.transcription}</div>
                        )}
                    </div>
                </div>

                {/* Hidden audio element */}
                {audioUrl && (
                    <audio
                        ref={audioRef}
                        src={audioUrl}
                        onLoadedMetadata={handleLoadedMetadata}
                        onTimeUpdate={handleTimeUpdate}
                        onEnded={handleEnded}
                        preload="metadata"
                        className="hidden"
                    />
                )}
            </div>
        </div>
    );
};
