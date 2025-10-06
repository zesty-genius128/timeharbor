# TimeHarbor MCP Server

A Model Context Protocol (MCP) server that exposes TimeHarbor functionality to LLM clients like Claude Desktop.

## What This Does

This MCP server exposes 5 tools that an LLM can use to interact with TimeHarbor:

1. **get_current_time** - Get current time tracking status
2. **list_projects** - List all available projects/teams
3. **create_ticket** - Create a new time tracking ticket
4. **click_button** - Simulate clicking a button (for UI automation)
5. **fill_field** - Fill a text field with content

## Installation

```bash
cd mcp-server
npm install
```

## Quick Start

### 1. Start the Meteor App
```bash
# In the main timeharbor directory
meteor

# Meteor will run on http://localhost:3000
# MCP API endpoints will be available at /api/mcp/*
```

### 2. Test the MCP Server Locally
```bash
# In the mcp-server directory
cd mcp-server
npm start

# You should see:
# TimeHarbor MCP server running on stdio
# Connected to Meteor at: http://localhost:3000
# API Key: dev-mcp-key-12345
```

## Connect to Claude Desktop

1. **Find your Claude Desktop config file:**

   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. **Edit the config file** and add this MCP server:

```json
{
  "mcpServers": {
    "timeharbor": {
      "command": "node",
      "args": ["/absolute/path/to/timeharbor/mcp-server/index.js"]
    }
  }
}
```

Replace `/absolute/path/to/timeharbor` with your actual path.

3. **Restart Claude Desktop**

4. **Test it** - In Claude Desktop, type:
   ```
   Can you list my TimeHarbor projects?
   ```

   Claude should now be able to see and call the MCP tools!

## How It Works

```
┌─────────────────┐
│  Claude Desktop │
│   (MCP Client)  │
└────────┬────────┘
         │ stdio
         │
┌────────▼────────┐
│   MCP Server    │
│  (this code)    │
└────────┬────────┘
         │
         │ (future: HTTP/WebSocket)
         │
┌────────▼────────┐
│  TimeHarbor App │
│    (Meteor)     │
└─────────────────┘
```

Currently, the tools return mock data. To connect to the real TimeHarbor app, you'd need to:

1. Expose an API endpoint in Meteor
2. Have the MCP server make HTTP calls to that endpoint
3. Or use a shared database connection

## Example Usage in Claude Desktop

Once connected, you can ask Claude:

- "List all my projects"
- "Create a ticket called 'Fix login bug' in project proj1"
- "What's my current time tracking status?"
- "Click the submit button"
- "Fill the title field with 'New Feature Request'"

## Architecture Notes

- Uses **stdio transport** (stdin/stdout) - required for Claude Desktop
- Returns JSON responses
- Currently returns mock data (not connected to real Meteor app)
- Tools follow MCP specification exactly

## Next Steps

To make this production-ready:

1. Add Meteor DDP connection or HTTP API calls
2. Add authentication/authorization
3. Connect to real database
4. Handle errors properly
5. Add logging
