// Background script to handle keyboard shortcuts and sidepanel commands

import OFFSCREEN_DOCUMENT_PATH from "url:~src/offscreen.html";
import { err, log } from "~lib/log";

function toggleSidepanel(options: chrome.sidePanel.OpenOptions) {
    chrome.sidePanel.open(options)
    chrome.runtime.sendMessage({
        type: 'close-sidepanel',
        tabId: options.tabId
    })
    log("Runtime message sent: close-sidepanel");
}

chrome.commands.onCommand.addListener(async (command) => {
    if (command === "toggle-sidepanel") {
        try {
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                toggleSidepanel({
                    tabId: tabs[0].id
                })
            });
        } catch (error) {
            err("Failed to open sidepanel:", error);
        }
    }
});

// Handle sidepanel availability - prevent opening on action click
chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: false
});

// Listen for tab changes to close sidepanel
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        console.log(`[Background] Tab activated: ${activeInfo.tabId}`);
        // Send message to sidepanel to close itself when switching tabs
        // Since we can't directly close the sidepanel from background script,
        // we'll send a message to the sidepanel to handle the closing
        chrome.runtime.sendMessage({
            type: 'CLOSE_SIDEPANEL_ON_TAB_SWITCH',
            tabId: activeInfo.tabId
        });
        console.log(`[Background] Sent close message due to tab switch to tab ${activeInfo.tabId}`);
    } catch (error) {
        console.error("[Background] Failed to send close message on tab switch:", error);
    }
});

// Also listen for tab updates (when navigating to new pages)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active) {
        try {
            console.log(`[Background] Tab updated: ${tabId}`);

            // Send message to sidepanel to close itself when navigating to new pages
            chrome.runtime.sendMessage({
                type: 'CLOSE_SIDEPANEL_ON_PAGE_NAVIGATION',
                tabId: tabId
            });
            console.log(`[Background] Sent close message due to page navigation on tab ${tabId}`);
        } catch (error) {
            console.error("[Background] Failed to send close message on page navigation:", error);
        }
    }
});

console.log("Background script loaded");

// Handle messages for tab capture
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "get-tab-stream-id") {
        handleTabCapture(message.tabId, sender.tab?.id)
            .then(streamId => sendResponse({ success: true, streamId }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep message channel open for async response
    }
});

async function handleTabCapture(tabId?: number, senderTabId?: number) {
    try {
        // Use the sender's tab ID if available (from sidepanel), otherwise use provided tabId
        let targetTabId = senderTabId || tabId;
        
        if (!targetTabId) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            targetTabId = tab?.id;
        }

        if (!targetTabId) {
            throw new Error("No active tab found");
        }

        console.log("Attempting tab capture for tab:", targetTabId);

        // First, ensure we have the activeTab permission by injecting a script
        // This properly "invokes" the extension on the current page
        try {
            await chrome.scripting.executeScript({
                target: { tabId: targetTabId },
                func: () => {
                    // This minimal script execution "invokes" the extension on the page
                    console.log("Extension invoked on page:", window.location.href);
                    return { invoked: true, url: window.location.href };
                }
            });
            console.log("Extension successfully invoked on tab:", targetTabId);
        } catch (injectionError) {
            console.warn("Could not inject script to invoke extension:", injectionError);
            // Continue anyway - might still work
        }

        // Now try to get the stream ID for tab capture
        const streamId = await chrome.tabCapture.getMediaStreamId({
            targetTabId: targetTabId
        });

        console.log("Tab capture stream ID obtained:", streamId);
        return streamId;
    } catch (error) {
        console.error("Tab capture error:", error);
        
        // If we get the activeTab error, try to provide a more helpful message
        if (error.message.includes("Extension has not been invoked")) {
            throw new Error("Extension invocation failed. Please try refreshing the page and opening the sidepanel again, or try on a different webpage.");
        }
        
        throw error;
    }
}



async function createOffscreenDocument() {
    if (!(await hasDocument())) {
        await chrome.offscreen
            .createDocument({
                url: OFFSCREEN_DOCUMENT_PATH,
                reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.DISPLAY_MEDIA],
                justification: "User media and tab capture for recording"
            })
            .then((e) => {
                // Now that we have an offscreen document, we can dispatch the
                // message.
            })
    }
}
createOffscreenDocument()

async function hasDocument() {
    // Check all windows controlled by the service worker if one of them is the offscreen document
    // @ts-ignore clients
    const matchedClients = await clients.matchAll()
    for (const client of matchedClients) {
        if (client.url.endsWith(OFFSCREEN_DOCUMENT_PATH)) {
            return true
        }
    }
    return false
}