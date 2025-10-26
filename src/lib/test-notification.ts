/**
 * Test utility for notification sound functionality
 * This can be used to test the notification sound in the browser console
 */

import { playNotificationSound, playCompletionChime } from './notification-sound';

/**
 * Test function to play notification sound
 * Can be called from browser console: window.testNotification()
 */
export const testNotification = async (): Promise<void> => {
    console.log('Testing notification sound...');
    try {
        await playNotificationSound();
        console.log('✅ Notification sound test completed successfully');
    } catch (error) {
        console.error('❌ Notification sound test failed:', error);
    }
};

/**
 * Test function to play completion chime
 * Can be called from browser console: window.testChime()
 */
export const testChime = async (): Promise<void> => {
    console.log('Testing completion chime...');
    try {
        await playCompletionChime();
        console.log('✅ Completion chime test completed successfully');
    } catch (error) {
        console.error('❌ Completion chime test failed:', error);
    }
};

// Make functions available globally for testing
if (typeof window !== 'undefined') {
    (window as any).testNotification = testNotification;
    (window as any).testChime = testChime;
}
