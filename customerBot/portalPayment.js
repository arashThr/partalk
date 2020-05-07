"use strict";
const configs = require('../conf/configs');
const Payment = require('../model/Payment');

const http = require('http');
const path = require('path');
const logger = require('../common/logger');

exports.start = function start() {
    http.createServer((req, res) => {
        let payId = req.url.split('/')[1];

        if (payId === 'favicon.ico')
            return res.end();
        Payment.PaymentModel.findById(payId, (err, payment) => {
            if (err) {
                logger.error('Find payment by ID failed', err);
                res.writeHead(500);
                res.end('Getting payment failed');
                return;
            }
            if (!payment) {
                logger.info('Request for payment that does not exists', {payId: payId});
                res.writeHead(404);
                res.end('چنین پرداختی یافت نشد.');
                return;
            }
            res.writeHead(200, {'Content-Type': 'text/html'});
            let page = portalPage(payment.amount * 10, payId);
            res.end(page, 'utf8');
        });

    }).listen(configs.paymentPortalPort, () => {
        console.log('Payment portal server started on port ' + configs.paymentPortalPort);
    });
};

exports.pay = function (payment, cb) {
    let payUrl = configs.domain + '/payment/' + payment._id.toString();
    return cb(null, payUrl);
};

function portalPage(amount, resNum) {
    return `
<html>
<head>
  <meta charset="UTF-8">
</head>
<body>

<form action="https://sep.shaparak.ir/payment.aspx" method="post">
  <input type="hidden" name="Amount" value="${amount}"/>
  <input type="hidden" name="ResNum" value="${resNum}">
  <input type="hidden" name="RedirectURL" value="${configs.payment.verifyPaymentUrl}"/>
  <input type="hidden" name="MID" value="${configs.payment.samanMid}"/>
  <input type="submit" name="submit_payment" value="انتقال به درگاه پرداخت" class="Sep-submit"/>
</form>

<script type="text/javascript">window.onload = formSubmit;
function formSubmit() {
  document.forms[0].submit();
}
</script>

</body>
</html>
`;
}