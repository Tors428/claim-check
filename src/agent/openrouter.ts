import OpenAI from "openai";
import { DEFAULT_CACHE_DIR, cacheKey, readCache, writeCache, type CachedMessage } from "./cache.js";
import { ASK_FOR_REPORT_AGAIN, SYSTEM_PROMPT } from "./prompt.js";
import { parseReport } from "./report.js";
import type { Agent, AgentRun } from "./types.js";

// safety net so a model that loops on tool calls can't burn the budget
const MAX_TURNS = 12;

// shared across every agent in one script run, so the cap covers all models
export type Budget = { spentUsd: number; limitUsd: number };

export class BudgetReached extends Error {}

type Options = {
  budget: Budget;
  // cache only. a missing response becomes status "cache_miss", never an api call.
  offline?: boolean;
  cacheDir?: string;
  // for the offline checks: swap in a fake fetch and skip the retry waits
  fetch?: typeof fetch;
  retryDelaysMs?: number[];
};

class ProviderError extends Error {}
class CacheMiss extends Error {}

function isRetryable(err: unknown): boolean {
  if (err instanceof OpenAI.APIError) {
    return err.status === undefined || err.status === 429 || err.status >= 500;
  }
  return true; // network trouble
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function openRouterAgent(model: string, label: string, opts: Options): Agent {
  const cacheDir = opts.cacheDir ?? DEFAULT_CACHE_DIR;
  const retryDelays = opts.retryDelaysMs ?? [2000, 8000];
  let client: OpenAI | null = null;

  // made on the first cache miss, so offline rebuilds don't need a key
  function getClient(): OpenAI {
    if (client) return client;
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey && !opts.fetch) throw new Error("OPENROUTER_API_KEY missing — check .env");
    client = new OpenAI({
      apiKey: apiKey ?? "test",
      baseURL: "https://openrouter.ai/api/v1",
      timeout: 60_000,
      maxRetries: 0, // we retry ourselves so we can count it
      fetch: opts.fetch,
    });
    return client;
  }

  async function callApi(messages: unknown[], tools: unknown[]) {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      try {
        const res: any = await getClient().chat.completions.create({
          model,
          messages: messages as any,
          tools: tools as any,
          // openrouter extra: puts the real cost of the call in usage.cost
          usage: { include: true },
        } as any);
        const choice = res.choices?.[0];
        if (!choice || choice.finish_reason === "error") {
          throw new ProviderError(res.error?.message ?? "empty response from provider");
        }
        return { message: choice.message, costUsd: Number(res.usage?.cost ?? 0) };
      } catch (err) {
        lastError = err;
        if (!(err instanceof ProviderError) && !isRetryable(err)) break;
        if (attempt < retryDelays.length) await sleep(retryDelays[attempt]);
      }
    }
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new ProviderError(message);
  }

  return {
    id: `openrouter:${model}`,
    label,

    run: async ({ message, tools, callTool, repeat }) => {
      const oaiTools = tools.map((t) => ({
        type: "function" as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));

      const messages: any[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message },
      ];

      const run: AgentRun = { status: "turn_limit", costUsd: 0, newResponses: 0, cachedResponses: 0 };
      let askedAgain = false;

      // one model response, from the cache if we've seen this exact request
      async function respond(): Promise<CachedMessage> {
        const key = cacheKey({ model, repeat, messages, tools: oaiTools });
        const cached = await readCache(cacheDir, key);
        if (cached) {
          run.cachedResponses++;
          return cached.response;
        }
        if (opts.offline) throw new CacheMiss(`no cached response for ${key.slice(0, 12)}`);
        if (opts.budget.spentUsd >= opts.budget.limitUsd) {
          throw new BudgetReached(`budget of $${opts.budget.limitUsd} reached`);
        }

        const { message: msg, costUsd } = await callApi(messages, oaiTools);
        const response: CachedMessage = {
          content: msg.content ?? "",
          toolCalls: (msg.tool_calls ?? []).map((tc: any) => ({
            id: tc.id,
            name: tc.function?.name ?? "",
            arguments: tc.function?.arguments ?? "",
          })),
        };
        await writeCache(cacheDir, key, { model, repeat, response, costUsd });
        opts.budget.spentUsd += costUsd;
        run.costUsd += costUsd;
        run.newResponses++;
        return response;
      }

      try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const response = await respond();

          // push back only the fields we cache, so a live run and a replay
          // build the exact same next request (and the same cache key)
          const assistant: any = { role: "assistant", content: response.content };
          if (response.toolCalls.length > 0) {
            assistant.tool_calls = response.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: tc.arguments },
            }));
          }
          messages.push(assistant);

          if (response.toolCalls.length > 0) {
            for (const tc of response.toolCalls) {
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(tc.arguments || "{}");
              } catch {
                // invalid json from the model. pass {} and let the tool complain.
              }
              const result = await callTool(tc.name, args);
              messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
            }
            continue;
          }

          run.raw = response.content;
          const report = parseReport(response.content);
          if (report) {
            run.status = "report";
            run.report = report;
            return run;
          }
          if (askedAgain) {
            run.status = "bad_report";
            return run;
          }
          // one second chance. small models often add chatter around the json.
          askedAgain = true;
          messages.push({ role: "user", content: ASK_FOR_REPORT_AGAIN });
        }
        return run;
      } catch (err) {
        if (err instanceof BudgetReached) throw err;
        run.status = err instanceof CacheMiss ? "cache_miss" : "provider_error";
        run.error = err instanceof Error ? err.message : String(err);
        return run;
      }
    },
  };
}
