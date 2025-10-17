// api/slack.js
import { App, ExpressReceiver } from "@slack/bolt";

/* ---------- Express + Route for Vercel ---------- */
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  endpoints: { events: "/api/slack" },
});

// simple GET so a browser request shows something sane
receiver.router.get("/api/slack", (_req, res) => res.status(200).send("ok"));

/* ---------- Bolt App ---------- */
const app = new App({
  token: process.env.SLACK_BOT_TOKEN, // xoxb-...
  receiver,
  logLevel: "info",
});

/* ---------- BEEP choices ---------- */
const LOC = [
  "ENTRY FRONT", "ENTRY SIDE", "ENTRANCE HALLWAY", "SIDEWALK", "HALLWAY",
  "COAT CHECK", "RESTROOM", "MIRUS", "DANCEFLOOR", "DJ BOOTH",
  "STAGE FRONT", "STAGE REAR", "STAGE STAIRS", "VIP", "VIP BOOTH",
  "VIP MEZZ", "VIP DANCEFLOOR", "VIP EXIT", "BAR MAIN", "BAR MEZZ",
  "BAR MIRUS", "BAR LVL", "BAR SKYBOX", "SKYBOX", "LOFT", "BACKSTAGE",
  "SECURITY OFFICE", "LOADING DOCK", "STORAGE"
];
const COL = ["GREEN", "YELLOW", "ORANGE", "RED"];
const TYP = [
  "FIGHT/DISTURBANCE","MEDICAL","EJECTION","INTOX/OVER-SERVICE","THEFT/LOSS",
  "SUSPICIOUS","DAMAGE/MAINT","FAKE ID/ID ISSUE","WEAPON/CONTRABAND",
  "CROWD CONTROL/OVERCAP","FIRE/SMOKE/HAZARD","TRESPASS/86 RETURN",
  "POLICE/EMS ON SITE","OTHER"
];
const EMOJI = { GREEN:"🟢", YELLOW:"🟡", ORANGE:"🟠", RED:"🔴" };
const HEX   = { GREEN:"#2eb67d", YELLOW:"#ecb22e", ORANGE:"#e67e22", RED:"#e01e5a" };
const opts  = arr => arr.map(v => ({ text:{ type:"plain_text", text:v }, value:v }));

const FORM_URL = process.env.FORM_URL || "";
const ALLOWED_CHANNELS = new Set(
  (process.env.ALLOWED_CHANNEL_IDS || "")
    .split(",").map(s => s.trim()).filter(Boolean)
);

/* ---------- /beep → open modal ---------- */
app.command("/beep", async ({ ack, body, client, logger }) => {
  await ack();

  // optional: restrict usage to allowlist
  if (ALLOWED_CHANNELS.size && !ALLOWED_CHANNELS.has(body.channel_id)) {
    try {
      await client.chat.postEphemeral({
        channel: body.channel_id,
        user: body.user_id,
        text: "Use /beep in the incidents channel."
      });
    } catch (e) { logger.error(e); }
    return;
  }

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: "beep_post",
        private_metadata: body.channel_id, // post back where the command was used
        title:  { type: "plain_text", text: "BEEP" },
        submit: { type: "plain_text", text: "Post" },
        blocks: [
          { type:"input", block_id:"loc", label:{type:"plain_text", text:"Location"},
            element:{ type:"static_select", action_id:"loc_a", options: opts(LOC) } },
          { type:"input", block_id:"col", label:{type:"plain_text", text:"Color"},
            element:{ type:"static_select", action_id:"col_a", options: opts(COL) } },
          { type:"input", block_id:"typ", label:{type:"plain_text", text:"Incident"},
            element:{ type:"static_select", action_id:"typ_a", options: opts(TYP) } }
        ]
      }
    });
  } catch (e) {
    logger.error(e);
    await client.chat.postEphemeral({
      channel: body.channel_id,
      user: body.user_id,
      text: "Couldn’t open the BEEP modal. Check the app’s permissions and try again."
    });
  }
});

/* ---------- Modal submit → post line to channel ---------- */
app.view("beep_post", async ({ ack, view, body, client, logger }) => {
  await ack();

  const v   = view.state.values;
  const loc = v.loc.loc_a.selected_option.value;
  const col = v.col.col_a.selected_option.value;
  const typ = v.typ.typ_a.selected_option.value;

  // 1) Prefer the channel that opened the modal
  let channelId = view.private_metadata;

  // 2) Fallback to env (make sure bot is invited there)
  if (!channelId && process.env.INCIDENTS_CHANNEL_ID) {
    channelId = process.env.INCIDENTS_CHANNEL_ID;
  }

  try {
    if (!channelId) throw new Error("channel_lookup_failed");

    // Join public channels if needed (no-op if already in). Private channels require a real invite.
    try { await client.conversations.join({ channel: channelId }); } catch (_) {}

    const blocks = [
      { type: "section",
        text: { type: "mrkdwn", text: `*${EMOJI[col]} ${loc} | ${col} | ${typ}*` } }
    ];
    if (FORM_URL) {
      blocks.push({
        type: "actions",
        elements: [{
          type: "button",
          text: { type: "plain_text", text: "Open Incident Report Form" },
          url: FORM_URL
        }]
      });
    }

    await client.chat.postMessage({
      channel: channelId,
      text: `${loc} | ${col} | ${typ}`,
      attachments: [{ color: HEX[col], blocks }]
    });
  } catch (e) {
    logger.error("Error posting BEEP:", e);
    // fall back with a DM to the user with tips
    try {
      const dm = await client.conversations.open({ users: body.user.id });
      await client.chat.postMessage({
        channel: dm.channel.id,
        text:
          "❌ Could not post your BEEP.\n" +
          `Error: ${e?.data?.error || e.message}\n\n` +
          "Try:\n• Invite the bot to this channel (`/invite @Temple BEEP Bot`)\n" +
          "• Or set INCIDENTS_CHANNEL_ID in your env (and invite the bot there)"
      });
    } catch (_) {}
  }
});

/* ---------- /form quick link ---------- */
app.command("/form", async ({ ack, body, client }) => {
  await ack();
  if (!FORM_URL) {
    await client.chat.postEphemeral({
      channel: body.channel_id,
      user: body.user_id,
      text: "Form URL not configured. Ask a supervisor."
    });
    return;
  }
  await client.chat.postEphemeral({
    channel: body.channel_id,
    user: body.user_id,
    text: "Incident Report Form:",
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: "*Incident Report Form*" } },
      { type: "actions", elements: [
        { type: "button", text: { type: "plain_text", text: "Open Form" }, url: FORM_URL }
      ] }
    ]
  });
});

/* ---------- OPTIONAL: debug which slash command Slack is sending ----------
   Set SLACK_DEBUG=1 in your env to enable this. Remove or disable after testing. */
if (process.env.SLACK_DEBUG === "1") {
  app.command(/.*/, async ({ ack, body, client }) => {
    await ack();
    await client.chat.postEphemeral({
      channel: body.channel_id,
      user: body.user_id,
      text: `Debug: received command \`${body.command}\``
    });
  });
}

/* ---------- Vercel export ---------- */
export default function handler(req, res) {
  return receiver.app(req, res);
}
