"use strict";
const mongoose = require("mongoose");

let DiscussionSchema = new mongoose.Schema({
    customerChatId: String,
    isActive: {type: Boolean, default: true},
    plan: {type: mongoose.Schema.Types.ObjectId, ref: 'Plan'},
    dialogue: [{type: mongoose.Schema.Types.ObjectId, ref: 'Message'}],
    startDate: {type: Date, default: null}
});

exports.DiscussionModel = mongoose.model('Discussion', DiscussionSchema);
