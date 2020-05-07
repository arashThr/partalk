"use strict";
const mongoose = require("mongoose");

let PaymentSchema = new mongoose.Schema({
    user: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    botToken: {type: String, require: true},
    chatId: {type: String, required: true},
    telegramChat: mongoose.Schema.Types.Mixed,
    amount: {type: Number, required: true},
    paymentRequest: {type: Date, required: true, default: Date.now},
    payDate: {type: Date, default: null},
    settleStatus: {type: String, enum: ['Paid', 'Pending', 'None'], default: 'None'},
    settled: {type: mongoose.Schema.Types.ObjectId, ref: 'Settlement'},
    refId: String
});

PaymentSchema.statics.findPendingPayment = function (chatId) {
    return this
        .find({chatId: chatId})
        .where('payDate').equals(null)
        .sort('-paymentRequest')
        .limit(1)
        .exec();
};

exports.PaymentModel = mongoose.model('Payment', PaymentSchema);
