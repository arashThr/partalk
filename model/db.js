"use strict";
const mongoose = require("mongoose");
require('mongoose').Promise = global.Promise;

class db {
    static connect(db) {
        try {
            // Todo: checkout https://github.com/Automattic/mongoose/issues/4951#issuecomment-279212889
            mongoose.Promise = global.Promise;
            mongoose.connect(db);
        }
        catch (e) {
            throw e;
        }
    }

    static disconnect() {
        mongoose.disconnect();
    }

    static debug(debug) {
        mongoose.set('debug', debug);
    }

    static dropDb(cb) {
        mongoose.connection.dropDatabase(cb);
    }
}

module.exports = db;
