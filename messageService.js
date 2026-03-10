// messageService.js

/**
 * Utility functions for message handling and display in KingChat
 */

/**
 * Format message text for display.
 * @param {string} message - The message text to format.
 * @returns {string} - Formatted message text.
 */
function formatMessage(message) {
    return `Message: ${message}`;
}

/**
 * Display a message in the chat UI.
 * @param {string} message - The message to display.
 */
function displayMessage(message) {
    const formattedMessage = formatMessage(message);
    console.log(formattedMessage); // Replace with actual UI rendering logic
}

/**
 * Clear all messages from the display.
 */
function clearMessages() {
    console.clear(); // Replace with actual logic to clear messages in UI
}

// Exporting functions for external use
module.exports = { formatMessage, displayMessage, clearMessages };