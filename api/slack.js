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

// ---- /form command (unchanged) ----
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

// ---- NEW: /beep command (simple health/status ping) ----
app.command('/beep', async ({ ack, command, respond, client }) => {
  await ack(); // must ack within 3s

  // Ephemeral reply to the user who ran /beep
  await respond({
    response_type: 'ephemeral',
    text: `Temple BEEP is alive 🚀 (user: <@${command.user_id}>, channel: <#${command.channel_id}>)`,
  });

  // Optional: also post to a dedicated incidents channel, if configured
  if (process.env.INCIDENTS_CHANNEL_ID) {
    try {
      await client.chat.postMessage({
        channel: process.env.INCIDENTS_CHANNEL_ID,
        text: `✅ /beep check by <@${command.user_id}> from <#${command.channel_id}>`,
      });
    } catch (err) {
      console.error('Failed to post to incidents channel:', err);
    }
  }
});

// 4) Export a Vercel-compatible handler that forwards the request to the Express app
export default function handler(req, res) {
  return receiver.app(req, res);
}
