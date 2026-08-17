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
      return response.choices[0].message.content;
    };

    let messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(req.body) }
    ];

    let rawOutput = await callLLM(messages);
    
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
      const errorMsg = `Your previous answer was rejected for this reason: ${e.message}. Return only corrected JSON matching the schema.`;
      messages.push({ role: "assistant", content: rawOutput });
      messages.push({ role: "user", content: errorMsg });
      
      rawOutput = await callLLM(messages);
      
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

    res.json(validation.data);
  } catch (error) {
    console.error("LLM Error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
