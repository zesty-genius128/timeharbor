# Ozwell Simplified Approach

## Overview
Use project/ticket-based session IDs for Ozwell integration with last response autofill.

## Implementation
- Generate session ID from project name + ticket title
- Create dedicated Ozwell session per ticket/project
- Store last AI response for autofill
- Direct iframe integration without complex MCP

## Benefits
- **Simpler Implementation**: No complex MCP protocol needed
- **Better User Experience**: Each ticket gets own AI "memory"
- **Persistent Conversations**: Users continue where they left off
- **Natural Context**: Session ID provides inherent context
- **Faster Development**: Leverages existing Ozwell session API
- **Reduced Complexity**: Fewer moving parts to debug
- **Immediate Value**: Quick to implement and test
- **Maintainable**: Easier to support and extend

## Technical Approach
```javascript
// Session ID: timeharbor-{project}-{ticket}-session
function generateSessionId(projectName, ticketTitle) {
  const cleanProject = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const cleanTicket = ticketTitle.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return `timeharbor-${cleanProject}-${cleanTicket}-session`;
}
```

## Storage
- Store session mappings in OzwellConversations collection
- Cache last AI response per session
- Auto-populate forms on return visits