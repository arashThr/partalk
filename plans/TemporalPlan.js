"use strict";
const mongoose = require("mongoose");
const Plan = require('./Plan');

let TemporalSchema = new mongoose.Schema({
    duration: {type: Number, require: true}
});

exports.TemporalModel = Plan.PlanModel.discriminator('TemporalPlan', TemporalSchema);
