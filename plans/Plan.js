"use strict";
const mongoose = require("mongoose");

let PlanSchema = new mongoose.Schema({
    fee: {type: Number, required: true},
    planInfo: {type: String, default: ''}
}, {discriminatorKey: 'kind'});

exports.PlanModel = mongoose.model('Plan', PlanSchema);
