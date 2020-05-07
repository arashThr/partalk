"use strict";
const configs = require('../conf/configs');
const express = require("express");
const multiparty = require("multiparty");

const async = require('async');
const fs = require('fs');
const util = require('util');
const logger = require('../common/logger');
const Raven = require('raven');

function processEmail(eventEmitter) {
    return (req, res) => {
        logger.debug('Receiving webhook.');

        /* Respond early to avoid timouting the mailin server. */
        // res.sendStatus(200);

        /* Parse the multipart form. The attachments are parsed into fields and can
         * be huge, so set the maxFieldsSize accordingly. */
        let form = new multiparty.Form({
            maxFieldsSize: 70000000
        });

        form.on('progress', function () {
            let start = Date.now();
            let lastDisplayedPercentage = -1;
            return function (bytesReceived, bytesExpected) {
                let elapsed = Date.now() - start;
                let percentage = Math.floor(bytesReceived / bytesExpected * 100);
                if (percentage % 20 === 0 && percentage !== lastDisplayedPercentage) {
                    lastDisplayedPercentage = percentage;
                    logger.silly('Form upload progress ' +
                        percentage + '% of ' + bytesExpected / 1000000 + 'Mb. ' + elapsed + 'ms');
                }
            };
        }());

        form.parse(req, function (err, fields) {
            if (err) {
                logger.error('Email parse failed: ', err);
                Raven.captureMessage('Email parse failed', {
                    extra: {error: err}
                });
                return;
            }

            let mailContent, mailId;
            try {
                mailContent = JSON.parse(fields.mailinMsg);
                mailId = mailContent.to[0].address.split('@')[0];
            } catch (err) {
                Raven.captureException(err, {
                    extra: {content: mailContent}
                });
                return;
            }

            eventEmitter.emit('email', {
                mailId: mailId,
                content: mailContent
            });

            /* Write down the payload for ulterior inspection. */
            async.auto({
                writeParsedMessage: function (cbAuto) {
                    fs.writeFile('payload.json', fields.mailinMsg, cbAuto);
                }
            }, function (err) {
                if (err) {
                    logger.error('Getting Attachments failed', err);
                    res.send(500, 'Unable to write payload');
                } else {
                    logger.debug('Webhook payload written.');
                    res.sendStatus(200);
                }
            });
        });
    };
}

let parseFakeEmail = (eventEmitter, cb) => (req, res) => {
    req.setEncoding('utf8');
    res.sendStatus(200);
    let rawData = '';
    req.on('data', chunk => rawData += chunk);
    req.on('end', () => {
        let {id, content} = JSON.parse(rawData);
        let mailContent = {
            to: [{
                address: `${id}.37037901@b.com`
            }],
            text: content
        };
        let mailId = mailContent.to[0].address.split('@')[0];
        eventEmitter.emit('email', {
            mailId: mailId,
            content: mailContent
        });
    });
};

function start(eventEmitter) {
    let server = express();
    server.head('/webhook', function (req, res) {
        logger.silly('Received head request from webhook.');
        res.sendStatus(200);
    });
    server.post('/webhook', processEmail(eventEmitter));
    server.post('/fake', parseFakeEmail(eventEmitter));
    // curl -d 'goood ###' localhost:5000/fake
    let port = configs.mailServerPort;
    server.listen(port, () => {
        console.log('Mail server started listening on port ' + port);
    });
}

exports.start = start;
