"use strict";
const mongoose = require("mongoose");

let ChatServiceSchema = new mongoose.Schema({
    user: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    email: String,
    botToken: String,
    plans: [{type: mongoose.Schema.Types.ObjectId, ref: 'Plan'}],
    discussions: [{type: mongoose.Schema.Types.ObjectId, ref: 'Discussion'}]
});

ChatServiceSchema.statics.getActiveDiscussions = function (userId, cb) {
    return this
        .find({user: userId})
        .populate('plans')
        .populate({
            path: 'discussions',
            match: {isActive: true},
            populate: {path: 'plan'}
        }).exec(cb);
};

// Todo : const ObjectId = require('mongoose').Types.ObjectId;
ChatServiceSchema.statics.getUserDiscussions = function (userId, cb) {
    return this
        .find({user: userId})
        .populate('plans')
        .populate({
            path: 'discussions',
            populate: {path: 'plan'}
        }).exec(cb);
};

// Todo: Rename to `populateActiveDiscussions`
ChatServiceSchema.statics.botActiveDiscussions = function (token, cb) {
    return this
        .findOne({botToken: token})
        .populate('plans')
        .populate({
            path: 'discussions',
            match: {isActive: true},
            populate: {path: 'plan'}
        }).exec(cb);
};

exports.ChatServiceModel = mongoose.model("ChatService", ChatServiceSchema);
