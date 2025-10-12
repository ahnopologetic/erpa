// src/utils/functions/registry.ts

import { handleNavigation } from "./handlers";

interface FunctionParameter {
    name: string;
    type: 'string' | 'boolean' | 'number';
    description: string;
    required: boolean;
}

interface FunctionDefinition {
    name: string;
    description: string;
    parameters: FunctionParameter[];
    examples: string[];  // Example natural language commands
    handler: string;     // Name of the actual function to call
}

export const functionRegistry: FunctionDefinition[] = [
    {
        name: "navigate",
        description: "Navigate to a specific location on the page",
        parameters: [
            {
                name: "location",
                type: "string",
                description: "Location to navigate to. Should be a valid css selector. e.g., '#campus', '.div:nth-of-type(2) > div', etc.",
                required: true
            }
        ],
        examples: [
            "i want to go to Campus section",
            "Go Allston section"
        ],
        handler: "handleNavigation"
    },
];

export const functionHandlers: Record<string, Function> = {
    "handleNavigation": handleNavigation
}