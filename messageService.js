/**
 * Given a chat record and the current user, return the other participant's username
 */
export const getOtherParticipant = (chat, currentUser) => {
  return chat.participant1 === currentUser ? chat.participant2 : chat.participant1;
};

/**
 * Format a timestamp string or Date into a human-readable time string
 * Returns "HH:MM" for today, or "DD/MM/YYYY" for older dates
 */
export const formatTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Return true if the message was sent by the current user
 */
export const isMessageFromCurrentUser = (message, currentUser) => {
  return message.sender === currentUser;
};

/**
 * Return a display string for the message based on its type
 */
export const getMessageDisplayText = (message) => {
  if (!message) return '';
  switch (message.type) {
    case 'text':
      return message.text || '';
    case 'voice':
      return '🎤 Voice message';
    case 'file':
      if (message.file_type === 'photo') return '📷 Photo';
      if (message.file_type === 'video') return '🎬 Video';
      if (message.file_type === 'audio') return '🎵 Audio';
      return `📎 ${message.file_name || 'File'}`;
    default:
      return message.text || '';
  }
};
