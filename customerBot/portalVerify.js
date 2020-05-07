"use strict";
const http = require('http');
const https = require('https');
const fs = require('fs');
const qs = require('querystring');
const soap = require('soap');
const configs = require('../conf/configs');
const Raven = require('raven');

Raven.config(configs.sentryUrl).install();

const soapServiceUrl = 'https://sep.shaparak.ir/payments/referencepayment.asmx?WSDL';
const hostname = 'partalk.ir';

function server(req, res) {
    console.log('Processing request: ' + req.url);

    // verifyPayment
    if (req.url !== '/vp') {
        res.end();
        return;
    }

    let raw = '';

    req.on('data', d => {
        raw += d;
        if (raw.length > 1e6)
            req.connection.destroy();
    });

    req.on('end', () => {
        console.log('> ' + raw);
        let post = qs.parse(raw);

        fs.writeFileSync('payload.txt', raw);

        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8'
        });

        res.write('شماره پیگیری: ' + post.RefNum + '\n');
        if (post.State !== 'OK' || Number(post.StateCode) !== 0) {
            res.end('پرداخت موفقیت آمیز نبود: ' + post.State);
            sendRequest(post);
            return;
        }

        soap.createClient(soapServiceUrl, (err, client) => {
            if (err) {
                console.error(err);
                Raven.captureMessage('Create SOAP Client failed', {
                    extra: {error: err}
                });
                return;
            }
            let refNum = qs.unescape(post['RefNum']);
            let mid = post['MID'];
            client.verifyTransaction({String_1: refNum, String_2: mid}, (err, verifyRes) => {
                console.log('SOAP Result: ', verifyRes);
                if (err) {
                    console.error(err);
                    Raven.captureMessage('Verify transaction failed', {
                        extra: {error: err}
                    });
                    res.end('پرداخت با خطا مواجه شد.');
                    return;
                }
                verifyRes = verifyRes.result.$value;
                post.verifyRes = verifyRes;
                if (verifyRes < 0) {
                    // Reverse transaction
                    console.error('Payment failed: ' + verifyRes);
                }
                else {
                    console.log('Successful');
                }

                sendRequest(post, res);
            });
        });
    });
}

function sendRequest(obj, htmlRes) {
    let body = JSON.stringify(obj);
    let options = {
        hostname: hostname,
        method: 'POST',
        path: '/portal',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
        }
    };
    let verifyReq = https.request(options, res => {
        res.pipe(htmlRes);
    });

    verifyReq.on('error', err => {
        console.error(err);
        Raven.captureMessage('Request send failed', {
            extra: {error: err}
        });
    });

    verifyReq.write(body);
    verifyReq.end();
}

Raven.context(function () {
    http.createServer(server).listen(6060, () => {
        console.log('Verify server started');
    });
});
