"use strict";
const mongoose = require("mongoose");
const Plan = require('./Plan');

let MeetingSchema = new mongoose.Schema({
});

exports.MeetingModel = Plan.PlanModel.discriminator('MeetingPlan', MeetingSchema);
