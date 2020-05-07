db.bots
```
{
    "_id" : ObjectId("..."),
    "user" : ObjectId("..."),
    "email" : "me@gmail.com",
    "token" : "botToken",
    "created" : ISODate("1970-05-02T03:18:04.953-05:30"),
    "freePlan" : true,
    "meetingInfo" : "It's session based",
    "meetingFee" : 1000,
    "meetingPlan" : true,
    "temporalInfo" : "",
    "temporalFee" : 1000,
    "duration" : 1,
    "temporalPlan" : true,
    "about" : "",
    "name" : "Bot name",
    "started" : true,
    "__v" : 0
}
```

Manually create discussion
```js

// Create discussion
db.discussions.insert({
    "customerChatId" : "37037901",
    "plan" : ObjectId("597de154dd182e08edee7dec"),
    "startDate" : new Date(),
    "dialogue" : [],
    "isActive" : true,
    "__v": 0
});
 
// Add discussion to chatServices
db.chatservices.update(
    {"_id" : ObjectId("58ed1dcf0bb1840db4727fa5")},
    {$push : {discussions: ObjectId("597de5cfce822dd434cbb838")} }
);
```

*Server should be restarted*

Get payments list:
```js
db.getCollection('payments').find( { $and: [ {payDate: {$ne:null}}, {user: {$ne: ObjectId("58f576bbff17d64843edfd4d")}} ] })
```
