# n8n Webhook Setup Guide

## Current Issue
The extension is receiving HTTP 404 errors when trying to send messages to the n8n webhook. This means the webhook URL `https://dxb2025.app.n8n.cloud/webhook/Sa.AI-NishantChatbot` is not accessible or not properly configured.

## Webhook Configuration

### 1. Verify Webhook URL
The current webhook URL in `background.js` is:
```
https://dxb2025.app.n8n.cloud/webhook/Sa.AI-NishantChatbot
```

### 2. Test Webhook Manually
You can test if the webhook is working by making a manual request:

```bash
curl -X POST https://dxb2025.app.n8n.cloud/webhook/Sa.AI-NishantChatbot \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test_user",
    "query": "Hello, can you help me?"
  }'
```

### 3. Expected Response Format
The webhook should return JSON in one of these formats:

**Option A: Simple Message Response**
```json
{
  "message": "Hello! I'm your Gmail assistant. How can I help you today?"
}
```

**Option B: Email Summary Response**
```json
{
  "high_priority_emails": [
    {
      "subject": "Important meeting tomorrow",
      "sender": "boss@company.com"
    }
  ],
  "medium_priority": [
    {
      "subject": "Weekly newsletter",
      "sender": "newsletter@company.com"
    }
  ],
  "already_replied_closed_threads": [],
  "missed_or_ignored_emails": []
}
```

**Option C: Complex Response**
```json
{
  "reply": "{\"message\": \"Here's your inbox summary...\", \"data\": {...}}"
}
```

## Troubleshooting Steps

### 1. Check n8n Instance
- Verify your n8n instance is running at `https://dxb2025.app.n8n.cloud/`
- Check if the webhook endpoint `/webhook/Sa.AI-NishantChatbot` exists
- Ensure the webhook is active and not paused

### OAuth Callback
Make sure your OAuth redirect URI is set to the new path:

`https://dxb2025.app.n8n.cloud/webhook/oauth/callback`

### 2. Verify Webhook Configuration
In your n8n workflow:
- Make sure the webhook node is properly configured
- Check that the webhook URL path matches exactly
- Verify the webhook is set to accept POST requests
- Ensure the webhook is not requiring authentication (or add auth headers)

### 3. Test Different URLs
Try these alternative webhook URLs:

```javascript
// Option 1: Different path
url = 'https://dxb2025.app.n8n.cloud/webhook/Sa.AI-NishantChatbot';

// Option 2: Different naming
url = 'https://dxb2025.app.n8n.cloud/webhook/chat';

// Option 3: Different subdomain
url = 'https://n8n.dxb2025.app/webhook/Sa.AI-NishantChatbot';
```

### 4. Update Background Script
If you need to change the webhook URL, update it in `background.js`:

```javascript
case 'chat':
    url = 'YOUR_NEW_WEBHOOK_URL_HERE';
    break;
```

## Fallback Behavior

The extension now includes fallback responses when the webhook is unavailable:

1. **404 Errors**: Returns helpful messages instead of crashing
2. **Network Errors**: Provides guidance on webhook configuration
3. **Server Errors**: Suggests checking n8n server status

## Development Mode

For testing without a real n8n webhook, you can:

1. **Use Mock Responses**: The fallback system provides basic responses
2. **Local Testing**: Set up a local n8n instance for development
3. **Public Webhook**: Use a service like webhook.site for testing

## Quick Fix Options

### Option 1: Use a Public Test Webhook
```javascript
// In background.js, temporarily use a public webhook for testing
case 'chat':
    url = 'https://webhook.site/your-unique-id';
    break;
```

### Option 2: Local n8n Development
1. Install n8n locally: `npm install n8n -g`
2. Run: `n8n start`
3. Create a webhook node in your workflow
4. Update the URL to: `http://localhost:5678/webhook/chat`

### Option 3: Simple HTTP Server
Create a simple test server:

```javascript
// test-server.js
const express = require('express');
const app = express();

app.use(express.json());

app.post('/webhook/chat', (req, res) => {
  console.log('Received:', req.body);
  res.json({
    message: `Hello! I received your message: "${req.body.query}"`
  });
});

app.listen(3000, () => {
  console.log('Test server running on http://localhost:3000');
});
```

Then update the webhook URL to: `http://localhost:3000/webhook/chat`

## Next Steps

1. **Verify your n8n webhook is accessible**
2. **Test the webhook manually with curl**
3. **Update the URL in background.js if needed**
4. **Reload the extension and test again**

The extension will now provide helpful fallback responses while you configure the webhook properly! 