const winston = require('winston');
const path = require('path');
const configs = require('../conf/configs');

let transports = [
    new (winston.transports.File)({
        name: 'info-file',
        filename: path.join(__dirname, '..', 'log', 'info.log'),
        humanReadableUnhandledException: true,
        maxsize: 5242880, //5MB
        maxFiles: 5,
        colorize: true,
        level: 'info'
    }),
    new (winston.transports.File)({
        name: 'error-file',
        humanReadableUnhandledException: true,
        filename: path.join(__dirname, '..', 'log', 'error.log'),
        colorize: true,
        level: 'error'
    })
];

if (configs.isInDev)
    transports.push(new winston.transports.Console({
        level: 'debug',
        json: false,
        colorize: true
    }));

const logger = new (winston.Logger)({
    transports: transports
});

console.log('log level > ' + winston.level);
if (process.env.LOG_LEVEL)
    winston.level = process.env.LOG_LEVEL;

module.exports = logger;