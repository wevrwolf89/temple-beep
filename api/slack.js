const { App, ExpressReceiver } = require("@slack/bolt");
const serverless = require("serverless-http");

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
});

// plug in all handlers from handlers.js
const attach = require("../handlers");
attach(app);

// export serverless function for Vercel
module.exports = serverless(receiver.app);
