import React, { useState } from "react";
import { MessagesPrimitive } from "~components/messages/primitive";
import { MessagesRuntimeProvider } from "~components/messages/runtime-provider";
import "~style.css";

// Mock data for testing (simplified structure)
const mockMessages = [
  {
    id: "1",
    role: "user" as const,
    content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString()
  },
  {
    id: "2", 
    role: "assistant" as const,
    content: "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
    createdAt: new Date(Date.now() - 1000 * 60 * 4).toISOString()
  },
  {
    id: "3",
    role: "user" as const,
    content: "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
    createdAt: new Date(Date.now() - 1000 * 60 * 3).toISOString()
  },
  {
    id: "4",
    role: "assistant" as const,
    content: "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.",
    createdAt: new Date(Date.now() - 1000 * 60 * 2).toISOString()
  },
  {
    id: "5",
    role: "user" as const,
    content: "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.",
    createdAt: new Date(Date.now() - 1000 * 60 * 1).toISOString()
  }
];

function MessagesTest() {
  const [messages, setMessages] = useState(mockMessages);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = (content: string) => {
    const newMessage = {
      id: Date.now().toString(),
      role: "user" as const,
      content: content,
      createdAt: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, newMessage]);
    setIsLoading(true);
    
    // Simulate assistant response
    setTimeout(() => {
      const assistantResponse = {
        id: (Date.now() + 1).toString(),
        role: "assistant" as const,
        content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
        createdAt: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, assistantResponse]);
      setIsLoading(false);
    }, 1500);
  };

  const handlePlayMessage = (message: any) => {
    console.log("Playing message:", message);
  };

  const handleDeleteMessage = (messageId: string) => {
    setMessages(prev => prev.filter(msg => msg.id !== messageId));
  };

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 p-4 border-b border-gray-700">
        <h1 className="text-xl font-semibold">Messages Test - Assistant UI</h1>
        <p className="text-sm text-gray-400">Testing MessagesPrimitive component with lorem ipsum</p>
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
        <MessagesRuntimeProvider>
          <MessagesPrimitive messages={messages} />
        </MessagesRuntimeProvider>
      </div>

      {/* Footer with instructions */}
      <div className="bg-gray-800 p-3 border-t border-gray-700">
        <p className="text-xs text-gray-400 text-center">
          This is a test page for the MessagesPrimitive component using assistant-ui library
        </p>
      </div>
    </div>
  );
}

export default MessagesTest;
