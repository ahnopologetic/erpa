import React, { useState } from "react";
import "~style.css";

// Simple mock message structure
interface MockMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

// Mock data for testing
const mockMessages: MockMessage[] = [
  {
    id: "1",
    role: "user",
    content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString()
  },
  {
    id: "2", 
    role: "assistant",
    content: "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
    createdAt: new Date(Date.now() - 1000 * 60 * 4).toISOString()
  },
  {
    id: "3",
    role: "user",
    content: "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
    createdAt: new Date(Date.now() - 1000 * 60 * 3).toISOString()
  },
  {
    id: "4",
    role: "assistant",
    content: "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.",
    createdAt: new Date(Date.now() - 1000 * 60 * 2).toISOString()
  },
  {
    id: "5",
    role: "user",
    content: "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.",
    createdAt: new Date(Date.now() - 1000 * 60 * 1).toISOString()
  }
];

// Simple message component that mimics the assistant-ui structure
const SimpleUserMessage = ({ message }: { message: MockMessage }) => (
  <div className="flex justify-end my-2">
    <div className="max-w-[80%]">
      <div className="bg-blue-600 text-white rounded-lg px-4 py-2 shadow-lg">
        <div className="text-sm font-medium mb-1">You</div>
        <div>{message.content}</div>
      </div>
    </div>
  </div>
);

const SimpleAssistantMessage = ({ message }: { message: MockMessage }) => (
  <div className="flex justify-start my-2">
    <div className="max-w-[80%]">
      <div className="bg-gray-700 text-white rounded-lg px-4 py-2 shadow-lg">
        <div className="text-sm font-medium mb-1 text-blue-300">Assistant</div>
        <div>{message.content}</div>
      </div>
    </div>
  </div>
);

// Empty State Component
const EmptyState = () => (
  <div className="flex flex-col items-center justify-center h-full text-center py-12">
    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    </div>
    <h3 className="text-lg font-medium text-white mb-2">Start a conversation</h3>
    <p className="text-gray-500 text-sm max-w-sm">
      Click the voice orb below to start recording your first message.
      The AI will respond with its own voice memo.
    </p>
  </div>
);

// Messages Container Component
const MessagesContainer = ({ messages }: { messages: MockMessage[] }) => {
  if (messages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="p-4 space-y-4">
      {messages.map((message) => {
        if (message.role === 'user') {
          return <SimpleUserMessage key={message.id} message={message} />;
        } else {
          return <SimpleAssistantMessage key={message.id} message={message} />;
        }
      })}
    </div>
  );
};

function MessagesTestSimple() {
  const [messages, setMessages] = useState<MockMessage[]>(mockMessages);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = (content: string) => {
    const newMessage: MockMessage = {
      id: Date.now().toString(),
      role: "user",
      content: content,
      createdAt: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, newMessage]);
    setIsLoading(true);
    
    // Simulate assistant response
    setTimeout(() => {
      const assistantResponse: MockMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
        createdAt: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, assistantResponse]);
      setIsLoading(false);
    }, 1500);
  };

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 p-4 border-b border-gray-700">
        <h1 className="text-xl font-semibold">Messages Test - Simple Version</h1>
        <p className="text-sm text-gray-400">Testing message components with lorem ipsum (without assistant-ui runtime)</p>
      </div>

      {/* Test Controls */}
      <div className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => handleSendMessage("Lorem ipsum dolor sit amet")}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
          >
            Add User Message
          </button>
          <button
            onClick={() => setMessages([])}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
          >
            Clear Messages
          </button>
          <button
            onClick={() => setMessages(mockMessages)}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
          >
            Reset to Mock Data
          </button>
        </div>
        <div className="text-xs text-gray-400">
          Messages: {messages.length} | Loading: {isLoading ? 'Yes' : 'No'}
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <MessagesContainer messages={messages} />
        </div>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="p-4 border-t bg-gray-900">
          <div className="flex items-center justify-center space-x-2">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm text-gray-300">Processing your message...</span>
          </div>
        </div>
      )}

      {/* Footer with instructions */}
      <div className="bg-gray-800 p-3 border-t border-gray-700">
        <p className="text-xs text-gray-400 text-center">
          This is a simple test page for message components without assistant-ui runtime
        </p>
      </div>
    </div>
  );
}

export default MessagesTestSimple;
