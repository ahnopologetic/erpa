import { useState } from "react";
import "~style.css"

function Permission() {
    const [status, setStatus] = useState('')
    const handleRequestPermission = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((track) => track.stop());
        } catch (error) {
            console.error('Error requesting permission:', error);
        }
        setStatus('Permission granted! You can close this tab.');
        setTimeout(() => {
            window.close();
        }, 2000);
    }

    return (
        <div className="flex flex-col items-center justify-center h-screen space-y-4">
            <h1 className="text-2xl font-bold">Permission</h1>
            <h1 className="text-2xl font-bold">Microphone Permission Required</h1>
            <p className="text-sm">
                To record audio, this extension needs permission to use your microphone.
            </p>
            <button id="requestPermission" className="bg-blue-500 text-white p-2 rounded-md" onClick={handleRequestPermission}>
                Allow Microphone Access
            </button>
            <p id="status" className="text-sm text-gray-500">{status}</p>
        </div>
    )
}

export default Permission