// api/slack.js
// CommonJS style (works well with your current build)

const { App, ExpressReceiver, LogLevel } = require("@slack/bolt");
const express = require("express");

// ---- Normalize and validate env vars ----
const rawBot = process.env.SLACK_BOT_TOKEN || "";
const rawSign = process.env.SLACK_SIGNING_SECRET || "";
const rawForm = process.env.FORM_URL || "";

const SLACK_BOT_TOKEN = rawBot.trim();
const SLACK_SIGNING_SECRET = rawSign.trim();
const FORM_URL = rawForm.trim();

function bad(msg) {
  console.error(`[config] ${msg}`);
  throw new Error(msg);
}

if (!SLACK_BOT_TOKEN || !SLACK_BOT_TOKEN.startsWith("xoxb-")) {
  bad("SLACK_BOT_TOKEN missing/invalid (or has whitespace).");
}
if (!SLACK_SIGNING_SECRET || /\s/.test(SLACK_SIGNING_SECRET)) {
  bad("SLACK_SIGNING_SECRET missing/invalid (or has whitespace).");
}

// ---- Receiver mounted at "/" so one URL handles everything ----
const receiver = new ExpressReceiver({
  signingSecret: SLACK_SIGNING_SECRET,
  // Mount Slack endpoints at the root of this Vercel function:
  endpoints: {
    commands: "/",     // slash commands
    actions: "/",      // interactivity (block_actions, view submissions, etc.)
    events: "/",       // events API (also used for url_verification)
  },
});

// Health check (GET /api/slack)
receiver.router.get("/", (_req, res) => res.status(200).send("ok"));

// Explicit url_verification helper (Slack may hit POST / with a challenge)
receiver.router.post("/", express.json(), (req, res, next) => {
  try {
    if (req.body && req.body.type === "url_verification" && req.body.challenge) {
      return res.status(200).send(req.body.challenge);
    }
  } catch (_) {
    // ignore and pass to Bolt
  }
  return next();
});

// ---- Bolt app ----
const app = new App({
  token: SLACK_BOT_TOKEN,
  receiver,
  logLevel: LogLevel.DEBUG,
});

// Your /form command
app.command("/form", async ({ ack, body, client }) => {
  await ack();

  const channel = body.channel_id;
  const user = body.user_id;

  const textPrefix = FORM_URL
    ? "Open the Incident Report Form:"
    : "Form URL not configured. Ask a supervisor.";

  const blocks = [
    {
      type: "section",
      text: { type: "mrkdwn", text: "*Incident Report Form*" },
    },
  ];

  // Only show the button when a FORM_URL exists
  if (FORM_URL) {
    blocks.push({
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: "Open Form" }, url: FORM_URL },
      ],
    });
  }

  await client.chat.postEphemeral({
    channel,
    user,
    text: textPrefix,
    blocks,
  });
});

// ---- Export the Express app for Vercel ----
module.exports = receiver.app;
