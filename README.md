# Connect to an AI API

This API accepts a customer support message and uses an LLM to triage it, returning a structured JSON response categorizing the message, grading its urgency, and providing a reason.

*Note: The only difference between calling an LLM on your local machine and in a datacenter is swapping three environment variables (URL, Model, Key).*

## Endpoints

### `POST /triage`

Analyzes a support message.

**Valid Request:**
```bash
curl.exe -X POST http://localhost:3000/triage ^
  -H "Content-Type: application/json" ^
  -d "{\"text\": \"I was charged twice for my subscription this month. Please refund me!\"}"
```

**Invalid Request (Missing `text` field):**
```bash
curl.exe -X POST http://localhost:3000/triage ^
  -H "Content-Type: application/json" ^
  -d "{\"wrong_field\": \"test\"}"
```

## Running the API

1. `npm install`
2. Set up your `.env` using `.env.example`. 
3. Run the server:
   ```bash
   node index.js
   ```

*To test without hitting the LLM API, set `LLM_STUB=1` in your `.env` file.*
