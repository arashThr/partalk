"use strict";
const nodemailer = require("nodemailer");
const configs = require("../conf/configs");
const BotIdentifier = require('../common/BotIdentifier');
const logger = require('../common/logger');

let options;

if (configs.isInDev)
    options = {
        host: '0.0.0.0',
        port: 1025,
        ignoreTLS: true,
    };
else
    options = {
        host: 'mail.partalk.ir',
        port: 25,
        ignoreTLS: true,
        auth: {
            user: process.env.MAILER_EMAIL_ID,
            pass: process.env.MAILER_PASSWORD
        },
        tls: {rejectUnauthorized: false}
    };

let transporter = nodemailer.createTransport(options);

function sendEmail(userEmail, token, botName, content, msg, cb) {
    let chatId = String(msg.chat.id);

    let name = `${msg.from.first_name} ${msg.from.last_name || '-'}`;
    let subject = botName + ' - ' + (name.trim() === '' ? 'unknown' : name);
    
    let emailUsername = BotIdentifier.emailIdentifier(token, chatId);
    content.from = `Partalk <${emailUsername}@mailer.partalk.ir>`;
    content.to = userEmail;
    content.subject = subject;

    transporter.sendMail(content, (err, info) => {
        if (err)
            return cb(err);

        logger.debug('Email sent', {response: info.response});
        cb(null);
    });
}

function sendLogMail(subject, html, cb) {
    let recp = configs.logMail;
    let content = {
        from: `Partalk Log <log@partalk.ir>`,
        subject: subject,
        to: recp,
        html: html
    };

    transporter.sendMail(content, (err, info) => {
        if (err) {
            logger.error('Error sending email log', err);
            if (cb)
                return cb(err);
            return;
        }
        logger.debug('Log email sent', {response: info.response});
        if (cb)
            return cb();
    });
}

exports.sendMail = sendEmail;
exports.sendLogMail = sendLogMail;
