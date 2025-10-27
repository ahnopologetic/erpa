/**
 * Global TTS Coordinator
 * 
 * Manages TTS playback across the entire extension to prevent conflicts
 * between sidepanel and content script TTS instances.
 */

export interface TTSSettings {
  voice?: SpeechSynthesisVoice | null;
  rate?: number;
  pitch?: number;
  volume?: number;
}

export interface TTSRequest {
  id: string;
  text: string;
  settings: TTSSettings;
  priority: 'high' | 'normal' | 'low';
  source: 'sidepanel' | 'content' | 'other';
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Event) => void;
}

class TTSCoordinator {
  private currentRequest: TTSRequest | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private isPlaying: boolean = false;
  private queue: TTSRequest[] = [];
  private voicesLoaded: boolean = false;

  constructor() {
    this.initializeVoices();
  }

  private initializeVoices() {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        this.voicesLoaded = true;
        console.log('[TTS Coordinator] Voices loaded:', voices.length);
      }
    };

    // Try to load voices immediately
    loadVoices();

    // Listen for voices to be loaded
    const handleVoicesChanged = () => {
      loadVoices();
    };

    speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
  }

  /**
   * Request TTS playback
   */
  async requestTTS(request: TTSRequest): Promise<void> {
    console.log('[TTS Coordinator] TTS request received:', {
      id: request.id,
      source: request.source,
      priority: request.priority,
      textLength: request.text.length
    });

    // Cancel current playback if higher priority
    if (this.currentRequest && this.shouldInterrupt(request)) {
      console.log('[TTS Coordinator] Interrupting current TTS for higher priority request');
      this.cancelCurrent();
    }

    // If already playing and not interrupting, queue the request
    if (this.isPlaying && !this.shouldInterrupt(request)) {
      console.log('[TTS Coordinator] Queuing TTS request');
      this.queueRequest(request);
      return;
    }

    // Start playing immediately
    await this.playTTS(request);
  }

  /**
   * Cancel current TTS playback
   */
  cancelCurrent(): void {
    if (this.currentUtterance) {
      console.log('[TTS Coordinator] Cancelling current TTS');
      speechSynthesis.cancel();
      this.currentUtterance = null;
    }
    this.currentRequest = null;
    this.isPlaying = false;
  }

  /**
   * Cancel TTS by source
   */
  cancelBySource(source: 'sidepanel' | 'content' | 'other'): void {
    if (this.currentRequest?.source === source) {
      console.log('[TTS Coordinator] Cancelling TTS by source:', source);
      this.cancelCurrent();
    }

    // Remove queued requests from this source
    this.queue = this.queue.filter(req => req.source !== source);
  }

  /**
   * Check if TTS is currently playing
   */
  isCurrentlyPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get current TTS source
   */
  getCurrentSource(): string | null {
    return this.currentRequest?.source || null;
  }

  private shouldInterrupt(request: TTSRequest): boolean {
    if (!this.currentRequest) return true;

    // Priority order: high > normal > low
    const priorityOrder = { high: 3, normal: 2, low: 1 };
    const currentPriority = priorityOrder[this.currentRequest.priority];
    const newPriority = priorityOrder[request.priority];

    return newPriority > currentPriority;
  }

  private queueRequest(request: TTSRequest): void {
    // Insert request in priority order
    const priorityOrder = { high: 3, normal: 2, low: 1 };
    const requestPriority = priorityOrder[request.priority];
    
    let insertIndex = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      if (priorityOrder[this.queue[i].priority] < requestPriority) {
        insertIndex = i;
        break;
      }
    }

    this.queue.splice(insertIndex, 0, request);
    console.log('[TTS Coordinator] Request queued at index:', insertIndex);
  }

  private async playTTS(request: TTSRequest): Promise<void> {
    this.currentRequest = request;
    this.isPlaying = true;

    // Wait for voices to be loaded if needed
    if (!this.voicesLoaded) {
      await this.waitForVoices();
    }

    const utterance = new SpeechSynthesisUtterance(request.text);

    // Apply TTS settings
    if (request.settings.voice) {
      utterance.voice = request.settings.voice;
    }
    utterance.rate = request.settings.rate || 1.0;
    utterance.pitch = request.settings.pitch || 1.0;
    utterance.volume = request.settings.volume || 1.0;

    // Set up event handlers
    utterance.onstart = () => {
      console.log('[TTS Coordinator] TTS started:', request.id);
      request.onStart?.();
    };

    utterance.onend = () => {
      console.log('[TTS Coordinator] TTS ended:', request.id);
      this.handleTTSComplete();
      request.onEnd?.();
    };

    utterance.onerror = (event) => {
      console.error('[TTS Coordinator] TTS error:', event, 'Request:', request.id);
      this.handleTTSComplete();
      request.onError?.(event);
    };

    this.currentUtterance = utterance;
    speechSynthesis.speak(utterance);
  }

  private handleTTSComplete(): void {
    this.currentRequest = null;
    this.currentUtterance = null;
    this.isPlaying = false;

    // Play next queued request
    if (this.queue.length > 0) {
      const nextRequest = this.queue.shift()!;
      console.log('[TTS Coordinator] Playing next queued request:', nextRequest.id);
      this.playTTS(nextRequest);
    }
  }

  private async waitForVoices(): Promise<void> {
    return new Promise((resolve) => {
      if (this.voicesLoaded) {
        resolve();
        return;
      }

      const handleVoicesChanged = () => {
        speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
        this.voicesLoaded = true;
        resolve();
      };

      speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);

      // Fallback timeout
      setTimeout(() => {
        speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
        this.voicesLoaded = true;
        resolve();
      }, 1000);
    });
  }
}

// Global instance
export const ttsCoordinator = new TTSCoordinator();

// Export for use in other modules
export default ttsCoordinator;
