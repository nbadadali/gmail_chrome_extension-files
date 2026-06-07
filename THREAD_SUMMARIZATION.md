# Thread Summarization Feature

## Overview

The Sa.AI Gmail Assistant now includes intelligent thread summarization capabilities. When a user is viewing a specific email thread and asks to summarize it, the extension automatically detects the thread ID and sends it to the n8n webhook for processing.

## How It Works

### 1. Thread Detection
- **URL Pattern**: The extension monitors Gmail URLs to detect when a user is viewing a thread
- **Thread Pattern**: `https://mail.google.com/mail/u/0/#inbox/FMfcgzQbgcPLFgsfkXkMNkcFSSHJTkMQ`
- **Thread ID Extraction**: Extracts the unique thread ID (e.g., `FMfcgzQbgcPLFgsfkXkMNkcFSSHJTkMQ`)
- **Subject Line Extraction**: Automatically extracts the email subject line from the Gmail interface

### 2. Keyword Detection
The extension detects summarization requests using these keywords:
- **Primary Keywords**: `summarise`, `summarize`, `summary`, `summaries`
- **Context Keywords**: `email`, `thread`, `this`, `current`, `whole`, `entire`

### 3. Request Flow
1. User types a summarization request while viewing a thread
2. Extension detects the request and validates user is on a thread page
3. Thread ID is extracted from the URL
4. Request is sent to n8n webhook with thread context
5. n8n processes the request and returns a summary

## Usage Examples

### Valid Requests (on thread page):
- "summarise this email"
- "summarize the thread"
- "what is this email about"
- "summarize whole email"
- "can you summarize this"
- "show me a summary of this thread"

### Invalid Requests (on inbox page):
- "summarise this email" → Response: "Please open the email/thread you want me to summarize, then ask me to summarize it. I can only summarize emails when you're viewing them."

## Webhook Payload Format

When a thread summarization is requested, the n8n webhook receives this payload:

```json
{
  "query": "summarise this email",
  "userId": "user_123456",
  "context": "GmailChat",
  "action": "summarize_thread",
  "threadId": "FMfcgzQbgcPLFgsfkXkMNkcFSSHJTkMQ",
  "subjectLine": "Meeting Tomorrow - Project Discussion"
}
```

### Payload Fields:
- `query`: The user's original message
- `userId`: Unique user identifier from OAuth
- `context`: Always "GmailChat" for chat requests
- `action`: "summarize_thread" (indicates thread summarization request)
- `threadId`: The extracted Gmail thread ID
- `subjectLine`: The email subject line (extracted from Gmail interface)

## n8n Webhook Implementation

### Expected Response Format:

The extension can handle multiple response formats. Here are the recommended formats:

#### Option 1: Array with Summary (Recommended)
```json
[
  {
    "reply": "[{\"summary\":\"The email thread discusses updating an ID with the same context ID. The sender has acknowledged the change and is working on it. The user does not need to take any further action at this time.\"}]"
  }
]
```

**Note:** The extension now handles both array-wrapped responses (as shown above) and direct object responses.

#### Option 2: Direct Object
```json
{
  "reply": "{\"summary\":\"Here's a summary of the email thread...\"}"
}
```

#### Option 3: Simple Message
```json
{
  "message": "Here's a summary of the email thread..."
}
```

#### Option 4: Complex Summary Object
```json
{
  "reply": "[{\"summary\":\"Meeting Tomorrow - Project Discussion\",\"participants\":[\"john@example.com\",\"jane@example.com\"],\"keyPoints\":[\"Meeting scheduled for 2 PM\",\"Agenda items discussed\"],\"actionItems\":[\"Send follow-up email\",\"Prepare presentation\"]}]"
}
```

### Gmail API Integration:
To access thread content in n8n, you'll need to:
1. Use the Gmail API to fetch thread details using the `threadId`
2. Parse the thread content and extract relevant information
3. Generate a summary using AI/LLM processing
4. Return the formatted response

### Gmail API Endpoint:
```
GET https://gmail.googleapis.com/gmail/v1/users/me/threads/{threadId}
```

## Error Handling

### Fallback Responses:
When the n8n webhook is unavailable, the extension provides helpful fallback messages:

```json
{
  "message": "I can see you want me to summarize the email thread (ID: FMfcgzQbgcPLFgsfkXkMNkcFSSHJTkMQ) (Subject: \"Meeting Tomorrow - Project Discussion\"). However, the n8n webhook is currently unavailable, so I cannot access the thread content to provide a summary. Please check your webhook configuration and try again.",
  "fallback": true,
  "webhookStatus": "unavailable",
  "suggestion": "Please verify your n8n webhook is deployed and accessible",
  "threadId": "FMfcgzQbgcPLFgsfkXkMNkcFSSHJTkMQ",
  "subjectLine": "Meeting Tomorrow - Project Discussion",
  "action": "summarize_thread"
}
```

### Validation Errors:
- **Not on thread page**: "Please open the email/thread you want me to summarize, then ask me to summarize it. I can only summarize emails when you're viewing them."
- **No thread ID**: Handled gracefully with appropriate error messages

## Testing

### Manual Testing:
1. Open Gmail and navigate to a specific email thread
2. Open the Sa.AI sidebar
3. Type "summarise this email" or similar
4. Check browser console for debug logs
5. Verify the webhook receives the correct payload

### Debug Information:
The extension logs detailed information:
```javascript
console.log('[SaAI] Message analysis:', {
  message: "summarise this email",
  isSummarizeRequest: true,
  isOnThreadPage: true,
  threadId: "FMfcgzQbgcPLFgsfkXkMNkcFSSHJTkMQ",
  currentUrl: "https://mail.google.com/mail/u/0/#inbox/FMfcgzQbgcPLFgsfkXkMNkcFSSHJTkMQ"
});
```

### Test File:
Use `test-thread-detection.js` to test the detection logic in the browser console.

## Implementation Details

### Functions Added:
- `isThreadPage()`: Detects if user is on a thread page
- `extractThreadId()`: Extracts thread ID from URL
- `extractSubjectLine()`: Extracts subject line from Gmail interface
- `isSummarizationRequest()`: Detects summarization keywords
- `getCurrentPageContext()`: Provides context for error messages

### Modified Functions:
- `handleSendMessage()`: Enhanced to include thread summarization logic
- `handleN8NRequest()`: Updated to handle thread summarization payloads
- `handleFallbackResponse()`: Added thread-specific fallback responses

## Security Considerations

- Thread IDs are only extracted from Gmail URLs
- No sensitive email content is logged
- Thread IDs are sent securely to the n8n webhook
- OAuth tokens are required for Gmail API access

## Future Enhancements

Potential improvements:
- Support for multiple thread summarization
- Thread comparison features
- Automatic thread categorization
- Integration with task extraction
- Support for different Gmail views (sent, drafts, etc.) 