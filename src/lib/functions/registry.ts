// src/utils/functions/registry.ts

import { handleNavigation, handleReadOut } from "./handlers";

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
    {
        name: "readOut",
        description: "Read out a specific section or node",
        parameters: [
            {
                name: "targetType",
                type: "string",
                description: "Type of target to read out. Should be 'SECTION' or 'NODE'",
                required: true
            },
            {
                name: "target",
                type: "string",
                description: "Target to read out. For section, it should be the section name. For node, it should be the node id or selector.",
                required: true
            }
        ],
        examples: [
            "read out the Campus section => readOut('SECTION', 'Campus')",
            "read out the Allston section => readOut('SECTION', 'Allston')"
        ],
        handler: "handleReadOut"
    }
];

export const functionHandlers: Record<string, Function> = {
    "navigate": handleNavigation,
    "readOut": handleReadOut
}