enum SpeechRecognitionMessageType {
    SPEECH_RECOGNITION_START = "speech-recognition-start",
    SPEECH_RECOGNITION_END = "speech-recognition-end",
    SPEECH_RECOGNITION_RESULT = "speech-recognition-result",
    SPEECH_RECOGNITION_ERROR = "speech-recognition-error",
    SPEECH_RECOGNITION_ENDED = "speech-recognition-ended",
}

enum ToggleMicMessageType {
    TOGGLE_MIC = "toggle-mic",
}

enum StopRecordingMessageType {
    STOP_RECORDING = "stop-recording",
}

enum StartRecordingMessageType {
    START_RECORDING = "start-recording",
}

enum GetTabStreamIdMessageType {
    GET_TAB_STREAM_ID = "get-tab-stream-id",
}

enum RecordingStoppedMessageType {
    RECORDING_STOPPED = "recording-stopped",
}

type MessageType = SpeechRecognitionMessageType | ToggleMicMessageType | StopRecordingMessageType | StartRecordingMessageType | GetTabStreamIdMessageType | RecordingStoppedMessageType

export type { SpeechRecognitionMessageType, ToggleMicMessageType, StopRecordingMessageType, StartRecordingMessageType, GetTabStreamIdMessageType, RecordingStoppedMessageType, MessageType }