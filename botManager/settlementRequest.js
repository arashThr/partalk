"use strict";
const Payment = require('../model/Payment');
const Settlement = require('../model/Settlement');

/**
 * @param user
 * @param cb
 */
function getPaymentsReport(user, cb) {
    Settlement.SettlementModel
        .findOne({user: user})
        .where('settlementDate').equals(null)
        .exec((err, s) => {
            if (err) return cb(err);

            return Payment.PaymentModel
                .find({user: user})
                .where('payDate').ne(null)
                .exec((err, payments) => {
                    if (err) return cb(err);

                    let report = {};
                    if (s) report.hasPendingSettlement = true;
                    report.totalPayments = payments.length;

                    let pending = payments.filter(p => p.settleStatus === 'Pending');
                    report.totalPending = pending.map(p => p.amount);
                    let paid = payments.filter(p => p.settleStatus === 'Paid');
                    report.totalPaid = paid.map(p => p.amount);
                    let newPayments = payments.filter(p => p.settleStatus === 'None');
                    report.newPayments = newPayments.map(p => p.amount);

                    cb(null, report);
                });
        });
}

exports.getAllPayments = function(cb) {
    Payment.PaymentModel.aggregate(
        [

            {
                $match: {
                    $and: [
                        {"payDate": {$ne: null}},
                        {"settleStatus": "Pending"}
                    ]
                }
            },
            {
                "$group": {
                    "_id": "$user",
                    "total": {$sum: "$amount"}
                }
            }
        ], cb);
};

function AddSettlementRequest(user, cb) {
    Settlement.SettlementModel
        .findOne({user: user})
        .where('settlement').ne(null)
        .exec((err, settlement) => {
            if (err) return cb(err);
            if (settlement) return cb(null, false, settlement);

            return Payment.PaymentModel
                .find({user: user})
                .where('payDate').ne(null)
                .where('settleStatus').equals('None')
                .exec((err, payments) => {
                    if (err) return cb(err);

                    let total = payments.reduce((acc, p) => acc + p.amount, 0);
                    if (total < 1)
                        return cb(null, true, settlement);
                    Settlement.SettlementModel.create({
                        user: user,
                        amount: total,
                        payments: payments,
                    }, (err, s) => {
                        if (err) return cb(err);

                        for (let p of payments) {
                            p.settleStatus = 'Pending';
                            p.save();
                        }

                        cb(null, true, s);
                    });
                });
        });
}

// For Admin

exports.payDebt = function (settlementId, cb) {
    return Settlement.SettlementModel
        .findOne({_id: settlementId})
        .populate('payments')
        .exec((err, s) => {
            if (err) return cb(err);
            let paymentError;
            let count = s.payments.length;

            for (let p of s.payments) {
                p.settleStatus = 'Paid';
                p.settled = settlementId;
                p.save(err => {
                    count -= 1;
                    paymentError = paymentError || err;
                    if (count === 0) {
                        s.settlementDate = Date.now();
                        s.save(err => {
                            cb(err || paymentError);
                        });
                    }
                });
            }
        });
};

exports.GetDebt = function (user, cb) {
    return Settlement.SettlementModel
        .findOne({user: user})
        .where('settlementDate').equals(null)
        .populate('payments')
        .exec((err, s) => {
            if (err) return cb(err);
            if (!s)
                cb(null, {
                    sId: null,
                    debt: 0
                });
            else
                cb(null, {
                    sId: s._id.toString(),
                    requestDate: s.requestDate,
                    debt: s.payments.reduce((acc, p) => acc + p.amount, 0)
                });
        });
};

exports.getPaymentsReport = getPaymentsReport;
exports.AddSettlementRequest = AddSettlementRequest;