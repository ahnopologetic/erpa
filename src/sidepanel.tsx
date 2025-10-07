import React from "react"
import { TocPopup } from "~components/toc-popup"
import "~style.css"

function Sidepanel() {
    const [isListening, setIsListening] = React.useState(false)
    const streamRef = React.useRef<MediaStream | null>(null)

    const stopStream = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop())
            streamRef.current = null
        }
    }

    const handleToggleMic = async () => {
        if (isListening) {
            stopStream()
            setIsListening(false)
            return
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            streamRef.current = stream
            setIsListening(true)
        } catch (error) {
            console.error("Microphone access denied or unavailable", error)
            setIsListening(false)
        }
    }

    React.useEffect(() => {
        return () => {
            stopStream()
        }
    }, [])

    return (
        <div className="h-screen flex flex-col bg-background text-foreground">
            <div className="flex-1 overflow-auto p-4">
                <h1 className="text-xl font-semibold">Sidepanel</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    {isListening ? "Listening..." : "Click the logo below to start the mic."}
                </p>
            </div>

            <div className="action-panel flex">
                <div className="toc">
                    {/* popup component */}
                    <TocPopup />
                </div>
                <button
                    onClick={handleToggleMic}
                    className="w-full p-4 bg-gray-300 text-center text-sm font-medium select-none focus:outline-none"
                    style={{ cursor: "pointer" }}
                    aria-pressed={isListening}
                    aria-label={isListening ? "Turn microphone off" : "Turn microphone on"}
                >
                    <div className="flex items-center justify-center gap-2">
                        <div className="h-8 w-8 bg-gray-400" />
                        <span>{isListening ? "Mic On" : "Tap to Turn Mic On"}</span>
                    </div>
                </button>
            </div>
        </div>
    )
}

export default Sidepanel