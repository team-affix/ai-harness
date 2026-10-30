import { Agent } from "@cursor/sdk";
import type { z } from "zod";

export interface CursorPromptOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly cwd: string;
}

export async function promptJson<T>(
  options: CursorPromptOptions,
  prompt: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const result = await Agent.prompt(prompt, {
    apiKey: options.apiKey,
    model: { id: options.model },
    tools: [],
    local: { cwd: options.cwd, settingSources: [] },
  });
  if (result.status !== "finished") {
    throw new Error(`Cursor run ${result.id} ended with status "${result.status}"`);
  }
  if (result.result === undefined) {
    throw new Error(`Cursor run ${result.id} finished without a reply`);
  }
  return schema.parse(JSON.parse(stripCodeFence(result.result)));
}

function stripCodeFence(text: string): string {
  const fenced = /^\s*```[a-zA-Z]*\s*\n([\s\S]*?)\n?```\s*$/.exec(text);
  return fenced?.[1] ?? text;
}
