# Partalk server
Partalk is a communication facilitator layer on top of Telegram bots that takes care of measured sessions. (No longer available)

## What was Partalk
This service was designed to create measured sessions between customers and consultants.
People could easily add their Telegram bot tokens in Partalk website. After defining a plan for the bot they could start it.

Generally there were two type of plans: Free and charged. In case the plan was defined with charges, customers had to pay before they could send message to bot owner.

Free plans were suitable for support systems. Since Partalk used emails to interact with Telegram bot, it could provide a single source for all the support related tasks.

On customer side everything was same as usual Telegram chats. The only difference was when fee was determined for the plan, which in that case they had to pay before they could send messages.

These messages would then be sent as email to the bot owner. Responding to customer was done by replying to that email.

Detailed explanation can be found in `partalk-manual.pdf` (In Farsi)

## Partalk-Server
The codes in this repository are the core of how Partalk creates its Telegram bot pool and how it handles interactions between customers and users.

Although, the frontier which makes it 100% usable is not available at the moment.

**So think of this repository as an example on how to work with Telegram bots, emails, handling states using FSF and interacting with payment gateways in NodeJs**. Also take into consideration that the code base in pretty old and dates back to when I was very inexperienced in Node, so you might see some rookie mistakes in it.

## Requirements
- NodeJs
- Mongo
- [Maildev](https://www.npmjs.com/package/maildev)
- [ngrok](https://ngrok.com)

### How to test bot locally
- Make sure mongo is running
- Start `ngrok`: `./ngrok http 8443`
- Set `NGROK_URL` to the given address: `NGROK_URL=https://.*.ngrok.io`
- Start `maildev` to get emails
- Run `tokenGenerator.js`
- Unset `NODE_ENV` or set it to `development`
- Make sure bot is started
    - Use website
    - Send curl request: /start/{botId}: `curl localhost:3000/api/bots/start/58b07d163fdbbed4a4909790`

#### Fake payment
`curl -d "1" "localhost:5050/payment?identifier=SGNQ_37037901&refid=400450522"`

#### Send message
`curl -d '{"id": "SGNQ", "content": "bot1 bye ###"}' localhost:7070/fake`

### Partalk in production
- Start `mailin` by entering `node ~/.npm-global/bin/mailin -w http://localhost:7070/webhook`
- Production assets are created from `main` source file address in `bower.json`

