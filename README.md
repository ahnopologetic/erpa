# 🚀 Erpa - Your AI-Powered Browser Assistant

> Navigate, understand, and interact with the web using natural language and AI

![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)
![React](https://img.shields.io/badge/React-18.2-blue.svg)


[![Erpa Demo](https://img.youtube.com/vi/B4b-CDFzBYk/maxresdefault.jpg)](https://youtu.be/B4b-CDFzBYk)


**Erpa** is an intelligent browser extension that transforms how you interact with web content. Powered by Chrome's Prompt API and advanced semantic search, Erpa understands page content and responds to your voice and text commands through an AI agent.

## ✨ Features

### 🎯 **Intelligent Page Navigation**
- **Smart Section Detection**: Automatically identifies and maps page sections
- **Natural Language Navigation**: "Go to the pricing section" - it just works
- **Table of Contents**: Auto-generated TOC for any webpage

### 🗣️ **Voice & Text Interaction**
- **Voice Control**: Speak commands naturally while browsing
- **Text Chat**: Type to interact with your AI assistant
- **Real-time Transcription**: See your speech converted to text instantly

### 🔍 **Semantic Search**
- **Context-Aware Search**: Find content by meaning, not just keywords
- **Visual Highlighting**: See relevant sentences highlighted as you search
- **Auto-Play Results**: Get TTS playback of search results

### 🔊 **Text-to-Speech**
- **Read Sections Aloud**: Have any section read to you
- **Visual Sync**: See words highlighted as they're spoken
- **Pause/Resume**: Full control over playback

### 🤖 **AI Agent**
- **Autonomous Tasks**: Agent breaks down complex requests into steps
- **Progress Tracking**: See what the agent is thinking and doing
- **Multi-Turn Conversations**: Natural back-and-forth with context
- **Function Calling**: Agent can navigate, search, read, and analyze

### 🎨 **Beautiful UI**
- **Modern Design**: Clean, dark-themed interface
- **Animated Background**: Stunning visual effects
- **Responsive**: Works beautifully across screen sizes

## 🏗️ Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                      Erpa Extension                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Sidepanel   │  │   Content    │  │  Background  │       │
│  │              │  │   Script     │  │   Worker     │       │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤       │
│  │ • UI/UX      │  │ • Overlay    │  │ • Offscreen  │       │
│  │ • Chat       │  │ • Detection  │  │ • Storage    │       │
│  │ • Agent      │  │ • Search     │  │ • TTS        │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│                  Core Libraries                              │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  • @ahnopologetic/use-prompt-api                            │
│    → Chrome Prompt API wrapper                               │
│    → Agentic workflows                                       │
│    → Function calling                                        │
│                                                               │
│  • Semantic Search Engine                                    │
│    → PGLite (in-browser PostgreSQL)                          │
│    → Xenova Transformers                                     │
│    → Vector embeddings                                       │
│                                                               │
│  • Erpa Readable                                             │
│    → Section detection                                       │
│    → Content extraction                                      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Tech Stack

- **Framework**: [Plasmo](https://www.plasmo.com/) - Next-generation browser extension framework
- **UI**: React 18 + TypeScript
- **Styling**: TailwindCSS
- **AI**: Chrome Prompt API + Custom agent framework
- **Embeddings**: Xenova Transformers (Local execution)
- **Database**: PGLite (Browser-based PostgreSQL)
- **UI Components**: Radix UI

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and pnpm
- Chrome 128+ with Prompt API enabled
- TypeScript 5.3+

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/erpa.git
cd erpa

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

### Development

```bash
# Start development server
pnpm dev

# Build for production
pnpm build

# Package extension
pnpm package
```

### Load Extension

1. Open Chrome and navigate to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `build/chrome-mv3-dev` directory

## 📖 Usage

### Voice Commands

1. Open the Erpa sidepanel
2. Click the microphone button
3. Speak your command:
   - "Show me the pricing section"
   - "Search for refund policy"
   - "Read the introduction"
   - "Summarize this page"

### Text Commands

1. Switch to text mode in the sidepanel
2. Type your message
3. Press Enter or click send

### Keyboard Shortcuts

- `Ctrl+Shift+Y` (Mac: `Cmd+Shift+Y`): Toggle sidepanel
- `Ctrl+Shift+F` (Mac: `Cmd+Shift+F`): Focus semantic search

### Function Calling

The AI agent can use these functions:

- `navigate(location)`: Jump to a section
- `readOut(targetType, target)`: Read content aloud
- `semanticSearch(query)`: Search by meaning
- `getContent(selector)`: Extract specific content
- `summarizePage()`: Generate page summary

## 🔧 Configuration

Settings are available in the sidepanel. Configure:

- **AI Model**: Choose your preferred model
- **Voice Settings**: TTS speed and voice
- **Search Settings**: Semantic search behavior
- **Privacy**: Control data handling

## 🧩 Project Structure

```
erpa/
├── src/
│   ├── sidepanel.tsx          # Main UI
│   ├── content.tsx             # Content script overlay
│   ├── background.ts           # Background worker
│   ├── components/             # React components
│   │   ├── ui/                # UI components
│   │   └── settings/          # Settings UI
│   ├── hooks/                  # React hooks
│   ├── lib/
│   │   ├── functions/         # Agent functions
│   │   ├── semantic-search/   # Search engine
│   │   ├── erpa-readable/     # Section detection
│   │   └── db.ts             # Database
│   └── types/                  # TypeScript types
├── packages/
│   └── use-prompt-api/        # Prompt API library
├── assets/                     # Static assets
└── build/                      # Build output
```

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines first.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- [Plasmo Framework](https://www.plasmo.com/) for the excellent extension framework
- [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api) team
- [Xenova Transformers](https://huggingface.co/docs/transformers.js) for local AI
- All contributors and users who made this project possible

## 📬 Contact

**Author**: ahnopologetic <stahn1995@gmail.com>

- GitHub: [@yourusername](https://github.com/yourusername)
- Twitter: [@yourusername](https://twitter.com/yourusername)

---

<p align="center">
  Made with ❤️ using Plasmo and Chrome Prompt API
</p>
