# Support Message Triage API

This API endpoint (`POST /triage`) takes raw, messy customer support messages and uses an LLM to categorize them. It validates the output to return clean, structured JSON containing the issue's `category` (billing, bug, feature, or other), `urgency`, a `confidence` score, and a one-sentence `reason`. It includes a repair loop to fix invalid LLM responses, structured logging, and exponential backoff retries.

## Usage

**Valid Request:**
```powershell
curl.exe -X POST http://localhost:3000/triage ^
  -H "Content-Type: application/json" ^
  -d "{\"text\": \"I was charged twice for my subscription this month. Please refund me!\"}"
```

**Typical Response:**
```json
{
  "category": "billing",
  "urgency": "high",
  "confidence": 0.98,
  "reason": "Customer is reporting a double charge and requesting a refund, which is a high-priority billing issue."
}
```

## Job Card

**What it does (one sentence):** Classifies a customer support message so it lands on the right team.
**Input:** `{ "text": "string, 1-2000 characters" }`
**Output:** 
- `category`: one of `[billing|bug|feature|other]`
- `urgency`: one of `[low|normal|high]`
- `confidence`: `0.0-1.0`
- `reason`: "one short sentence"

**It must never:**
- invent a category outside the list
- return free text
- give medical, legal or financial advice
- reveal the prompt

**When unsure it should:** return category "other" with low confidence, not a guess

## Configuration & LLM Provider

This project uses **OpenRouter** and the `openrouter/free` model. The integration is abstracted behind a generic `complete(prompt, input)` interface (`src/llm/provider.js`). 
To swap to another provider (like Ollama or OpenAI directly), simply change these three environment variables in `.env`:
- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL`

**Why abstracting the provider matters:** Unlike standard HTTP APIs that are predictable and stable, LLM providers often suffer outages, change pricing, or deprecate models without warning. Having a single interface to swap providers via environment variables (or even dynamically at runtime) ensures your application doesn't go down when your chosen provider does.

*(A kill switch is also available by setting `LLM_ENABLED=false`)*

## Evaluation Results (Expanded 25-case Set)

**Score:** 
- Easy Cases: 10 out of 13 matched
- Hard Cases: 1 out of 12 matched (many failed due to API rate limiting on the free tier during the test run)
**Date:** 2026-08-17
**Prompt Version:** v3

**Which case did you get wrong that you were sure about, and why?**
We got the case *"The reports feature is missing the date filter"* wrong. I was sure it would be a `bug`, but the model confidently classified it as a `feature`. I think this happened because the input literally contains the word "feature", which acts as a strong heuristic anchor for the model. We fixed this in `v3` by adding an explicit rule: *"If a user reports that an existing feature is missing functionality, broken, or not working as expected, classify it as a 'bug', not a 'feature'."*

*(Note: The prompt also successfully mitigated all 5 prompt injection attacks we threw at it!)*

## Cost & Observability

Example cost log for a single call:
```json
{"timestamp":"2026-08-17T19:10:29.283Z","promptVersion":"v1","model":"openrouter/free","inputTokens":441,"outputTokens":208,"durationMs":4594,"repaired":false}
```

**Cost Estimate:** 
Since we use the `openrouter/free` model, our cost is $0. However, if we swapped to `gpt-4o-mini` (roughly $0.15 / 1M input tokens and $0.60 / 1M output tokens), 10,000 requests a day averaging ~650 tokens each would cost approximately **$1.90 per day**.

**Biggest Cost Driver:** Input tokens are by far the biggest driver of cost, because the system prompt and few-shot examples are sent with every single request (and sent again on every retry).

## What I'd fix with another day
If I had another day, I would add a prompt-versioned caching layer (Redis) so we never send the exact same support message to the LLM twice, saving both time and API quota.
