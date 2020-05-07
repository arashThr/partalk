"use strict";
const express = require('express');
const bodyParser = require("body-parser");
const EventEmitter = require('events');

const configs = require("../conf/configs");
const TelegramBotWebHook = require('./telegramWebHook');
const ChatService = require("../model/ChatService");
const MeanBot = require('../model/MeanBot');
const BotService = require("../customerBot/bot").BotService;
const paymentListener = require("../customerBot/paymentListener");
const portalPayment = require('../customerBot/portalPayment');
const mailListener = require("../customerBot/mailListener");
const BotIdentifier = require('../common/BotIdentifier');

const db = require("../model/db");
const Plan = require("../plans/Plan");
const MeetingPlan = require("../plans/MeetingPlan");
const TemporalPlan = require("../plans/TemporalPlan");
const Settlements = require("./settlementRequest");
const ObjectId = require('mongoose').Types.ObjectId;

const Raven = require('raven');
const logger = require('../common/logger');
const util = require('util');
const sendLogMail = require('../customerBot/sendMail').sendLogMail;

if (!configs.isInDev)
    Raven.config(configs.sentryUrl)
        .install();

let dbUri = configs.mongoURI[process.env.NODE_ENV || 'development'];
db.connect(dbUri);

class ListenersEmitter extends EventEmitter {
}

let bots = [];

function getBotStatus(req, res) {
    let status = {};
    let token = req.body.token;
    let index = bots.findIndex(b => b.botService.botToken === token);
    status.started = index !== -1;
    res.status(200).send(status);
}

function initServices(webhook) {
    MeanBot.BotModel.find({started: true}, (err, meanBots) => {
        if (err) {
            logger.error('Error getting started bots', err);
            return;
        }

        function startBot(index) {
            if (index === -1)
                return;

            let bot = meanBots[index];
            let botId = BotIdentifier.getBotId(bot.token);
            let botEvents = new ListenersEmitter();

            let botService = new BotService(bot.user, bot.email, bot.token, bot.about, botEvents, bot.name);
            botService.start(err => {
                if (err)
                    return logger.error('Launching bot failed', {token: bot.token, error: err});
                else {
                    webhook.addBot(botService.bot);
                    bots.push({
                        botId: botId,
                        emitter: botEvents,
                        botService: botService
                    });
                    logger.info('Bot started in initialization', {token: bot.token});
                    startBot(index - 1);
                }
            });
        }

        if (meanBots.length > 0)
            startBot(meanBots.length - 1);
    });
}

let startBotService = webhook => (req, res) => {
    let bot = req.body.bot;
    let userId = new ObjectId(req.body.userId.toString());
    let plans = [];

    // Todo: Check it anything has changed
    if (bot.meetingPlan) {
        plans.push(new MeetingPlan.MeetingModel({
            fee: bot.meetingFee,
            planInfo: bot.meetingInfo
        }));
    }

    if (bot.temporalPlan) {
        plans.push(new TemporalPlan.TemporalModel({
            fee: bot.temporalFee,
            planInfo: bot.temporalInfo,
            duration: bot.duration
        }));
    }

    let isFree = bot.freePlan;
    if (isFree)
    // Ignore user request
        plans = [];

    Plan.PlanModel.create(plans).then(plans => {
        let token = bot.token;
        let chatService = {
            user: userId,
            botToken: token,
            email: bot.email,
            plans: plans
        };

        let options = {upsert: true, new: true, setDefaultsOnInsert: true};
        ChatService.ChatServiceModel.findOneAndUpdate({botToken: token}, chatService, options, err => {
            if (err) {
                logger.error('find one chat service for bot failed', {user: userId, token: token, error: err});
                return;
            }

            let index = bots.findIndex(b => b.botService.botToken === token);
            if (index !== -1) {
                bots[index].botService.restart(bot.email, bot.about, () => {
                    res.status(200).send('Bot restarted');
                });
                return;
            }

            let botId = BotIdentifier.getBotId(token);
            let botEvents = new ListenersEmitter();

            let botService = new BotService(userId, bot.email, token, bot.about, botEvents);
            botService.start(err => {
                if (err) {
                    logger.error('Launching bot failed', {token: token, error: err});
                    res.status(500).send('Launching bot failed');
                }
                else {
                    webhook.addBot(botService.bot);
                    bots.push({
                        botId: botId,
                        emitter: botEvents,
                        botService: botService
                    });
                    res.status(200).send('Bot started');
                }
            });
        });
    }).catch(err => {
        logger.error('Plan creation failed', {user: userId, token: bot.token, error: err});
    });
};

function stopBotService(req, res) {
    let botToken = req.body.token;
    let index = bots.findIndex(b => b.botService.botToken === botToken);

    if (index === -1) {
        logger.error('Bot stop failed: Bot not found', {token: botToken});
        res.sendStatus(500);
        return;
    }

    bots[index].botService.stop();
    res.status(200).send('Bot stopped');
    logger.debug(`Bot for ${botToken} has been exited.`);
}


let deleteBot = webhook => (req, res) => {
    let botToken = req.body.token;
    let index = bots.findIndex(b => b.botService.botToken === botToken);

    if (index === -1) {
        logger.error('Bot delete failed: Bot not found', {token: botToken});
        res.sendStatus(500);
        return;
    }

    bots[index].botService.removeBot();
    bots.splice(index, 1);
    webhook.removeBot(botToken);

    res.status(200).send('Bot deleted');
    logger.debug(`Bot for ${botToken} has been deleted.`);
};

function getReports(req, res) {
    let userId = new ObjectId(req.body.userId);
    Settlements.getPaymentsReport(userId, (err, paymentsReport) => {
        if (err) {
            logger.error('getPaymentReport failed', {user: userId, error: err});
            return res.status(500).send(err);
        }

        ChatService.ChatServiceModel.getUserDiscussions(userId, (err, chatServices) => {
            if (err) {
                logger.error('getUserDiscussions failed', {user: userId, error: err});
                return;
            }
            let discussions = chatServices.reduce((a, b) => a.concat(b.discussions), []);

            res.status(200).json({
                paymentsReport: paymentsReport,
                activeDiscussions: discussions
            });
        });
    });
}

function getAllPendingPayments(req, res) {
    Settlements.getAllPayments((err, result) => {
        if (err)
            return res.status(500).send(err.message);
        res.status(200).json(result);
    });
}

function registerSettlement(req, res) {
    let user = new ObjectId(req.body.userId);
    logger.info('Settlement request', user);
    Settlements.AddSettlementRequest(user, (err, isNew, settlement) => {

        sendLogMail('Settlement request',
            err ? `<p>Error:</p><pre>${util.inspect(err)}</pre>` : '' +
                `<p>Settlement:</p><pre>${util.inspect(settlement)}</pre>`);

        if (err) {
            logger.error('Settlement request failed', {
                user: user, error: err
            });
            res.status(500).send('Error occurred: ' + err);
        }
        // There's pending settlement already
        else if (!isNew)
            res.status(208).send('Pending');
        else
            res.status(200).end();
    });
}

function getDebt(req, res) {
    let user = new ObjectId(req.body.userId);
    Settlements.GetDebt(user, (err, data) => {
        if (err) {
            logger.error('Get use debt failed', {user: user, error: err});
            res.status(500).send('Error occurred: ' + err);
        }
        else
            res.status(200).json(JSON.stringify(data));
    });
}

function payDebt(req, res) {
    let settlementId = req.body.settlementId;
    logger.info('PayDebt request', {settlementId: settlementId});
    Settlements.payDebt(settlementId, (err) => {
        if (err) {
            logger.error('PayDebt failed', {settlementId: settlementId, error: err});
            res.status(500).send(err);
        }
        else
            res.sendStatus(200);
    });
}

function findPayment(msg, cb) {
    let payId = msg.payId;
    let Payment = require('../model/Payment');
    Payment.PaymentModel.findById(payId, (err, payment) => {
        if (err) {
            logger.error('Finding payment by id failed', err);
            cb(err);
        }
        else if (!payment) {
            logger.info('Request for payment that does not exists', {payId: payId});
            cb({message: 'چنین پرداختی یافت نشد.'});
        } else {
            let bot = bots.find(b => b.botService.botToken === payment.botToken);
            if (!bot) {
                logger.info('Request for payment that does not exists', {payId: payId});
                cb({
                    message: 'مسیر ارتباطی متناظر برای این پرداخت یافت نشد.',
                    details: `Bot not found for payment: ${payId}`
                });
                return;
            }
            let botService = bot.botService;
            let state = botService.states.find(s => s.chatId === payment.chatId);
            if (!state) {
                logger.info('Request for payment that does not exists', {payId: payId});
                cb({
                    message: 'لینک پرداخت منقضی شده.' +
                    ' لطفا در تلگرام دکمه بازگشت را زده و مجددا طرح مورد نظر را انتخاب کنید.',
                    details: `Payment link expired: ${payId}`,
                });
                return;
            }
            cb(null, payment.amount * 10);
        }
    });
}

function socketConnect(managerEvents) {
    return (socket) => {
        logger.debug('Socket connected');
        socket.on('findPayment', findPayment);
        socket.on('verifyPayment', paymentListener.verifyPayment(managerEvents));
    };
}

function start() {
    let webhookServerOpts = {
        port: configs.botPort
    };

    if (!configs.isInDev) {
        // Use self-signed certificate
        logger.debug('Read public/private keys to setup webhook');
        webhookServerOpts.key = `${__dirname}/cert/server.key`;
        webhookServerOpts.cert = `${__dirname}/cert/server.crt`;
    }

    let webhook = new TelegramBotWebHook(webhookServerOpts);
    logger.debug('Open webhook');
    webhook.open();

    let server = express();

    let managerEvents = new ListenersEmitter();

    mailListener.start(managerEvents);
    portalPayment.start();

    initServices(webhook);

    managerEvents.on('email', info => {
        logger.info('Email event received', {mailId: info.mailId});
        let {botId, chatId} = BotIdentifier.parseEmailId(info.mailId);
        if (!botId || !chatId) {
            try {
                let address = info.content.to[0].address;
                logger.info('Email received from other resources: ' + address);
                if (address === 'support@partalk.ir') {
                    sendLogMail("Support email", info.content.html, (err) => {
                        if (err) {
                            logger.error('Sending support email failed: ', err);
                        } else {
                            logger.debug('Support email sent successfully');
                        }
                    });
                }
            } catch (err) {
                logger.error('Support email send failed', info);
            }
            return;
        }
        logger.info('Sending email event', {botId: botId, chatId: chatId});
        let emitter;
        try {
            emitter = bots.find(b => b.botId === botId).emitter;
        } catch (err) {
            logger.error('There was no email emitter for this bot', err);
            return;
        }
        emitter.emit('email', {
            chatId: chatId,
            content: info.content
        });
    });

    managerEvents.on('payment', info => {
        logger.debug('Payment event received');
        let emitter;
        try {
            emitter = bots.find(b => b.botId === info.botId).emitter;
        } catch (err) {
            logger.error('There was no payment emitter for this bot', err);
            return;
        }
        emitter.emit('payment', {
            chatId: info.chatId,
            verified: info.verified,
            error: info.error
        });
    });

    server.use(bodyParser.json());

    server.head('/', function (req, res) {
        res.sendStatus(200);
    });

    server.post('/status', getBotStatus);
    server.post('/start', startBotService(webhook));
    server.post('/stop', stopBotService);
    server.post('/report', getReports);
    server.post('/settle', registerSettlement);
    server.post('/getDebt', getDebt);
    server.post('/payDebt', payDebt);
    server.post('/allDebts', getAllPendingPayments);
    server.post('/delete', deleteBot(webhook));

    let httpServer = require('http').createServer(server);

    let io = require('socket.io')(httpServer);

    io.on('connection', socketConnect(managerEvents));

    let port = configs.botManagerPort;
    httpServer.listen(port, () => {
        logger.info('Bot manager server started on ' + port);
    });
}

Raven.context(function () {
    start();
});
