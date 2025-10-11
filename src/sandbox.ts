export const life = 42

window.addEventListener("message", async function (event) {
    const source = event.source as {
        window: WindowProxy
    }

    source.window.postMessage(eval(event.data), event.origin)
})

/**
 * Requests user permission for microphone access.
 * @returns {Promise<void>} A Promise that resolves when permission is granted or rejects with an error.
 */
async function getUserPermission() {
    return new Promise((resolve, reject) => {
        console.log("Getting user permission for microphone access...");

        // Using navigator.mediaDevices.getUserMedia to request microphone access
        navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((stream) => {
                // Permission granted, handle the stream if needed
                console.log("Microphone access granted");
                resolve();
            })
            .catch((error) => {
                console.error("Error requesting microphone permission", error);

                // Handling different error scenarios
                if (error.name === "Permission denied") {
                    reject("MICROPHONE_PERMISSION_DENIED");
                } else {
                    reject(error);
                }
            });
    });
}

// Call the function to request microphone permission
getUserPermission();
