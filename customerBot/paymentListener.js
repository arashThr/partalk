"use strict";

const configs = require('../conf/configs');
const express = require("express");
const querystring = require("querystring");
const url = require("url");
const Payment = require("../model/Payment");
const BotIdentifier = require('../common/BotIdentifier');
const logger = require('../common/logger');
const util = require('util');
const sendLogMail = require('./sendMail').sendLogMail;

function verifyPayment(eventEmitter) {
    return (portalRes, cb) => {
        logger.info('Portal response', portalRes);
        let payId = portalRes.ResNum;

        Payment.PaymentModel.findById(payId, (err, payment) => {
            if (err) {
                sendLogMail('Database error for Payment', `<p>Errors:</p><pre>${util.inspect(err)}</pre>`);
                logger.error('Finding payment by id failed', err);
                return cb(err);
            }

            let result = {
                botId: BotIdentifier.getBotId(payment.botToken),
                chatId: payment.chatId
            };

            let planFee = payment.amount * 10;
            if (portalRes.State !== 'OK' || Number(portalRes.verifyRes) !== planFee) {
                sendLogMail('Failed payment',
                    `<p>Portal response:</p><pre>${JSON.stringify(portalRes, null, 4)}</pre>`);
                logger.warn(`Payment failed. Expected ${planFee} Rials`, {payId: payId});
                result.verified = false;
                eventEmitter.emit('payment', result);
                return cb(new Error('پراخت با خطا مواجه شد.'));
            }

            payment.refId = portalRes.RefNum;
            payment.payDate = Date.now();

            payment.save(err => {
                if (err) {
                    sendLogMail('Database error for Payment', `<p>Errors:</p><pre>${util.inspect(err)}</pre>`);
                    logger.error('Successful payment save failed',
                        {error: err, payId: payId});
                    return cb(err);
                }
                sendLogMail('Successful payment', `<p>Payment:</p>` +
                    `<p>Payment</p><pre>${JSON.stringify(payment, null, 4)}</pre>` +
                    `<p>Portal response: </p><pre>${JSON.stringify(portalRes, null, 4)}</pre>`);
                logger.info('Successful payment', {fee: planFee, payId: payId});
                result.verified = true;
                eventEmitter.emit('payment', result);
                cb();
            });
        });
    };
}

exports.verifyPayment = verifyPayment;
