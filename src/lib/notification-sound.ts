/**
 * Utility functions for playing notification sounds
 */

/**
 * Plays the notification sound when AI response is completed
 */
export const playNotificationSound = async (): Promise<void> => {
    try {
        // Create audio element with the notification sound
        const audio = new Audio('/assets/notification.mp3');
        
        // Set volume (0.0 to 1.0)
        audio.volume = 0.7;
        
        // Play the sound
        await audio.play();
        
        console.log('Notification sound played successfully');
    } catch (error) {
        console.warn('Failed to play notification sound:', error);
        // Don't throw error - notification sound is not critical functionality
    }
};

/**
 * Plays a subtle chime sound for AI response completion
 */
export const playCompletionChime = async (): Promise<void> => {
    try {
        // Create a simple chime using Web Audio API as fallback
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // Create oscillator for chime sound
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        // Connect nodes
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Configure chime sound (pleasant bell-like tone)
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.3);
        
        // Configure volume envelope
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        // Play the chime
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
        
        console.log('Completion chime played successfully');
    } catch (error) {
        console.warn('Failed to play completion chime:', error);
        // Fallback to notification sound if available
        await playNotificationSound();
    }
};
