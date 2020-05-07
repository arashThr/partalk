const logger = require('../common/logger');

class BotIdentifier {
    static getBotId(token) {
        return token.substr(token.length - 4);
    }

    static emailIdentifier(token, chatId) {
        return `${this.getBotId(token)}.${chatId}`;
    }

    static parseEmailId(id) {
        try {
            return {
                botId: id.split('.')[0],
                chatId: id.split('.')[1]
            };
        } catch (err) {
            logger.error('ParseEmailId failed', err);
            return {};
        }
    }
}

module.exports = BotIdentifier;