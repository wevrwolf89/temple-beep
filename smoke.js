const { App } = require("@slack/bolt");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,     // xoxb-...
  appToken: process.env.SLACK_APP_TOKEN,  // xapp-... (connections:write)
  socketMode: true,
  logLevel: 'debug'
});

app.command("/beep", async ({ ack, respond }) => {
  await ack();
  await respond("✅ BEEP command received.");
});

(async () => {
  await app.start();
  console.log("Smoke test running");
})();
