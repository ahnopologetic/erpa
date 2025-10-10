// Background script to handle keyboard shortcuts and sidepanel commands

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
