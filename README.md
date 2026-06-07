# Sa.AI Gmail Assistant

An AI-powered Chrome extension that adds a smart sidebar to Gmail, letting you chat with an AI assistant about your inbox, summarize emails by priority, and manage your email workflow — all without leaving Gmail.

## Features

- **Gmail Sidebar**: A 400px sidebar that slides in alongside Gmail, keeping your inbox fully visible
- **Google OAuth**: Secure sign-in with your Google account — no passwords stored
- **AI Chat Interface**: Ask questions about your inbox and get instant, context-aware replies
- **Inbox Summarization**: Categorizes your emails by priority and surfaces what matters most
- **Modern UI**: Glassmorphism design with smooth animations, built to feel native inside Gmail
- **SPA Compatibility**: Works seamlessly as you navigate between Gmail views (Inbox, Sent, Labels, etc.)
- **Session Persistence**: Stays connected across browser sessions — sign in once and you're set

## Tech Stack

- **Platform**: Chrome Extension (Manifest V3)
- **Language**: JavaScript (Vanilla)
- **Auth**: Google OAuth 2.0
- **Automation**: n8n (workflow automation for AI and email processing)
- **Styling**: CSS with glassmorphism effects and Google Fonts

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked** and select this folder
5. The Sa.AI icon will appear in your Chrome toolbar

## Usage

### Connecting Your Gmail Account
1. Click the Sa.AI icon in your Chrome toolbar
2. Click **Connect Gmail** to authorize access
3. Complete the Google sign-in screen
4. Once connected, click **Open Chat Assistant**

### Using the Assistant
1. Open Gmail at [mail.google.com](https://mail.google.com)
2. The Sa.AI sidebar appears on the right side of the page
3. Type a message and press **Enter** or click **Send**
4. Try asking:
   - *"Summarize my inbox"*
   - *"What emails need my attention today?"*
   - *"Find emails from [sender name]"*

### Sidebar Controls
- **× button**: Closes the sidebar and restores Gmail to full width
- **Chat input**: Auto-focuses when the sidebar opens, ready to type immediately

## How It Works

The extension is built around three components that communicate via Chrome's messaging API:

1. **Popup** (`popup.js`): Handles the Google OAuth sign-in flow and shows your connection status
2. **Background script** (`background.js`): Manages OAuth tokens, forwards chat messages to n8n, and handles responses
3. **Content script** (`content.js`): Injects the sidebar into Gmail and manages the chat UI

When you send a message, the content script passes it to the background script, which makes an authenticated request to the n8n webhook. n8n processes the request using AI and returns a response that appears in your sidebar.

### n8n Webhooks

| Purpose | Endpoint |
|---------|----------|
| AI Chat | `https://dxb2025.app.n8n.cloud/webhook/Sa.AI-NishantChatbot` |
| OAuth Callback | `https://dxb2025.app.n8n.cloud/webhook/oauth/callback` |

## Project Structure

```
├── manifest.json      # Extension config — permissions, scripts, OAuth scopes
├── background.js      # Service worker — OAuth flow, n8n requests
├── content.js         # Gmail sidebar — chat UI, injection, SPA detection
├── popup.js           # Toolbar popup — connect/disconnect, status
├── popup.html         # Popup HTML
├── styles.css         # Sidebar and popup styles
└── icons/             # Extension icons (16px, 48px, 128px)
```

## Security

- OAuth tokens are stored in `chrome.storage.local`, sandboxed to the extension
- No email content or credentials are stored locally
- The extension only requests the minimum Gmail permissions needed
- All communication with n8n uses HTTPS

## Version History

### v2.0
- Complete UI redesign with glassmorphism effects
- Unified OAuth flow between the popup and the in-sidebar connect button
- Improved error handling and user feedback
- Enhanced compatibility with Gmail's single-page navigation
- Modern animated chat interface
