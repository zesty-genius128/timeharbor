/**
 * Ozwell MCP Tools for TimeHarbor
 * Provides tools for the AI assistant to interact with ticket forms and retrieve history
 */

// MCP Tools Definitions (OpenAI function calling format)
const mcpTools = [
  {
    type: 'function',
    function: {
      name: 'update_ticket_title',
      description: 'Updates the title field of the current ticket form',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'The new title for the ticket'
          }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_ticket_description',
      description: 'Updates the description/reference notes field of the current ticket form',
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'The new description/reference notes for the ticket'
          }
        },
        required: ['description']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_ticket_time',
      description: 'Updates the time fields (hours, minutes, seconds) of the current ticket form',
      parameters: {
        type: 'object',
        properties: {
          hours: {
            type: 'number',
            description: 'Hours spent (0-23)'
          },
          minutes: {
            type: 'number',
            description: 'Minutes spent (0-59)'
          },
          seconds: {
            type: 'number',
            description: 'Seconds spent (0-59)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_project_history',
      description: 'Retrieves recent tickets for the current project/team to provide context about past work',
      parameters: {
        type: 'object',
        properties: {
          days: {
            type: 'number',
            description: 'Number of days to look back (default: 7)',
            default: 7
          },
          limit: {
            type: 'number',
            description: 'Maximum number of tickets to retrieve (default: 20)',
            default: 20
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_conversation_history',
      description: 'Retrieves past chat conversations for the current project to provide context from previous interactions',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of conversations to retrieve (default: 10)',
            default: 10
          }
        },
        required: []
      }
    }
  }
];

// Add tools to OzwellChatConfig (widget reads from here)
if (window.OzwellChatConfig) {
  window.OzwellChatConfig.tools = mcpTools;
  console.log('[MCP Tools] Added', mcpTools.length, 'tools to OzwellChatConfig');
} else {
  console.error('[MCP Tools] window.OzwellChatConfig not found! Tools will not be available.');
}

// Tool Handler Functions
const toolHandlers = {
  update_ticket_title: async (params) => {
    const titleInput = document.querySelector('[name="title"]');
    if (!titleInput) {
      return { success: false, error: 'Title input field not found' };
    }

    titleInput.value = params.title;

    // Trigger change event for any listeners
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Sync state with widget
    if (window.ozwellStateSync) {
      window.ozwellStateSync.syncCurrentState();
    }

    return {
      success: true,
      message: `Title updated to: ${params.title}`
    };
  },

  update_ticket_description: async (params) => {
    const descInput = document.querySelector('[name="github"]');
    if (!descInput) {
      return { success: false, error: 'Description input field not found' };
    }

    descInput.value = params.description;

    // Trigger change event for any listeners
    descInput.dispatchEvent(new Event('input', { bubbles: true }));
    descInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Sync state with widget
    if (window.ozwellStateSync) {
      window.ozwellStateSync.syncCurrentState();
    }

    return {
      success: true,
      message: `Description updated`
    };
  },

  update_ticket_time: async (params) => {
    const hoursInput = document.querySelector('[name="hours"]');
    const minutesInput = document.querySelector('[name="minutes"]');
    const secondsInput = document.querySelector('[name="seconds"]');

    const updated = [];

    if (params.hours !== undefined && hoursInput) {
      hoursInput.value = params.hours;
      hoursInput.dispatchEvent(new Event('input', { bubbles: true }));
      hoursInput.dispatchEvent(new Event('change', { bubbles: true }));
      updated.push(`hours: ${params.hours}`);
    }

    if (params.minutes !== undefined && minutesInput) {
      minutesInput.value = params.minutes;
      minutesInput.dispatchEvent(new Event('input', { bubbles: true }));
      minutesInput.dispatchEvent(new Event('change', { bubbles: true }));
      updated.push(`minutes: ${params.minutes}`);
    }

    if (params.seconds !== undefined && secondsInput) {
      secondsInput.value = params.seconds;
      secondsInput.dispatchEvent(new Event('input', { bubbles: true }));
      secondsInput.dispatchEvent(new Event('change', { bubbles: true }));
      updated.push(`seconds: ${params.seconds}`);
    }

    if (updated.length === 0) {
      return { success: false, error: 'No time fields found or updated' };
    }

    // Sync state with widget
    if (window.ozwellStateSync) {
      window.ozwellStateSync.syncCurrentState();
    }

    return {
      success: true,
      message: `Time updated: ${updated.join(', ')}`
    };
  },

  get_project_history: async (params) => {
    // Get current team ID from the page
    const teamSelect = document.querySelector('[name="team"]');
    if (!teamSelect || !teamSelect.value) {
      return {
        success: false,
        error: 'No team selected. Please select a team first.'
      };
    }

    const teamId = teamSelect.value;
    const days = params.days || 7;
    const limit = params.limit || 20;

    try {
      // Call Meteor method to get project history
      const history = await new Promise((resolve, reject) => {
        Meteor.call('getRecentProjectTickets', teamId, days, limit, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        });
      });

      return {
        success: true,
        data: history,
        message: `Retrieved ${history.length} recent tickets from the last ${days} days`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to retrieve project history: ${error.message}`
      };
    }
  },

  get_conversation_history: async (params) => {
    // Get current team ID from the page
    const teamSelect = document.querySelector('[name="team"]');
    if (!teamSelect || !teamSelect.value) {
      return {
        success: false,
        error: 'No team selected. Please select a team first.'
      };
    }

    const teamId = teamSelect.value;
    const limit = params.limit || 10;

    try {
      // Call Meteor method to get conversation history
      const history = await new Promise((resolve, reject) => {
        Meteor.call('getProjectChatHistory', teamId, limit, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        });
      });

      return {
        success: true,
        data: history,
        message: `Retrieved ${history.length} previous conversations`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to retrieve conversation history: ${error.message}`
      };
    }
  }
};

// Initialize MCP Tools Integration
class OzwellMCPIntegration {
  constructor() {
    this.widgetIframe = null;
    this.init();
  }

  init() {
    // Wait for widget to send tool execution requests
    window.addEventListener('message', (event) => {
      // Security check: Only accept messages from our widget iframe or reference server
      const validOrigins = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'null' // Widget iframe may have null origin due to CORS/iframe loading
      ];

      if (!validOrigins.includes(event.origin)) {
        // Silently ignore Meteor and other internal messages
        return;
      }

      // For null origin, verify it's from our widget iframe
      if (event.origin === 'null') {
        const widgetIframe = document.querySelector('iframe[src*="widget.html"]');
        if (!widgetIframe || event.source !== widgetIframe.contentWindow) {
          return;
        }
      }

      const { type, toolCall } = event.data;

      if (type === 'CALL_TOOL') {
        // Widget is requesting to execute a tool
        console.log('[MCP Tools] Tool call requested:', toolCall);
        this.executeTool(toolCall);
      }
    });

    console.log('[MCP Tools] Integration initialized, listening for tool calls');
  }

  async executeTool(toolCall) {
    const { name, arguments: args } = toolCall;
    console.log(`[MCP Tools] Executing: ${name}`, args);

    const handler = toolHandlers[name];

    if (!handler) {
      this.sendToolResult({
        success: false,
        error: `Unknown tool: ${name}`
      });
      return;
    }

    try {
      const result = await handler(args);
      this.sendToolResult(result);
    } catch (error) {
      this.sendToolResult({
        success: false,
        error: `Tool execution failed: ${error.message}`
      });
    }
  }

  sendToolResult(result) {
    if (!this.widgetIframe) {
      console.error('[MCP Tools] Cannot send tool result: widget iframe not found');
      return;
    }

    this.widgetIframe.contentWindow.postMessage(
      {
        type: 'TOOL_RESULT',
        result: result
      },
      '*'
    );

    console.log('[MCP Tools] Tool result sent:', result.message || result.error);
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.ozwellMCPIntegration = new OzwellMCPIntegration();
  });
} else {
  window.ozwellMCPIntegration = new OzwellMCPIntegration();
}
