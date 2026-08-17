import 'dotenv/config';
import express from 'express';
import { triageInputSchema } from './src/llm/schema.js';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL,
  apiKey: process.env.LLM_API_KEY,
  timeout: 30000, // Explicit 30s timeout
  maxRetries: 2,  // Explicit retry policy for 429 and 5xx errors
});

const app = express();
app.use(express.json());

app.post('/triage', async (req, res) => {
  // Validate input
  const inputValidation = triageInputSchema.safeParse(req.body);
  if (!inputValidation.success) {
    const errorMsg = inputValidation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    return res.status(400).json({ error: `Invalid input - ${errorMsg}` });
  }

  // Check if LLM is explicitly disabled (Kill Switch)
  if (process.env.LLM_ENABLED === 'false') {
    return res.status(503).json({ 
      error: 'Service Unavailable',
      details: 'AI features are currently disabled'
    });
  }

  // Check if we are in stub mode
  if (process.env.LLM_STUB === '1') {
    return res.json({
      category: 'bug',
      urgency: 'high',
      confidence: 0.95,
      reason: 'This is a stubbed response for testing without hitting the model API.',
    });
  }

  try {
    const systemPrompt = fs.readFileSync(path.join(__dirname, 'prompts', 'triage-v1.md'), 'utf-8');
    
    // Helper to call LLM
    const callLLM = async (messages) => {
      const response = await client.chat.completions.create({
        model: process.env.LLM_MODEL,
        messages: messages,
        temperature: 0,
      });
      return { 
        text: response.choices[0].message.content, 
        usage: response.usage 
      };
    };

    let messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(req.body) }
    ];

    const startTime = performance.now();
    let repairCount = 0;
    
    let llmResult = await callLLM(messages);
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
      
      llmResult = await callLLM(messages);
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
