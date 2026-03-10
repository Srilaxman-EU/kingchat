class ChatService {
    constructor() {
        this.messages = [];
    }

    sendTextMessage(sender, recipient, message) {
        const textMessage = {
            type: 'text',
            sender,
            recipient,
            content: message,
            timestamp: new Date().toISOString()
        };
        this.messages.push(textMessage);
        return textMessage;
    }

    sendVoiceMessage(sender, recipient, filePath) {
        const voiceMessage = {
            type: 'voice',
            sender,
            recipient,
            filePath,
            timestamp: new Date().toISOString()
        };
        this.messages.push(voiceMessage);
        return voiceMessage;
    }

    sendFile(sender, recipient, filePath) {
        const fileMessage = {
            type: 'file',
            sender,
            recipient,
            filePath,
            timestamp: new Date().toISOString()
        };
        this.messages.push(fileMessage);
        return fileMessage;
    }

    getMessages() {
        return this.messages;
    }
}

module.exports = ChatService;