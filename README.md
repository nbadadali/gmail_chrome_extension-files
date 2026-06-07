# Sa.AI Gmail Assistant

Most inboxes show you emails. Yours shows you problems — the missed task, the forgotten thread, the reply you never got to.

Sa.AI is a Chrome extension that lives inside Gmail as a sidebar. It summarizes your inbox, extracts tasks, drafts replies, and answers questions about your emails — so you always know what matters and what needs your attention.

## Features

- **Inbox Summary**: Opens with a clear summary of what actually matters in your inbox — no more scanning through everything manually
- **Task Extraction**: Pulls tasks buried inside email threads and turns them into a prioritized to-do list, kept up to date automatically
- **AI Chat**: Ask anything about your inbox, the web, or your day and get instant, context-aware answers
- **Voice Mode**: Switch to voice instead of typing — talk to your assistant naturally
- **Thread Summarization**: Get the key points of any long email thread in seconds, without scrolling through it
- **Draft Replies**: Ask the assistant to draft a reply and get a first version ready to send
- **Auto-Labeling**: Quietly labels and organizes incoming emails in the background — your inbox stays tidy without you touching a thing
- **Modern UI**: Glassmorphism design with smooth animations, built to feel native inside Gmail
- **Session Persistence**: Stays connected across browser sessions — sign in once and you're set
- **SPA Compatibility**: Works seamlessly as you navigate between Gmail views (Inbox, Sent, Labels, etc.)

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
3. Your inbox summary loads automatically — tasks, priorities, and key threads
4. Type a message or switch to **voice mode** to ask questions
5. Try asking:
   - *"Summarize my inbox"*
   - *"What tasks do I have today?"*
   - *"Draft a reply to [sender]"*
   - *"What did [sender] say about the project?"*

### Sidebar Controls
- **× button**: Closes the sidebar and restores Gmail to full width
- **Chat input**: Auto-focuses when the sidebar opens, ready to type immediately
- **Voice mode**: Switch from typing to speaking with your assistant

## How It Works

The extension is built around three components that communicate via Chrome's messaging API:

1. **Popup** (`popup.js`): Handles the Google OAuth sign-in flow and shows your connection status
2. **Background script** (`background.js`): Manages OAuth tokens, forwards requests to n8n, and handles responses
3. **Content script** (`content.js`): Injects the sidebar into Gmail and manages the full chat and task UI

When you open Gmail, the content script injects the sidebar and loads your inbox summary via n8n. When you send a message or request a task list, the background script makes an authenticated request to the n8n webhook, which processes it using AI and returns the response to your sidebar.

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
