// api/slack.js
import { App, ExpressReceiver } from '@slack/bolt';

// 1) ExpressReceiver pinned to /api/slack
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  endpoints: { events: '/api/slack' },
});

// 2) Health check for GET /api/slack
receiver.router.get('/api/slack', (req, res) => {
  res.status(200).send('ok');
});

// 3) Initialize Bolt App
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
  logLevel: 'info',
});

// ---- /form command ----
app.command('/form', async ({ ack, body, client }) => {
  await ack(); // acknowledge immediately

  const FORM_URL = process.env.FORM_URL || '';
  try {
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
  } catch (error) {
    console.error('Error posting /form message:', error);
  }
});

// ---- /beep command ----
app.command('/beep', async ({ ack, command, respond, client }) => {
  await ack(); // must ack within 3 seconds

  try {
    // Ephemeral response to the user who triggered it
    await respond({
      response_type: 'ephemeral',
      text: `Temple BEEP is alive 🚀 (user: <@${command.user_id}>, channel: <#${command.channel_id}>)`,
    });

    // Optional: also post in incidents channel if defined
    if (process.env.INCIDENTS_CHANNEL_ID) {
      await client.chat.postMessage({
        channel: process.env.INCIDENTS_CHANNEL_ID,
        text: `✅ /beep check by <@${command.user_id}> from <#${command.channel_id}>`,
      });
    }
  } catch (error) {
    console.error('Error handling /beep command:', error);
  }
});

// 4) Export Vercel handler
export default function handler(req, res) {
  return receiver.app(req, res);
}
