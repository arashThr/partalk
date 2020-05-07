"use strict";
const path = require('path');
const fs = require('fs');

let isInDev = (process.env.NODE_ENV || 'development') === 'development';

let ngrokUrl = process.env.NGROK_URL;
if (isInDev && !ngrokUrl) {
    console.error('ngrok URL is not set');
    process.exit(1);
}

let fakePayment = process.argv[2] === '--fake';

// Todo: Consider separating config files for dev and production
let configs = {
    mongoURI: {
        development: 'mongodb://localhost/mean-dev',
        production: 'mongodb://localhost/manager-db',
        test: 'mongodb://localhost/test'
    },
    payment: {
        useThirdParty: false, // So we can fake it
        samanMid: process.env.SAMAN_MID,
        verifyPaymentUrl: process.env.VERIFICATION_URL
    },
    isInDev: isInDev,
    fakePayment: isInDev || fakePayment,
    domain: isInDev ? 'http://127.0.0.1:3000' : 'http://partalk.ir',

    botManagerPort: 9090,
    paymentListenerPort: 5050,
    paymentPortalPort: 6060,
    mailServerPort: 7070,
    botPort: 8443,
    webhookPort: isInDev ? 443 : 8443, // 443 for ngrok
    webhookUrl: isInDev ? ngrokUrl : 'https://partalk.ir',

    filesPath: isInDev ? path.join(__dirname, '..', 'tmp/files') : '../../files',
    logMail: process.env.LOG_MAIL || 'log@mail.com',
    app: {
        timeFactor: 1000, // seconds
    },
    sentryUrl: process.env.SENTRY_URL
};

if(!fs.existsSync(configs.filesPath))
    fs.mkdirSync(configs.filesPath);

// Check log files directory exist
if (!fs.existsSync('../log'))
    fs.mkdir('../log');

module.exports = configs;
