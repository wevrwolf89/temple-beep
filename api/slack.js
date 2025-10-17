// api/slack.js
import { App, ExpressReceiver } from "@slack/bolt";

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  // IMPORTANT: mount Slack events at the root of /api/slack
  endpoints: { events: "/" },
});

// Health check (GET /api/slack -> ok)
receiver.router.get("/", (req, res) => res.status(200).send("ok"));

/**
 * Optional: explicit handler for Slack's URL verification.
 * If Slack sends { type: "url_verification", challenge: "..." }
 * this will short-circuit and echo the challenge.
 */
receiver.router.post("/", (req, res, next) => {
  if (req.body && req.body.type === "url_verification" && req.body.challenge) {
    return res.status(200).send(req.body.challenge);
  }
  return next();
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
  logLevel: "info",
});

// ----- your /form command (kept same) -----
app.command("/form", async ({ ack, body, client }) => {
  await ack();
  const FORM_URL = process.env.FORM_URL || "";
  await client.chat.postEphemeral({
    channel: body.channel_id,
    user: body.user_id,
    text: "Open the Incident Report Form:",
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: "*Incident Report Form*" } },
      ...(FORM_URL
        ? [{
            type: "actions",
            elements: [
              { type: "button", text: { type: "plain_text", text: "Open Form" }, url: FORM_URL }
            ]
          }]
        : [{ type: "section", text: { type: "mrkdwn", text: "_Form URL not configured._" } }])
    ]
  });
});

// Export the Express app for Vercel
export default receiver.app;
