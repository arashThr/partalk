"use strict";
const mongoose = require("mongoose");

let MessageSchema = new mongoose.Schema({
    messageType: {type: String, enum: ['Text', 'Photo', 'Voice', 'Document', 'Email']},
    content: mongoose.Schema.Types.Mixed,
    date: {type: Date, default: Date.now}
});

exports.MessageModel = mongoose.model("Message", MessageSchema);
