/**
 * Format a message timestamp for display.
 * Shows only time for today's messages; date + time for older ones.
 */
export const formatTimestamp = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return (
    date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' +
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
};

/**
 * Return an emoji icon for a given file type.
 */
export const getFileIcon = (fileType) => {
  switch (fileType) {
    case 'photo': return '🖼️';
    case 'video': return '🎬';
    case 'audio': return '🎵';
    default: return '📄';
  }
};

/**
 * Format a file size in bytes to a human-readable string.
 */
export const formatFileSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Return true if a message was sent by the current user.
 * Supports both the legacy schema (sender_username) and the new schema (sender).
 * New messages use `sender`; existing rows in the DB may use `sender_username`.
 */
export const isOwnMessage = (msg, me) =>
  msg.sender === me || msg.sender_username === me;

/**
 * Get a short preview string for a message (for lists / notifications).
 */
export const getMessagePreview = (msg) => {
  if (msg.type === 'voice') return '🎤 Voice message';
  if (msg.type === 'file') return `📎 ${msg.file_name || 'File'}`;
  return msg.text || msg.content || '';
};
