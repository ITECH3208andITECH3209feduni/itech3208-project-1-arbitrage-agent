import OpenAI from "openai";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

function createClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required");
  return new OpenAI({ apiKey, baseURL: OPENROUTER_BASE });
}

let _client: OpenAI | undefined;
function getClient(): OpenAI {
  _client ??= createClient();
  return _client;
}

/**
 * Send a prompt and collect the full text response (non-streaming).
 * Uses OpenRouter API. Model defaults to OPENROUTER_MODEL env var.
 */
export async function prompt(model: string, system: string, user: string): Promise<string> {
  const res = await getClient().chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.1,
  });
  return res.choices[0]?.message?.content ?? "";
}

/**
 * Send a prompt and stream response deltas to a callback.
 * Returns the full collected text.
 */
export async function promptStreaming(
  model: string,
  system: string,
  user: string,
  onDelta: (text: string) => void,
): Promise<string> {
  const stream = await getClient().chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.1,
    stream: true,
  });

  let collected = "";
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      collected += delta;
      onDelta(delta);
    }
  }
  return collected;
}