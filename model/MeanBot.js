'use strict';

const mongoose = require('mongoose'),
    Schema = mongoose.Schema;

let BotSchema = new Schema({
    email: {
        type: String,
        required: 'Email is required'
    },
    token: {
        type: String,
        require: 'Bot token must be provided',
        unique: true
    },
    botId: {
        type: Number,
        require: true,
        unique: true
    },
    username: {
        type: String,
        require: true,
        unique: true
    },
    botName: {
        type: String
    },
    started: {
        type: Boolean,
        default: false
    },
    name: {
        type: String,
        default: '',
        required: 'Please fill Bot name',
        trim: true
    },
    about: {
        type: String,
        default: '',
        trim: true
    },
    temporalPlan: {
        type: Boolean,
        default: false
    },
    duration: {
        type: Number,
        default: 10
    },
    temporalFee: {
        type: Number,
        default: 10
    },
    temporalInfo: {
        type: String,
        default: ''
    },
    meetingPlan: {
        type: Boolean,
        default: false
    },
    meetingFee: {
        type: Number,
        default: 10
    },
    meetingInfo: {
        type: String,
        default: ''
    },
    freePlan: {
        type: Boolean,
        default: false
    },
    created: {
        type: Date,
        default: Date.now
    },
    user: {
        type: Schema.ObjectId,
        ref: 'User'
    }
});

exports.BotModel = mongoose.model('Bot', BotSchema);
