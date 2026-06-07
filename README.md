# Sa.AI Gmail Assistant

An AI-powered Chrome extension that integrates with Gmail to provide intelligent inbox summarization and chat functionality through n8n workflows.

## Features

- **Seamless Gmail Integration**: Fixed-width sidebar (400px) that pushes Gmail content to the left
- **OAuth Authentication**: Secure Google OAuth flow for Gmail access
- **AI Chat Interface**: Interactive chat with AI assistant for email queries
- **Inbox Summarization**: Automatic categorization of emails by priority
- **Modern UI/UX**: Futuristic design with glassmorphism effects and smooth animations
- **SPA Compatibility**: Works with Gmail's single-page application navigation
- **State Persistence**: Remembers sidebar open/closed state across sessions

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension icon should appear in your Chrome toolbar

## Configuration

### OAuth Setup
The extension uses Google OAuth for Gmail access. The OAuth client ID and redirect URI are configured in:
- `background.js` - OAuth flow handling
- `manifest.json` - OAuth scopes and permissions

### n8n Integration
The extension communicates with n8n workflows for:
- OAuth callback processing
- Chat message handling
- Email summarization

Webhook URLs are configured in `background.js`:
- Chat endpoint: `https://dxb2025.app.n8n.cloud/webhook/Sa.AI-NishantChatbot`
- OAuth callback: `https://dxb2025.app.n8n.cloud/webhook/oauth/callback`

## Usage

### Initial Setup
1. Click the extension icon in Chrome toolbar
2. Click "Connect Gmail" to authorize access
3. Complete the Google OAuth flow
4. Once connected, click "Open Chat Assistant"

### Using the Assistant
1. Navigate to Gmail (mail.google.com)
2. The sidebar will appear on the right side
3. Type your questions in the chat interface
4. Ask about your inbox, emails, or tasks
5. The AI will provide summaries and insights

### Sidebar Controls
- **Close Button (×)**: Closes the sidebar and restores Gmail layout
- **Chat Input**: Type messages and press Enter or click Send
- **Auto-focus**: Chat input automatically focuses when sidebar opens

## Testing Instructions

### 1. Basic Functionality Test
```
1. Load the extension in Chrome
2. Open Gmail (mail.google.com)
3. Click extension icon → "Connect Gmail"
4. Complete OAuth flow
5. Click "Open Chat Assistant"
6. Verify sidebar appears on the right
7. Test typing in chat input
8. Test closing sidebar with × button
```

### 2. OAuth Flow Test
```
1. Clear extension storage: chrome.storage.local.clear()
2. Reload extension
3. Test OAuth connection from popup
4. Verify storage updates (userId, isConnected)
5. Test OAuth connection from sidebar
6. Verify UI updates from connect prompt to chat
```

### 3. Chat Functionality Test
```
1. Ensure connected to Gmail
2. Open sidebar
3. Type test message: "Summarize my inbox"
4. Press Enter or click Send
5. Verify message appears in chat
6. Check for AI response or error handling
```

### 4. SPA Navigation Test
```
1. Open sidebar in Gmail
2. Navigate between different Gmail views (Inbox, Sent, etc.)
3. Verify sidebar persists across navigation
4. Test sidebar functionality after navigation
```

### 5. Error Handling Test
```
1. Test with invalid n8n webhook URLs
2. Test OAuth cancellation
3. Test network connectivity issues
4. Verify appropriate error messages
```

## Troubleshooting

### Sidebar Not Opening
- Check browser console for errors
- Verify content script is injected (look for "SaAI Loaded" indicator)
- Refresh Gmail page and try again
- Check manifest.json permissions

### OAuth Issues
- Verify OAuth client ID is correct
- Check redirect URI configuration
- Clear extension storage and retry
- Check browser console for OAuth errors

### Chat Not Working
- Verify n8n webhook URLs are accessible
- Check network connectivity
- Verify webhook payload format
- Test webhook manually with curl/Postman

### Multiple Sidebars
- Clear browser cache and reload
- Check for duplicate content script injections
- Verify cleanup functions are working

### UI Issues
- Check CSS file is loaded correctly
- Verify Google Fonts are accessible
- Test on different screen sizes
- Check for CSS conflicts with Gmail

## Debug Information

### Console Logs
The extension provides detailed logging:
- `[SaAI]` - Content script logs
- `[Background]` - Background script logs
- `[SaAI] Popup` - Popup script logs

### Visual Indicators
- Blue "SaAI Loaded" indicator appears when content script is active
- Debug borders may appear during development

### Storage Keys
- `userId` - User identifier from OAuth
- `isConnected` - Connection status
- `oauthData` - OAuth response data

## Development

### File Structure
```
├── manifest.json          # Extension configuration
├── background.js          # Background script (OAuth, messaging)
├── content.js            # Content script (sidebar, chat)
├── popup.js              # Popup script (connection UI)
├── popup.html            # Popup HTML
├── styles.css            # CSS styles
└── Icons/                # Extension icons
```

### Key Functions
- `toggleSidebar()` - Opens/closes sidebar
- `injectSidebar()` - Injects sidebar into Gmail
- `handleOAuthFlow()` - Manages OAuth authentication
- `handleSendMessage()` - Processes chat messages
- `startOAuthFlow()` - Initiates OAuth from sidebar

### Message Flow
1. Popup/Content → Background: OAuth request
2. Background → Google: OAuth flow
3. Background → Storage: Update connection status
4. Storage → Content: UI update trigger
5. Content → Background: Chat message
6. Background → n8n: Webhook request
7. Background → Content: Chat response

## Security Considerations

- OAuth tokens are stored securely in chrome.storage.local
- No sensitive data is logged to console
- Webhook URLs should use HTTPS
- Extension only requests necessary Gmail permissions

## Support

For issues or questions:
1. Check browser console for error messages
2. Verify all configuration is correct
3. Test with fresh extension installation
4. Check n8n workflow status and logs

## Version History

### v2.0
- Complete UI redesign with glassmorphism effects
- Unified OAuth flow between popup and sidebar
- Improved error handling and debugging
- Enhanced SPA compatibility
- Modern chat interface with animations
