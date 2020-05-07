"use strict";
const mongoose = require('mongoose');

let SettlementSchema = new mongoose.Schema({
    user: {type: mongoose.Schema.Types.ObjectId, ref: 'User', require: true},
    requestDate: {type: Date, require: true, default: Date.now},
    amount: {type: Number, require: true},
    payments: [{type: mongoose.Schema.Types.ObjectId, ref: 'Payment'}],
    settlementDate: {type: Date, default: null}
});

exports.SettlementModel = mongoose.model('Settlement', SettlementSchema);