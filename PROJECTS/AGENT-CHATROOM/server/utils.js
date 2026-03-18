/**
 * Utility functions for chatroom server
 */

/**
 * Get today's date string (YYYY-MM-DD)
 */
function getToday() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Format timestamp to ISO string
 */
function formatTimestamp() {
    return new Date().toISOString();
}

module.exports = {
    getToday,
    formatTimestamp
};
