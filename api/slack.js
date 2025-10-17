// api/slack.js
import { App, ExpressReceiver } from '@slack/bolt';

// 1) Create an ExpressReceiver and pin the *events* endpoint EXACTLY to /api/slack
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  endpoints: { events: '/api/slack' }, // <- important
});

// 2) Health check for GET /api/slack (so a browser GET shows something sane)
receiver.router.get('/api/slack', (req, res) => {
  res.status(200).send('ok');
});

// 3) Your Bolt app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
  logLevel: 'info',
});

// ---- Example command (/form) – keep your handlers here ----
app.command('/form', async ({ ack, body, client }) => {
  await ack();

  const FORM_URL = process.env.FORM_URL || '';
  await client.chat.postEphemeral({
    channel: body.channel_id,
    user: body.user_id,
    text: FORM_URL ? 'Open the Incident Report Form:' : 'Form URL not configured.',
    blocks: FORM_URL
      ? [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: '*Incident Report Form*' },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Open Form' },
                url: FORM_URL,
              },
            ],
          },
        ]
      : undefined,
  });
});

// 4) Export a Vercel-compatible handler that forwards the request to the Express app
export default function handler(req, res) {
  return receiver.app(req, res);
}
