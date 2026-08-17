import OpenAI from "openai";

// Official implementation using the OpenAI SDK
export async function completeOpenAI(messages, options = {}) {
  const client = new OpenAI({
    baseURL: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY,
    timeout: 30000, 
    maxRetries: 2,
  });

  const response = await client.chat.completions.create({
    model: process.env.LLM_MODEL,
    messages: messages,
    temperature: options.temperature ?? 0,
  });

  return {
    text: response.choices[0].message.content,
    usage: response.usage
  };
}

// Fallback/Mock implementation
export async function completeMock(messages, options = {}) {
  // Returns a generic hardcoded structure for testing without burning credits
  return {
    text: JSON.stringify({
      category: 'bug',
      urgency: 'high',
      confidence: 0.95,
      reason: 'This is a mock implementation of the provider interface.'
    }),
    usage: { prompt_tokens: 10, completion_tokens: 20 }
  };
}

// Abstracted interface 
export async function complete(messages, options = {}) {
  if (process.env.LLM_STUB === '1') {
    return completeMock(messages, options);
  }
  return completeOpenAI(messages, options);
}
