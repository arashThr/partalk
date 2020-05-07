/* jshint -W100 */
"use strict";
const configs = require("../conf/configs");
const TelegramBot = require('../botManager/telegram');
const sendMail = require('./sendMail').sendMail;
// All must be imported. Order matters
const Message = require("../model/Message");
const Plan = require("../plans/Plan");
require("../plans/MeetingPlan");
require("../plans/TemporalPlan");
const Discussion = require("../model/Discussion");
const ChatService = require("../model/ChatService");
const choosePlanFsm = require("./choosePlanFsm");
const request = require('request');
const fs = require('fs');
const path = require('path');
const BotIdentifier = require('../common/BotIdentifier');
const logger = require('../common/logger');
const Raven = require('raven');
const cheerio = require('cheerio');


class BotService {
    /**
     * @constructor
     * @param {ObjectId} userId
     * @param {String} email
     * @param {String} token
     * @param {String} aboutBot
     * @param {EventEmitter} events
     * @param {String} name
     */
    constructor(userId, email, token, aboutBot, events, name) {
        this.userId = userId;
        this.botToken = token;
        this._bot = new TelegramBot(token);
        this.email = email;
        this.aboutBot = aboutBot;
        this.botName = name || 'Telegram Bot';

        this.isStarted = false;

        // Authenticated users
        this.discussions = [];
        // Unauthenticated bot visitors
        this.states = [];
        events.on('email', this.emailReceived(this.bot, this.saveMessage));
        events.on('payment', paymentInfo => {
            logger.debug('Payment event received in bot', {token: this.botToken});
            if (paymentInfo.error) {
                Raven.captureMessage('Payment has errors', {
                    extra: paymentInfo
                });
                logger.error('Payment has errors', paymentInfo);
                return this.bot.sendMessage(paymentInfo.chatId, 'در تایید پرداخت خطا رخ داد.');
            }
            let state = this.states.find(s => s.chatId === paymentInfo.chatId);
            if (!state) {
                Raven.captureMessage('There is no registered customer for this payment', {
                    extra: paymentInfo
                });
                return logger.error('There is no registered customer for this payment', paymentInfo);
            }
            state.verifyEvent(paymentInfo.verified);
        });
        this.setBotWebhook();
    }

    get bot() {
        return this._bot;
    }

    sendMsg(chatId, msg) {
        this.bot.sendMessage(chatId, msg);
    }

    getInfo(err) {
        let info = {
            token: this.botToken,
            email: this.email
        };
        if (err)
            info.error = err;
        return info;
    }

    setBotWebhook() {
        let webhookOptions = {};
        if (!configs.isInDev) {
            // Use self-signed certificate
            webhookOptions.certificate = `${process.cwd()}/cert/server.crt`;
        }
        const webhookUrl = `${configs.webhookUrl}:${configs.webhookPort}/bot${this.botToken}`;
        // Todo: promise chain
        this.bot.getWebHookInfo().then(res => {
            if (res.url === webhookUrl)
                return;
            this.bot.setWebHook(webhookUrl, webhookOptions)
                .then(() => {
                    logger.info('Webhook was successfully set for ' + this.botToken);
                }).catch(err => {
                logger.error('Webhook set failed', this.getInfo(err));
            });
            // Todo: Tell user about webhook setup failure
        }).catch(err => logger.error('Get webhook info failed', this.getInfo(err)));
    }

    start(cb) {

        this.bot.on('callback_query', cbq => {
            let chatId = String(cbq.message.chat.id);
            let state = this.states.find(v => v.chatId === chatId);

            if (!state || !state.fsm) {
                // Customer pressed answer key after payment when there's no state
                this.bot.sendMessage(chatId, 'لطفا با ارسال /start از اول شروع کنید.');
                return;
            }
            if (cbq.data === 'cancelPayment') {
                this.bot.editMessageReplyMarkup({
                    inline_keyboard: [[]]
                }, {chat_id: chatId, message_id: cbq.message.message_id});
                state.fsm.return();
                return;
            }
            if (typeof state[state.fsm.current] === 'function')
                state[state.fsm.current](cbq);
            else {
                logger.error('Current state did not provide a function', {
                    token: this.botToken, state: state.fsm.current
                });
                this.bot.sendMessage(chatId, 'لطفا با ارسال /start از اول شروع کنید.');
            }
        });

        ChatService.ChatServiceModel.botActiveDiscussions(this.botToken, (err, chatService) => {
            if (err) {
                logger.error('botActiveDiscussions error', this.getInfo(err));
                return cb('Error occurred: ' + err.message);
            }
            if (!chatService)
                return cb('No service found for this token');

            this.isStarted = true;
            logger.debug('Chat service authenticated', this.getInfo());
            for (let discussion of chatService.discussions)
                this.discussions.push(discussion);

            this.bot.on('message', (msg) => {
                let chatId = msg.chat.id;
                logger.silly(chatId + ' sent message sent to ' + this.botToken);
                this.interpretMessage(chatService, msg);
            });
            logger.info('Bot started', this.getInfo());
            cb();
        }).catch(err => {
            logger.error('Bot start failed', this.getInfo(err));
            cb(err);
        });
    }

    restart(email, aboutBot, cb) {
        logger.debug('Bot restart', this.getInfo());
        this.email = email;
        this.aboutBot = aboutBot;
        this.discussions = [];
        this.bot.removeListener('message');
        this.start(() => {
            this.isStarted = true;
            cb();
        });
    }

    stop() {
        logger.debug('Bot stop', this.getInfo());
        this.states = [];
        this.bot.removeListener('callback_query');
        this.isStarted = false;
    }

    removeBot() {
        logger.debug('Bot stop', this.getInfo());
        this.bot.removeListener('callback_query');
        this.bot.removeListener('message');
        this.bot.deleteWebHook();
    }

    interpretMessage(chatService, msg) {
        let chatId = String(msg.chat.id);

        if (!this.isStarted) {
            this.sendMsg(chatId, 'در حال حاضر بات فعال نیست.');
            return;
        }

        if (msg.text === '/start')
            this.respondToStart(msg);

        let index = this.discussions.findIndex(s => s.customerChatId === chatId);
        let discussion = this.discussions[index];
        let isFree = !chatService.plans;

        if (discussion) {
            if (isFree)
                return this.sendCustomerMessage(discussion, msg);
            // Checking free discussion that are no longer available
            if (discussion.plan)
                return this.continueDialogue(discussion, msg);
            // Otherwise creates a new discussion
            discussion.isActive = false;
            discussion.save()
                .catch(err => logger.error('Discussion save failed', {
                    discussion: discussion, error: err
                }));
            this.discussions.splice(index, 1);
        }

        if (isFree)
            return this.addNewDiscussion(chatId, chatService)(null);

        let state = this.states.find(v => v.chatId === chatId);
        if (state) {
            if (state.fsm.current === 'verify') return state.fsm.wait();
            // These messages will be caught in callback query listener
            else return;
        }

        let planFsm = new choosePlanFsm.ChoosePlanFsm
        (this.userId, this.bot, msg.chat, chatService.plans, this.addNewDiscussion(chatId, chatService));
        this.states.push(planFsm);
    }

    terminateWindow(chatId, discussion) {
        // Todo: Concat messages
        this.sendMsg(chatId, 'اعتبار شما برای مکالمه به پایان رسیده است.');
        this.sendMsg(chatId, 'برای شروع مجدد دستور /start را وارد نمایید.');

        let index = this.discussions.findIndex(s => s.customerChatId === chatId);
        if (index !== -1) this.discussions.splice(index, 1);
        discussion.isActive = false;
        discussion.save()
            .then(s => logger.debug(`${s.customerChatId} discussion terminated`))
            .catch(err => {
                logger.error('Saving discussion termination failed', err);
            });
    }

    continueDialogue(discussion, msg) {
        let chatId = String(msg.chat.id);
        let plan = discussion.plan;

        if (plan.kind === 'MeetingPlan') {
            this.sendCustomerMessage(discussion, msg);
        }

        else if (plan.kind === 'TemporalPlan') {
            let upperLimit = null;
            if (discussion.startDate) {
                upperLimit = new Date(discussion.startDate);
                upperLimit.setMinutes(upperLimit.getMinutes() + plan.duration);
            }

            let discussionFinished = upperLimit && Date.now() > upperLimit;

            this.sendCustomerMessage(discussion, msg, discussionFinished);

            if (discussionFinished)
                this.terminateWindow(chatId, discussion);
        }
    }

    sendCustomerMessage(discussion, msg, isFinished) {
        let chatId = String(msg.chat.id);
        this.getMessageContent(msg, (err, msgType, content) => {
            if (err) {
                let util = require('util');
                console.log(util.inspect(err, { showHidden: true, depth: null }));
                console.error(err);
                logger.error('Get message content failed: ', {
                    message: msg,
                    error: err
                });
                return this.sendMsg(chatId, 'ارسال پیام با خطا مواجه شد.');
            }
            if (isFinished)
                content.text += '\r\n\r\n(مهلت زمانی کاربر به پایان رسیده.' +
                    ' با این حال شما هنوز هم می‌توانید از همین‌جا برای کاربر پیام ارسال کنید.)';
            this.saveMessage(discussion, msgType, content);
            logger.debug('Sending message from ' + chatId);
            sendMail(this.email, this.botToken, this.botName, content, msg, err => {
                if (err) {
                    logger.error('Email sent failed', {
                        message: msg,
                        email: this.email,
                        error: err
                    });
                    this.sendMsg(chatId, 'ارسال پیام با خطا مواجه شد.');
                }
            });
        });
    }

    getMessageContent(msg, cb) {
        let content = {};

        let processFile = (fileId, msgType, mailMsg, filename) => {
            this.bot.getFile(fileId).then(fileInfo => {
                fileInfo.filename = filename;
                this.saveFileFromTelegram(fileInfo, (err, filePath) => {
                    if (err) return cb(err);
                    content.text = mailMsg;
                    content.attachments = [{
                        filename: path.basename(filePath),
                        path: filePath
                    }];
                    cb(null, msgType, content);
                });
            }).catch(err => {
                logger.error('Telegram getFile failed', {
                    fileId: fileId, message: msg, token: this.botToken, error: err
                });
                cb(err);
            });
        };

        if (msg.photo) {
            // Todo: Check file sizes
            let index = Math.floor(msg.photo.length - 1);
            logger.silly('Sending photo', msg);
            let fileId = msg.photo[index].file_id;
            processFile(fileId, 'Photo', '(عکس ضمیمه شده است.)');
        } else if (msg.voice) {
            let fileId = msg.voice.file_id;
            logger.silly('Sending voice', msg);
            processFile(fileId, 'Voice', '(صدا ضمیمه شده است.)');
        } else if (msg.document) {
            let fileId = msg.document.file_id;
            logger.silly('Sending document', msg);
            processFile(fileId, 'Document', '(فایل ضمیمه شده است.)', msg.document.file_name);
        } else if (msg.text) {
            content.text = msg.text;
            logger.silly('Sending text', msg);
            cb(null, 'Text', content);
        }
        else {
            logger.debug('Unknown/unsupported message type: ', msg);
            cb(new Error('Unknown/unsupported message type: ', msg));
        }
    }

    saveFileFromTelegram(fileInfo, cb) {
        let botId = BotIdentifier.getBotId(this.botToken);
        let dir = path.join(configs.filesPath, botId);

        let saveFile = () => {
            let p = path.parse(fileInfo.filename || fileInfo.file_path);
            let filePath = path.join(dir, p.name + '_' + Date.now() + p.ext);

            request(`http://api.telegram.org/file/bot${this.botToken}/${fileInfo.file_path}`)
                .pipe(fs.createWriteStream(filePath))
                .on('close', () => {
                    cb(null, filePath);
                })
                .on('error', err => {
                    logger.error('Telegram file API request failed', {
                        token: this.botToken, file: fileInfo, error: err
                    });
                    cb(err);
                });
        };

        fs.exists(dir, exists => {
            if (!exists) fs.mkdir(dir, saveFile);
            else saveFile();
        });
    }

    saveMessage(discussion, msgType, content) {
        let msg = {
            messageType: msgType,
            content: content
        };
        Message.MessageModel.create(msg).then(m => {
            discussion.dialogue.push(m);
            discussion.save().catch(err => logger.error('Saving dialogue failed', {
                content: content, msgType: msgType, error: err
            }));
        }).catch(err => logger.error('SaveMessage failed', err));
    }

    /**
     * Generates a function to add new discussions to chat service
     * @param {string} chatId
     * @param chatService
     */
    addNewDiscussion(chatId, chatService) {
        return (discussionPlan) => {
            let startDate = discussionPlan ? discussionPlan.kind === 'TemporalPlan' ? null : Date.now() : null;
            let discussion = new Discussion.DiscussionModel({
                customerChatId: chatId,
                plan: discussionPlan,
                dialogue: [],
                startDate: startDate
            });
            discussion.save()
                .then(discussion => Discussion.DiscussionModel.populate(discussion, {path: 'plan'}))
                .then(discussion => {
                    chatService.discussions.push(discussion);
                    return chatService.save();
                }).then(() => {
                this.discussions.push(discussion);
                this.states.splice(this.states.findIndex(s => s.chatId === chatId), 1);
                this.sendMsg(chatId,
                    'مکالمه شما با موفقیت آغاز شد. اکنون می‌توانید پیام خود را نوشته و ارسال کنید.');
            }).catch(err => logger.error('AddNewDiscussion failed', err));
        };
    }

    emailReceived(bot, saveMessage) {
        return (emailInfo) => {

            function getEmailBody(node, body = '') {
                if (node.data) return node.data + '\n';
                if (node.children) {
                    for (let c of node.children)
                        body += getEmailBody(c);
                }
                return body;
            }

            function getRequiredEmailFields(email) {
                let e = {};
                e.from = email.from;
                e.to = email.to;
                e.subject = email.subject;
                e.text = email.text;
                e.html = email.html;
                e.date = email.date;
                e.receivedDate = email.receivedDate;
                e.attachments = email.attachments;
                e.cc = email.cc;
                e.spamScore = email.spamScore;
                e.spf = email.spf;
                e.dkim = email.dkim;
                if (email.connection) {
                    e.mailPath = email.connection.mailPath;
                    e.tlsOptions = email.connection.tlsOptions;
                }
                return e;
            }

            let emailContent = emailInfo.content;
            let response = '';

            if (emailContent.html) {
                logger.silly('Parse html to get message content');
                let $ = cheerio.load(emailContent.html);
                try {
                    let divNode = $('div')[0];
                    response = divNode ? getEmailBody(divNode) : emailContent.text;
                } catch (err) {
                    Raven.captureException(err);
                    logger.error('Email HTML parse failed', {
                        info: emailInfo,
                        email: this.email,
                        error: err
                    });
                    response = emailContent.text;
                }
            }
            else
                response = emailContent.text;

            let chatId = emailInfo.chatId;
            logger.debug('Processing email', emailInfo);
            let terminationIndex = response.indexOf('###');
            bot.sendMessage(chatId, terminationIndex === -1 ? response : response.substring(terminationIndex, 0));

            let discussion = this.discussions.find(s => s.customerChatId === chatId);

            if (!discussion) {
                // User's messages after discussion termination must be saved
                discussion = Discussion.DiscussionModel
                    .findOne({customerChatId: chatId})
                    .populate('dialogue')
                    .exec()
                    .then(d => saveMessage(d, 'Text', response))
                    .catch(err => logger.error('Saving email message failed', err));
                return;
            }

            // Temporal plans start after first email from provider
            if (!discussion.startDate)
                discussion.startDate = Date.now();

            let isFreePlan = !discussion.plan;
            if (!isFreePlan && discussion.plan.kind === 'MeetingPlan' && terminationIndex !== -1) {
                let index = this.discussions.findIndex(s => s.customerChatId === chatId);
                if (index !== -1) this.discussions.splice(index, 1);
                discussion.isActive = false;
                setTimeout(() => {
                    // Todo: Concat messages
                    bot.sendMessage(chatId, 'جلسه شما به اتمام رسیده‌است.');
                    this.sendMsg(chatId, 'برای شروع مجدد دستور /start را وارد نمایید.');
                }, 1000);
            }

            saveMessage(discussion, 'Email', {
                response: response,
                email: getRequiredEmailFields(emailContent)
            });
        };
    }

    respondToStart(msg) {
        let chatId = msg.chat.id;
        let support = () => this.sendMsg(chatId, 'قدرت گرفته از پرتاک Partalk');
        if (this.aboutBot)
            this.bot.sendMessage(chatId, this.aboutBot).then(() => support());
        else
            support();
    }
}

exports.BotService = BotService;
