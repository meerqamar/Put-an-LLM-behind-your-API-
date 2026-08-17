import 'dotenv/config';
import express from 'express';
import { triageInputSchema, triageOutputSchema } from './src/llm/schema.js';
import { complete } from './src/llm/provider.js';
import { encode } from 'gpt-tokenizer';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

app.post('/triage', async (req, res) => {
  // Validate input
  const inputValidation = triageInputSchema.safeParse(req.body);
  if (!inputValidation.success) {
    return res.status(400).json({ error: `Invalid input - ${inputValidation.error.message}` });
  }

  // Token Limit Check
  const inputTokensCount = encode(req.body.text).length;
  if (inputTokensCount > 500) {
    return res.status(413).json({ error: `Payload Too Large: input text exceeds 500 tokens (got ${inputTokensCount})` });
  }

  // Check if LLM is explicitly disabled (Kill Switch)
  if (process.env.LLM_ENABLED === 'false') {
    return res.status(503).json({ 
      error: 'Service Unavailable',
      details: 'AI features are currently disabled'
    });
  }

  // Stub mode logic is now handled in provider.js mock implementation

  try {
    const systemPrompt = fs.readFileSync(path.join(__dirname, 'prompts', 'triage-v2.md'), 'utf-8');
    
    let messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `<<<INPUT>>>\n${req.body.text}\n<<<END_INPUT>>>` }
    ];

    const startTime = performance.now();
    let repairCount = 0;
    
    let llmResult = await complete(messages);
    let rawOutput = llmResult.text;
    
    // Parse helper
    const parseOutput = (text) => {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON object found in output");
      return JSON.parse(jsonMatch[0]);
    };

    let parsed, validation;
    try {
      parsed = parseOutput(rawOutput);
      validation = triageOutputSchema.safeParse(parsed);
      if (!validation.success) throw new Error(validation.error.message);
    } catch (e) {
      // Repair loop - retry once
      repairCount++;
      const errorMsg = `Your previous answer was rejected for this reason: ${e.message}. Return only corrected JSON matching the schema.`;
      messages.push({ role: "assistant", content: rawOutput });
      messages.push({ role: "user", content: errorMsg });
      
      llmResult = await complete(messages);
      rawOutput = llmResult.text;
      
      try {
        parsed = parseOutput(rawOutput);
        validation = triageOutputSchema.safeParse(parsed);
        if (!validation.success) throw new Error(validation.error.message);
      } catch (finalError) {
        // Give up cleanly
        const logEntry = JSON.stringify({
          timestamp: new Date().toISOString(),
          input: req.body,
          error: finalError.message,
          rawOutput,
          promptVersion: 'v1'
        }) + '\n';
        
        const logDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
        fs.appendFileSync(path.join(logDir, 'quarantine.jsonl'), logEntry);

        return res.status(422).json({ error: "Failed to produce a valid response", details: finalError.message });
      }
    }

    const durationMs = Math.round(performance.now() - startTime);
    const costLog = {
      timestamp: new Date().toISOString(),
      promptVersion: 'v1',
      model: process.env.LLM_MODEL,
      inputTokens: llmResult.usage?.prompt_tokens || 0,
      outputTokens: llmResult.usage?.completion_tokens || 0,
      durationMs,
      repaired: repairCount > 0
    };
    console.log(JSON.stringify(costLog));

    res.json(validation.data);
  } catch (error) {
    console.error("LLM Error:", error);
    if (error.status === 401) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
    }
    if (error.code === 'ETIMEDOUT' || error.type === 'timeout') {
      return res.status(504).json({ error: 'LLM Gateway Timeout' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
