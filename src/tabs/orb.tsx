import React, { useState, useRef, useCallback } from "react";
import { VoicePoweredOrb } from "@/components/ui/voice-powered-orb";
import { Mic, Square } from "lucide-react";

const OrbUITest: React.FC = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [enableVoiceControl, setEnableVoiceControl] = useState(false);
    const [voiceDetected, setVoiceDetected] = useState(false);

    // Optionally: Ref for adding voice level visual, can be extended
    const orbRef = useRef<HTMLDivElement>(null);

    const handleRecordClick = useCallback(() => {
        setIsRecording(true);
        setEnableVoiceControl(true);
    }, []);

    const handleStopClick = useCallback(() => {
        setIsRecording(false);
        setEnableVoiceControl(false);
        setVoiceDetected(false);
    }, []);

    // Optionally: Callback from orb for visual feedback
    const onVoiceDetected = useCallback((detected: boolean) => {
        setVoiceDetected(detected);
    }, []);

    return (
        <div className="flex flex-col items-center py-12 space-y-8">
            <div className="w-64 h-64 transition-all relative">
                <VoicePoweredOrb
                    ref={orbRef}
                    className="rounded-xl overflow-hidden shadow-2xl hover:scale-120 transition-all duration-300 max-h-24"
                    // hue={isRecording ? 8 : 260}
                    isRecording={isRecording}
                    enableVoiceControl={enableVoiceControl}
                    onVoiceDetected={onVoiceDetected}
                />
                {voiceDetected && isRecording && (
                    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 px-3 py-1 rounded-full bg-red-100 text-red-600 text-xs font-semibold animate-pulse shadow">
                        Voice detected!
                    </div>
                )}
            </div>
            <div className="flex gap-6">
                {!isRecording ? (
                    <button
                        onClick={handleRecordClick}
                        className="flex items-center px-5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white shadow font-semibold text-lg transition"
                        data-testid="start-recording"
                    >
                        <Mic className="mr-2 w-5 h-5" /> Start Recording
                    </button>
                ) : (
                    <button
                        onClick={handleStopClick}
                        className="flex items-center px-5 py-2 rounded-lg bg-gray-500 hover:bg-gray-600 text-white shadow font-semibold text-lg transition"
                        data-testid="stop-recording"
                    >
                        <Square className="mr-2 w-4 h-4" /> Stop
                    </button>
                )}
            </div>
            <div className="text-gray-500 text-sm">
                Speak near your microphone and see the orb responding in real time!
            </div>
        </div>
    );
};

export default OrbUITest;
