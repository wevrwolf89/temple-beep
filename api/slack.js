// api/slack.js
import { App, ExpressReceiver } from "@slack/bolt";

// ---- Express/Bolt receiver mounted at "/" for Vercel's /api/slack route
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  endpoints: { events: "/" }, // Slack will POST url_verification + events here
});

// Simple health check so visiting /api/slack in a browser shows something
receiver.router.get("/", (req, res) => {
  res.status(200).type("text/plain").send("ok");
});

// ---- Bolt app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
  // logLevel: "debug",
});

// Example (keep or remove). Works after the Events URL is verified.
app.command("/form", async ({ ack, body, client }) => {
  await ack();
  const FORM_URL = process.env.FORM_URL || "";
  await client.chat.postEphemeral({
    channel: body.channel_id,
    user: body.user_id,
    text: FORM_URL ? "Open the Incident Report Form:" : "Form URL not configured.",
    blocks: FORM_URL
      ? [
          { type: "section", text: { type: "mrkdwn", text: "*Incident Report Form*"} },
          { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open Form" }, url: FORM_URL }] }
        ]
      : undefined,
  });
});

// ---- Export the Express app for Vercel
export default receiver.app;
