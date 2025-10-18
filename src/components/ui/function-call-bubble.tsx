import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Code2, Clock, Bot, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { cn } from '~lib/utils';

interface ParsedFunctionWithResult {
    functionName: string;
    parameters: Record<string, any>;
    confidence: number;
    result: string | object | null;
}

interface FunctionCallBubbleProps {
    functionCall: ParsedFunctionWithResult;
    timestamp: number;
    className?: string;
}

// Function icons mapping
const getFunctionIcon = (functionName: string) => {
    switch (functionName) {
        case 'navigate':
            return '🧭';
        case 'search':
            return '🔍';
        case 'click':
            return '👆';
        case 'scroll':
            return '📜';
        case 'extract':
            return '📄';
        case 'analyze':
            return '🔬';
        case 'json_response':
            return '📋';
        default:
            return '⚙️';
    }
};

// Function display name mapping
const getFunctionDisplayName = (functionName: string) => {
    switch (functionName) {
        case 'navigate':
            return 'Navigate';
        case 'search':
            return 'Search';
        case 'click':
            return 'Click';
        case 'scroll':
            return 'Scroll';
        case 'extract':
            return 'Extract Data';
        case 'analyze':
            return 'Analyze';
        case 'json_response':
            return 'JSON Response';
        default:
            return functionName.charAt(0).toUpperCase() + functionName.slice(1);
    }
};

const FunctionCallBubble: React.FC<FunctionCallBubbleProps> = ({
    functionCall,
    timestamp,
    className
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    const { functionName, parameters, confidence, result } = functionCall;
    const functionIcon = getFunctionIcon(functionName);
    const displayName = getFunctionDisplayName(functionName);
    
    // Determine status based on result
    const hasResult = result !== null && result !== undefined;
    const isError = typeof result === 'string' && result.toLowerCase().includes('error');
    const isSuccess = hasResult && !isError;
    
    // Format timestamp
    const formatTimestamp = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString();
    };
    
    // Format confidence
    const formatConfidence = (confidence: number) => {
        return Math.round(confidence * 100);
    };
    
    // Format parameters for display
    const formatParameters = (params: Record<string, any>) => {
        return Object.entries(params)
            .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
            .join(', ');
    };
    
    // Format result for display
    const formatResult = (result: string | object | null) => {
        if (result === null || result === undefined) {
            return 'No result';
        }
        
        if (typeof result === 'string') {
            return result;
        }
        
        if (typeof result === 'object') {
            return JSON.stringify(result, null, 2);
        }
        
        return String(result);
    };

    return (
        <div className={cn(
            "flex w-full mb-4 justify-start",
            className
        )}>
            <div className="max-w-xs lg:max-w-md rounded-2xl bg-blue-50 text-gray-900 rounded-bl-md border border-blue-200 shadow-lg">
                {/* Header with function button and timestamp */}
                <div className="flex items-center justify-between mb-3 p-4 pb-0">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="flex items-center space-x-2 hover:bg-blue-100 rounded-lg px-2 py-1 transition-colors duration-200"
                    >
                        <div className="flex items-center space-x-2">
                            {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                            ) : (
                                <ChevronRight className="w-4 h-4" />
                            )}
                            <span className="text-lg">{functionIcon}</span>
                            <span className="font-medium text-sm">{displayName}</span>
                        </div>
                        
                        {/* Status indicator */}
                        <div className="flex items-center space-x-1">
                            {!hasResult ? (
                                <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                            ) : isSuccess ? (
                                <CheckCircle className="w-3 h-3 text-green-500" />
                            ) : (
                                <XCircle className="w-3 h-3 text-red-500" />
                            )}
                        </div>
                    </button>
                    
                    <div className="flex items-center space-x-2">
                        <Clock className="w-3 h-3 opacity-75" />
                        <span className="text-xs opacity-75">
                            {formatTimestamp(timestamp)}
                        </span>
                    </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                    <div className="px-4 pb-4 space-y-3">
                        {/* Function details */}
                        <div className="bg-white rounded-lg p-3 border border-blue-100">
                            <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                    <Code2 className="w-4 h-4 text-blue-600" />
                                    <span className="font-medium text-sm text-blue-800">Function Details</span>
                                </div>
                                
                                <div className="text-xs space-y-1">
                                    <div>
                                        <span className="font-medium">Name:</span> {functionName}
                                    </div>
                                    <div>
                                        <span className="font-medium">Confidence:</span> {formatConfidence(confidence)}%
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Parameters */}
                        <div className="bg-white rounded-lg p-3 border border-blue-100">
                            <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                    <Bot className="w-4 h-4 text-green-600" />
                                    <span className="font-medium text-sm text-green-800">Parameters</span>
                                </div>
                                
                                <div className="text-xs">
                                    {Object.keys(parameters).length > 0 ? (
                                        <pre className="bg-gray-50 p-2 rounded text-xs overflow-x-auto">
                                            {formatParameters(parameters)}
                                        </pre>
                                    ) : (
                                        <span className="text-gray-500 italic">No parameters</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Result */}
                        <div className="bg-white rounded-lg p-3 border border-blue-100">
                            <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                    {isSuccess ? (
                                        <CheckCircle className="w-4 h-4 text-green-600" />
                                    ) : isError ? (
                                        <XCircle className="w-4 h-4 text-red-600" />
                                    ) : (
                                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                                    )}
                                    <span className={cn(
                                        "font-medium text-sm",
                                        isSuccess ? "text-green-800" : isError ? "text-red-800" : "text-blue-800"
                                    )}>
                                        Result
                                    </span>
                                </div>
                                
                                <div className="text-xs">
                                    <pre className={cn(
                                        "p-2 rounded text-xs overflow-x-auto max-h-32 overflow-y-auto",
                                        isSuccess ? "bg-green-50" : isError ? "bg-red-50" : "bg-gray-50"
                                    )}>
                                        {formatResult(result)}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Collapsed summary */}
                {!isExpanded && (
                    <div className="px-4 pb-4">
                        <div className="text-xs text-gray-600">
                            {Object.keys(parameters).length > 0 ? (
                                <span>
                                    {Object.entries(parameters)
                                        .slice(0, 2)
                                        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
                                        .join(', ')}
                                    {Object.keys(parameters).length > 2 && '...'}
                                </span>
                            ) : (
                                <span className="italic">No parameters</span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FunctionCallBubble;