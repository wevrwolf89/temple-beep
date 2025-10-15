require('dotenv').config({ path: __dirname + '/.env' });
require('dotenv').config({ path: require('path').join(__dirname, '.env') });


// app.js — Temple BEEP (dropdowns + post to invoking channel + Form button + /form)
const { App } = require("@slack/bolt");

const LOC = [
  // --- ENTRY & COMMON ---
  "ENTRY FRONT", "ENTRY SIDE", "ENTRANCE HALLWAY", "SIDEWALK", "HALLWAY", "COAT CHECK", "RESTROOM","MIRUS",

  // --- FLOOR / STAGE ---
  "DANCEFLOOR", "DJ BOOTH", "STAGE FRONT", "STAGE REAR", "STAGE STAIRS",

  // --- VIP ---
  "VIP", "VIP BOOTH", "VIP MEZZ", "VIP DANCEFLOOR", "VIP EXIT",

  // --- BARS ---
  "BAR MAIN", "BAR MEZZ", "BAR MIRUS", "BAR LVL", "BAR SKYBOX",

  // --- SKYBOX / LOFT ---
  "SKYBOX", "LOFT",

  // --- BACK OF HOUSE / STAFF ---
  "BACKSTAGE", "SECURITY OFFICE", "LOADING DOCK", "STORAGE"
];

const COL = ["GREEN","YELLOW","ORANGE","RED"];
const TYP = [
  "FIGHT/DISTURBANCE","MEDICAL","EJECTION","INTOX/OVER-SERVICE","THEFT/LOSS","SUSPICIOUS",
  "DAMAGE/MAINT","FAKE ID/ID ISSUE","WEAPON/CONTRABAND","CROWD CONTROL/OVERCAP",
  "FIRE/SMOKE/HAZARD","TRESPASS/86 RETURN","POLICE/EMS ON SITE","OTHER"
];
const EMOJI = { GREEN:"🟢", YELLOW:"🟡", ORANGE:"🟠", RED:"🔴" };
const HEX   = { GREEN:"#2eb67d", YELLOW:"#ecb22e", ORANGE:"#e67e22", RED:"#e01e5a" };

// ---- configurable bits via .env ----
const FORM_URL = process.env.FORM_URL || "https://forms.gle/qRQY55a9rptro7KE8"; // one-tap Google Form
const ALLOWED_CHANNELS = new Set( // optional: restrict where /beep can be used
  (process.env.ALLOWED_CHANNEL_IDS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
);

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,     // xoxb-...
  appToken: process.env.SLACK_APP_TOKEN,  // xapp-... (connections:write)
  socketMode: true,
  logLevel: "debug"
});

const opts = (arr) => arr.map(v => ({ text:{ type:"plain_text", text:v }, value:v }));

// ------------------- /beep (open modal) -------------------
app.command("/beep", async ({ ack, body, client, logger }) => {
  await ack();

  // Optional: restrict to certain channels (IDs)
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

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: "modal",
      callback_id: "beep_post",
      private_metadata: body.channel_id,   // post back where the command was used
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
});

// ------------------- modal submit → post -------------------
app.view("beep_post", async ({ ack, view, client, body, logger }) => {
  await ack();

  const v   = view.state.values;
  const loc = v.loc.loc_a.selected_option.value;
  const col = v.col.col_a.selected_option.value;
  const typ = v.typ.typ_a.selected_option.value;

  try {
    // 1) Prefer the channel that opened the modal
    let channelId = view.private_metadata;

    // 2) Fallback: env var
    if (!channelId && process.env.INCIDENTS_CHANNEL_ID) {
      channelId = process.env.INCIDENTS_CHANNEL_ID;
    }

    // 3) Last resort: find a channel literally named "incidents"
    if (!channelId) {
      let cursor;
      do {
        const res = await client.conversations.list({ limit: 200, exclude_archived: true, cursor });
        const found = res.channels?.find(c => (c.name || "").toLowerCase() === "incidents");
        if (found) { channelId = found.id; break; }
        cursor = res.response_metadata?.next_cursor;
      } while (cursor);
    }

    if (!channelId) throw new Error("channel_lookup_failed");

    // Attempt to join (no-op if already in; invite required for privates)
    try { await client.conversations.join({ channel: channelId }); } catch {}

    // Build blocks (line + optional Form button)
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

    // Post the beeper line
    await client.chat.postMessage({
      channel: channelId,
      text: `${loc} | ${col} | ${typ}`,
      attachments: [{ color: HEX[col], blocks }]
    });

  } catch (e) {
    logger.error(e);
    // DM the user with a helpful error
    try {
      const dm = await client.conversations.open({ users: body.user.id });
      const err = e?.data?.error || e.message || String(e);
      await client.chat.postMessage({
        channel: dm.channel.id,
        text:
          `❌ Could not post your BEEP.\n` +
          `Error: ${err}\n\n` +
          `Try:\n• In this channel, run: /invite @Temple BEEP Bot\n` +
          `• If the channel is private, an admin must invite the bot first\n` +
          `• Optional: set INCIDENTS_CHANNEL_ID in .env`
      });
    } catch {}
  }
});

// ------------------- /form (quick link to the Form) -------------------
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
    text: "Open the Incident Report Form:",
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: "*Incident Report Form*" } },
      { type: "actions", elements: [
        { type: "button", text: { type: "plain_text", text: "Open Form" }, url: FORM_URL }
      ]}
    ]
  });
});

// ------------------- boot -------------------
(async () => {
  await app.start();
  console.log("Temple BEEP running");
})();
