/* jshint -W100 */
"use strict";
const Payment = require("../model/Payment");
const javascriptStateMachine = require("javascript-state-machine");
const portalPayment = require('./portalPayment');
const BotIdentifier = require('../common/BotIdentifier');
const configs = require('../conf/configs');
const logger = require('../common/logger');

let plansOptions = {
    MeetingPlan: 'طرح جلسه‌‌ای',
    TemporalPlan: 'طرح زمانی'
};

let buyPlanOptions = {
    buy: 'بله',
    goToMenu: 'بازگشت',
};

function createChoosePlanFsm(userId, bot, telegramChat, allPlans, getSelectedPlan) {
    let chatId = String(telegramChat.id);
    let sm = msg => bot.sendMessage(chatId, msg);
    let messageId;

    return javascriptStateMachine.StateMachine.create({
        initial: {state: 'plans', event: 'checkPlans'},
        events: [
            {name: 'choosePlan', from: 'plans', to: 'chosenPlan'},
            {name: 'buyPlan', from: 'chosenPlan', to: 'verify'},
            {name: 'wait', from: 'verify', to: 'verify'},
            {name: 'successfulPayment', from: 'verify', to: 'verified'},
            {name: 'failedPayment', from: 'verify', to: 'chosenPlan'},
            {name: 'return', from: '*', to: 'plans'},
            {name: 'badInput', from: '*', to: 'plans'},
            {name: 'finalize', from: 'paid', to: 'end'},
        ],
        callbacks: {
            onenterplans: checkPlans,
            onchosenPlan: showPlanDetails,
            onbuyPlan: sendPaymentLink,
            onwait: pleaseWait,
            onbeforefailedPayment: failedPaymentMessage,
            onsuccessfulPayment: successPayment,
            onbeforebadInput: () => sm('ورودی نامناسب است.')
        }
    });

    function successPayment() {
        bot.editMessageText('پرداخت شما با موفقیت انجام شد.', {
            chat_id: chatId, message_id: messageId
        });
    }

    function failedPaymentMessage() {
        bot.editMessageText('اعتبارسنجی پرداخت شما با شکست روبرو شد.', {
            chat_id: chatId, message_id: messageId
        });
    }

    function pleaseWait() {
        logger.silly(chatId + ' is in pleaseWait');

        bot.editMessageReplyMarkup({
            inline_keyboard: [[]]
        }, {chat_id: chatId, message_id: messageId});

        bot.sendMessage(chatId, 'پراخت صورت نگرفته. لطفا شکیبا باشید. ' +
            'در صورت عدم تمایل به پرداخت گزینه بازگشت را انتخاب کنید.',
            getMessageOptions([{text: buyPlanOptions.goToMenu, cb: 'cancelPayment'}])).then(msg => {
            messageId = msg.message_id;
        });
    }

    function checkPlans() {
        logger.silly(chatId + ' is in checkPlans');
        let plansNames = allPlans.map(p => {
            let key = {};
            key.text = plansOptions[p.kind];
            return key;
        });
        let options = getMessageOptions(plansNames);
        bot.sendMessage(chatId, 'لطفا طرح مورد نظر خود را از بین گزینه‌های موجود انتخاب نمایید ...', options);
    }

    function showPlanDetails() {
        logger.silly(chatId + ' is in showPlanDetails');
        let options = getMessageOptions([
            {text: buyPlanOptions.buy},
            {text: buyPlanOptions.goToMenu}
        ]);

        let digits = {
            '1': '۱', '2': '۲', '3': '۳', '4': '۴',
            '5': '۵', '6': '۶', '7': '۷', '8': '۸', '9': '۹', '0': '۰'
        };
        let makeFarsi = (str) => String(str).split('').map(d => digits[d] || d).join('');
        let fee = makeFarsi(getSelectedPlan().fee);
        let planInfo = getSelectedPlan().planInfo;
        let msgs = [];
        if (planInfo)
            msgs.push(planInfo);
        msgs.push(`هزینه طرح ${fee} تومان است.`);
        if (getSelectedPlan().kind === 'MeetingPlan')
            msgs.push('این طرح جلسه‌ایست و پایان آن توسط خدمات‌دهنده مشخص می‌شود.');

        else {
            let totalMinutes = getSelectedPlan().duration;
            let days = Math.floor(totalMinutes / 1440);
            let rem = (totalMinutes % 1440);
            let hours = Math.floor(rem / 60);
            let minutes = rem % 60;

            let d = [];
            if (days !== 0) d.push(days + ' روز');
            if (hours !== 0) d.push(hours + ' ساعت');
            if (minutes !== 0) d.push(minutes + ' دقیقه');

            let durationStr = makeFarsi(d.join(' و '));

            msgs.push('این طرح زمانی است. مدت زمان استفاده از طرح ' + durationStr + ' است.');
        }
        msgs.push('کاربر گرامی، لطفا پیش از' +
            ' خرید اطمینان حاصل فرمایید که نسبت به اعتبار و خوش‌قولی سرویس‌دهنده خود اعتماد کافی دارید. قابل ذکر است' +
            ' که پرتاک هیچگونه مسئولیتی در قبال ٖ کیفیت و چگونگی خدمات عرضه شده توسط سرویس دهندگان بر عهده ندارد.');

        msgs.push('آیا مایل به خرید طرح هستید ؟');

        bot.sendMessage(chatId, msgs.join('\n\n'), options);
    }

    function getMessageOptions(keys) {
        let cbKeys = [];
        for (let key of keys) {
            let k = {};
            k.text = key.text;
            k.callback_data = key.cb || key.text;
            cbKeys.push(k);
        }

        return {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [cbKeys]
            }
        };
    }

    function sendPaymentLink() {
        logger.silly(chatId + ' is in sendPaymentLink');
        let amount = getSelectedPlan().fee;

        let sendPaymentUrl = (err, paymentUrl) => {
            if (err) {
                sm('در دسترسی به سامانه پرداخت خطا رخ داد.');
                logger.error('Portal access failed for ' + chatId, err);
                return;
            }
            bot.sendMessage(chatId, 'برای هدایت شدن درگاه از طریق دکمه پرداخت اقدام نمایید.' + '\r\n' +
                'پس از انجام پرداخت مدتی برای اعتبارسنجی خود صبر کنید. این کار به سرعت انجام می‌شود.' + '\r\n' +
                'در صورت داشتن هر سوالی با پشتیبان پرتاک @PartalkSupportBot تماس بگیرید.', {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [[
                        {text: 'پرداخت', url: paymentUrl, callback_data: 'payment'},
                        {text: 'بازگشت', callback_data: 'cancelPayment'}
                    ]]
                }
            }).then(msg => {
                messageId = msg.message_id;
            });
        };

        let p = {
            user: userId,
            botToken: bot.token,
            chatId: chatId,
            telegramChat: telegramChat,
            amount: amount
        };
        Payment.PaymentModel.create(p, (err, payment) => {
            if (err) {
                sm('خطای پرداخت رخ داد.');
                // Todo: return to menu
                logger.error('Create payment failed', {
                    payment: p, error: err
                });
            }

            portalPayment.pay(payment, sendPaymentUrl);
        });
    }
}
class ChoosePlanFsm {
    /**
     * @constructor
     * @param { ObjectId } userId
     * @param { TelegramBot } bot
     * @param telegramChat
     * @param { Plan[] } plans
     * @param finalize
     */
    constructor(userId, bot, telegramChat, plans, finalize) {
        this.chatId = String(telegramChat.id);
        this.selectablePlans = plans;
        this.cb = finalize;
        this.selectedPlan = undefined;
        this.bot = bot;
        this.fsm = createChoosePlanFsm(userId, bot, telegramChat, plans, () => {
            return this.selectedPlan;
        });
    }

    plans(cbq) {
        this.bot.answerCallbackQuery(cbq.id);
        let planName = Object.keys(plansOptions).find(p => plansOptions[p] === cbq.data);
        if (!planName)
            return this.fsm.badInput();
        this.selectedPlan = this.selectablePlans.find(p => p.kind === planName);
        this.fsm.choosePlan();
    }

    chosenPlan(cbq) {
        this.bot.answerCallbackQuery(cbq.id);

        let action = cbq.data;
        if (action === buyPlanOptions.buy)
            this.fsm.buyPlan();
        else if (action === buyPlanOptions.goToMenu)
            this.fsm.return();
        else
            this.fsm.badInput();
    }

    verify(cbq) {
        this.bot.answerCallbackQuery(cbq.id);

        if (cbq.data === buyPlanOptions.goToMenu)
            this.fsm.return();
        else
            this.fsm.wait();
    }

    verifyEvent(verified) {
        if (!verified)
            return this.fsm.failedPayment();

        this.fsm.successfulPayment();
        this.cb(this.selectedPlan);
    }
}

exports.ChoosePlanFsm = ChoosePlanFsm;
