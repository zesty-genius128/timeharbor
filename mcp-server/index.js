#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";

// Configuration
const METEOR_URL = process.env.METEOR_URL || "http://localhost:3000";
const MCP_API_KEY = process.env.MCP_API_KEY || "dev-mcp-key-12345";

// Helper to call Meteor API
async function callMeteorAPI(endpoint, options = {}) {
  const url = `${METEOR_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": MCP_API_KEY,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API call failed: ${response.status} ${error}`);
  }

  return await response.json();
}

// Create MCP server
const server = new Server(
  {
    name: "timeharbor-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
const TOOLS = [
  {
    name: "get_current_time",
    description: "Get the current time tracking status",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_projects",
    description: "List all available projects/teams",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "create_ticket",
    description: "Create a new time tracking ticket",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The ticket title",
        },
        description: {
          type: "string",
          description: "The ticket description",
        },
        projectId: {
          type: "string",
          description: "The project/team ID",
        },
      },
      required: ["title", "projectId"],
    },
  },
  {
    name: "click_button",
    description: "Simulate clicking a button on the page",
    inputSchema: {
      type: "object",
      properties: {
        buttonId: {
          type: "string",
          description: "The ID of the button to click",
        },
      },
      required: ["buttonId"],
    },
  },
  {
    name: "fill_field",
    description: "Fill a text field with content",
    inputSchema: {
      type: "object",
      properties: {
        fieldId: {
          type: "string",
          description: "The ID of the field",
        },
        value: {
          type: "string",
          description: "The value to fill",
        },
      },
      required: ["fieldId", "value"],
    },
  },
];

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_current_time": {
        const data = await callMeteorAPI("/api/mcp/status");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case "list_projects": {
        const data = await callMeteorAPI("/api/mcp/projects");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case "create_ticket": {
        const { title, description, projectId } = args;
        const data = await callMeteorAPI("/api/mcp/tickets", {
          method: "POST",
          body: JSON.stringify({
            title,
            description: description || "",
            teamId: projectId,
          }),
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case "click_button": {
        const { buttonId } = args;
        // This would send a postMessage to the parent frame
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: `Button '${buttonId}' clicked`,
                action: "click",
                target: buttonId,
              }, null, 2),
            },
          ],
        };
      }

      case "fill_field": {
        const { fieldId, value } = args;
        // This would send a postMessage to the parent frame
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: `Field '${fieldId}' filled with '${value}'`,
                action: "fill",
                target: fieldId,
                value,
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: error.message,
          }),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TimeHarbor MCP server running on stdio");
  console.error(`Connected to Meteor at: ${METEOR_URL}`);
  console.error(`API Key: ${MCP_API_KEY}`);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
