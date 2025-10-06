# Testing the MCP Integration

This guide will walk you through testing the complete MCP integration with TimeHarbor.

## Architecture Overview

```
┌─────────────────┐
│  Claude Desktop │  ← You interact with Claude here
│   (MCP Client)  │
└────────┬────────┘
         │ stdio (MCP Protocol)
         │
┌────────▼────────┐
│   MCP Server    │  ← Translates MCP → HTTP
│  (this code)    │
└────────┬────────┘
         │ HTTP API calls
         │
┌────────▼────────┐
│  TimeHarbor App │  ← Your Meteor app
│    (Meteor)     │
└─────────────────┘
```

## Step-by-Step Testing

### Step 1: Start the Meteor App

```bash
# In the root timeharbor directory
meteor
```

You should see:
```
MCP API endpoints registered:
  GET  /api/mcp/health
  GET  /api/mcp/projects
  GET  /api/mcp/tickets
  POST /api/mcp/tickets
  GET  /api/mcp/status
  API Key: dev-mcp-key-12345
```

### Step 2: Test the API Endpoints Directly

Open a new terminal and test the endpoints:

```bash
# Test health check
curl http://localhost:3000/api/mcp/health

# Test projects (with API key)
curl -H "X-API-Key: dev-mcp-key-12345" http://localhost:3000/api/mcp/projects

# Test status
curl -H "X-API-Key: dev-mcp-key-12345" http://localhost:3000/api/mcp/status

# Create a ticket
curl -X POST \
  -H "X-API-Key: dev-mcp-key-12345" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Ticket","description":"Created via API","teamId":"YOUR_TEAM_ID"}' \
  http://localhost:3000/api/mcp/tickets
```

Replace `YOUR_TEAM_ID` with an actual team ID from the projects response.

### Step 3: Configure Claude Desktop

1. **Find your config file:**
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

2. **Edit the config:**
```json
{
  "mcpServers": {
    "timeharbor": {
      "command": "node",
      "args": ["/Users/adityadamerla/GitHub/timeharbor/mcp-server/index.js"],
      "env": {
        "METEOR_URL": "http://localhost:3000",
        "MCP_API_KEY": "dev-mcp-key-12345"
      }
    }
  }
}
```

**Important:** Use the absolute path to `index.js` on your system!

3. **Restart Claude Desktop completely** (quit and reopen)

### Step 4: Test in Claude Desktop

Open Claude Desktop and try these prompts:

#### Test 1: List Projects
```
Can you list all my TimeHarbor projects?
```

Claude should call the `list_projects` tool and show you real data from your Meteor app.

#### Test 2: Check Status
```
What's my current time tracking status?
```

Claude should call the `get_current_time` tool.

#### Test 3: Create a Ticket
```
Create a new ticket called "Fix navigation bug" in project [PROJECT_ID]
```

Replace `[PROJECT_ID]` with a real project ID from Step 1. Claude should create the ticket and you can verify it in your Meteor app.

## Troubleshooting

### "MCP server not found"
- Check that the path in `claude_desktop_config.json` is absolute and correct
- Make sure you fully restarted Claude Desktop

### "Connection refused" or "API call failed"
- Make sure Meteor is running on port 3000
- Check that the API key matches in both:
  - `mcp-server/index.js` (default: dev-mcp-key-12345)
  - `server/api/mcp-api.js` (default: dev-mcp-key-12345)

### "Unauthorized"
- The API key doesn't match
- Check environment variables in Claude Desktop config

### Claude doesn't call the tools
- Make sure you restarted Claude Desktop after config changes
- Try explicitly asking: "Use the list_projects tool"
- Check Claude Desktop logs (Help → View Logs)

## Viewing Logs

### MCP Server Logs
When running via Claude Desktop, stderr goes to Claude's logs:
- macOS: `~/Library/Logs/Claude/mcp*.log`

### Meteor Logs
Check your terminal where you ran `npm start`

## Advanced Testing

### Test with curl + stdio simulation
```bash
# This won't work directly since MCP uses stdio, but you can test the HTTP API
# Run the MCP server manually:
cd mcp-server
node index.js

# In another terminal, send MCP protocol messages (advanced)
```

### Environment Variables
You can override defaults:

```bash
export METEOR_URL=http://localhost:3000
export MCP_API_KEY=your-custom-key
node index.js
```

## What Should Work

✅ Claude can list your real projects from Meteor
✅ Claude can see your actual time tracking status
✅ Claude can create tickets in your Meteor database
✅ You can verify changes in the TimeHarbor UI

## Next Steps

Once basic tools work:
1. Test the `click_button` and `fill_field` tools (currently return mock data)
2. Add more tools for clock events, team management, etc.
3. Add proper authentication (per-user API keys)
4. Deploy the MCP server to run alongside your production Meteor app
