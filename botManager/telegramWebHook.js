const debug = require('debug')('node-telegram-bot-api');
const _ = require('lodash');
const https = require('https');
const http = require('http');
const fs = require('fs');
const bl = require('bl');
const BPromise = require('bluebird');

class TelegramBotWebHook {
    /**
     * Sets up a webhook to receive updates
     *
     * @param  {Boolean|Object} options WebHook options
     * @param  {Number} [options.port=8443] Port to bind to
     */
    constructor(options) {
        // define opts
        if (typeof options === 'boolean') {
            options = {}; // eslint-disable-line no-param-reassign
        }

        this._regex = new RegExp('a^'); // matches nothing
        this.bots = [];

        this.options = options;
        this.options.port = options.port || 8443;
        this.options.https = options.https || {};
        this._webServer = null;
        this._open = false;
        this._requestListener = this._requestListener.bind(this);
        TelegramBotWebHook._parseBody = TelegramBotWebHook._parseBody.bind(this);

        if (this.options.key && this.options.cert) {
            debug('HTTPS WebHook enabled (by key/cert)');
            this.options.https.key = fs.readFileSync(this.options.key);
            this.options.https.cert = fs.readFileSync(this.options.cert);
            this._webServer = https.createServer(this.options.https, this._requestListener);
        } else if (this.options.pfx) {
            debug('HTTPS WebHook enabled (by pfx)');
            this.options.https.pfx = fs.readFileSync(this.options.pfx);
            this._webServer = https.createServer(this.options.https, this._requestListener);
        } else if (Object.keys(this.options.https).length) {
            debug('HTTPS WebHook enabled by (https)');
            this._webServer = https.createServer(this.options.https, this._requestListener);
        } else {
            debug('HTTP WebHook enabled');
            this._webServer = http.createServer(this._requestListener);
        }
    }

    /**
     *
     * @param {TelegramBot} bot
     */
    addBot(bot) {
        this.bots.push({
            token: bot.token,
            processUpdate: bot.getProcessUpdate()
        });
        this._regex = new RegExp(this.bots.map(b => b.token).join('|'));
    }

    removeBot(botToken) {
        let index = this.bots.findIndex(b => b.token === botToken);
        if (index === -1)
            return;

        this.bots.splice(index, 1);
        this._regex = new RegExp(this.bots.map(b => b.token).join('|'));
    }

    /**
     * Open WebHook by listening on the port
     * @return {BPromise}
     */
    open() {
        if (this.isOpen()) {
            return BPromise.resolve();
        }
        return new BPromise(resolve => {
            this._webServer.listen(this.options.port, this.options.host, () => {
                debug('WebHook listening on port %s', this.options.port);
                this._open = true;
                return resolve();
            });
        });
    }

    /**
     * Close the webHook
     * @return {BPromise}
     */
    close() {
        if (!this.isOpen()) {
            return BPromise.resolve();
        }
        return new BPromise((resolve, reject) => {
            this._webServer.close(error => {
                if (error) return reject(error);
                this._open = false;
                return resolve();
            });
        });
    }

    /**
     * Return `true` if server is listening. Otherwise, `false`.
     */
    isOpen() {
        // NOTE: Since `http.Server.listening` was added in v5.7.0
        // and we still need to support Node v4,
        // we are going to fallback to 'this._open'.
        // The following LOC would suffice for newer versions of Node.js
        // return this._webServer.listening;
        return this._open;
    }

    // used so that other funcs are not non-optimizable
    static _safeParse(json) {
        try {
            return JSON.parse(json);
        } catch (err) {
            debug(err);
            return null;
        }
    }

    /**
     * Handle request body by passing it to 'callback'
     * @private
     */
    static _parseBody(cb) {
        return (err, body) => {
            if (err) {
                return debug(err);
            }

            const data = TelegramBotWebHook._safeParse(body);
            if (data) {
                return cb(data);
            }

            return null;
        };
    }

    /**
     * Listener for 'request' event on server
     * @private
     */
    _requestListener(req, res) {
        debug('WebHook request URL: %s', req.url);
        debug('WebHook request headers: %j', req.headers);

        // If there isn't token on URL
        if (!this._regex.test(req.url)) {
            debug('WebHook request unauthorized');
            res.statusCode = 401;
            res.end();
        } else if (req.method === 'POST') {
            let token = _.last(req.url.split('/'));
            let cb = this.bots.find(b => 'bot' + b.token === token).processUpdate;
            req
                .pipe(bl(TelegramBotWebHook._parseBody(cb)))
                .on('finish', () => res.end('OK'));
        } else {
            // Authorized but not a POST
            debug('WebHook request isn\'t a POST');
            res.statusCode = 418; // I'm a teabot!
            res.end();
        }
    }
}

module.exports = TelegramBotWebHook;
