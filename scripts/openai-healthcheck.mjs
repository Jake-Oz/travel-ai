import { config } from "dotenv";
import OpenAI from "openai";

config({ path: ".env.local", override: false });
config();

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(
      "OPENAI_API_KEY is not set. Add it to .env.local before running the health check."
    );
    process.exitCode = 1;
    return;
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const client = new OpenAI({ apiKey });

  try {
    const response = await client.responses.create({
      model,
      input: "Reply with the single word 'pong'.",
      max_output_tokens: 20,
    });

    const text = response.output_text.trim();
    console.log(`OpenAI health check response: ${text}`);
  } catch (error) {
    console.error("OpenAI health check failed:", error);
    process.exitCode = 1;
  }
}

main();
