import { Hand, Pause, Play, Square } from "lucide-react"
import React from "react"

type TtsPlaybackProps = {
    isPlaying: boolean
    onPlayPause: () => void
    onStop: () => void
    onHandsUp: () => void
    isListening: boolean
} & React.HTMLAttributes<HTMLDivElement>

const TtsPlayback: React.FC<TtsPlaybackProps> = ({
    isPlaying,
    onPlayPause,
    onStop,
    onHandsUp,
    isListening,
    className,
    ...props
}) => {
    if (!isPlaying && !isListening && !window.speechSynthesis.paused) return null

    return (
        <div className={className} {...props}>
            <div className="flex items-center justify-center space-x-3">
                {/* Status indicator */}
                <div
                    className={`w-2 h-2 rounded-full ${isListening
                        ? 'bg-red-500 animate-pulse'
                        : isPlaying
                            ? 'bg-green-500 animate-pulse'
                            : 'bg-yellow-500'
                        }`}
                />

                {/* Play/Pause button */}
                <button
                    onClick={onPlayPause}
                    className="hover:bg-white/10 p-1 rounded transition-colors"
                    aria-label={isPlaying ? "Pause" : "Play"}
                >
                    {isPlaying ? (
                        <Pause className="w-5 h-5 text-white" />
                    ) : (
                        <Play className="w-5 h-5 text-white" />
                    )}
                </button>

                {/* Stop button */}
                <button
                    onClick={onStop}
                    className="hover:bg-white/10 p-1 rounded transition-colors"
                    aria-label="Stop"
                >
                    <Square className="w-5 h-5 text-white" />
                </button>

                <button
                    onClick={onHandsUp}
                    className="hover:bg-white/10 p-1 rounded transition-colors"
                    aria-label="Hands up"
                >
                    <Hand className={`w-5 h-5 ${isListening ? 'text-red-500 animate-pulse' : 'text-white'}`} />
                </button>
            </div>
        </div>
    )
}

export default TtsPlayback