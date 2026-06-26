import Anthropic from "@anthropic-ai/sdk";

// Lazy init so `next build` doesn't require the key to be present.
let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to your environment.");
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// Default to Haiku 4.5 everywhere — cheapest current model ($1/$5 per Mtok), vision-capable,
// plenty for extraction, summarisation and coaching Q&A.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
// The weekly plan is the one reasoning-heavy call (structured intervals + nutrition JSON),
// where small models can produce malformed JSON. It defaults to Sonnet for reliability while
// the high-frequency calls (Q&A, screenshot reads) stay on cheap Haiku. Set
// ANTHROPIC_PLAN_MODEL=claude-haiku-4-5-20251001 to force everything onto Haiku.
export const PLAN_MODEL = process.env.ANTHROPIC_PLAN_MODEL || "claude-sonnet-4-6";

function textFrom(res) {
  return res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

export async function ask(prompt, maxTokens = 1500, model = MODEL) {
  const res = await getClient().messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  return textFrom(res);
}

// Multi-turn chat with a system prompt — used by the conversational coach so it remembers
// the running conversation and the athlete's context.
export async function chat(messages, system, maxTokens = 800, model = MODEL) {
  const res = await getClient().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages,
  });
  return textFrom(res);
}

// Vision: read a screenshot (e.g. a Strava activity) and extract structured data.
export async function askWithImage(prompt, base64, mediaType, maxTokens = 600, model = MODEL) {
  const res = await getClient().messages.create({
    model,
    max_tokens: maxTokens,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });
  return textFrom(res);
}
