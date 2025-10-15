import { Pause } from "lucide-react"
import React from "react"

type TtsPlaybackProps = {
    isPlaying: boolean
} & React.HTMLAttributes<HTMLDivElement>

const TtsPlayback: React.FC<TtsPlaybackProps> = ({ isPlaying, ...props }) => {
    if (!isPlaying) return null
    return (
        <div {...props}>
            <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <Pause className="w-4 h-4" />
            </div>
        </div>
    )
}

export default TtsPlayback