import { WebApp } from 'meteor/webapp';
import { Teams } from '../../collections.js';
import { Tickets } from '../../collections.js';
import { Meteor } from 'meteor/meteor';

// Simple API key authentication (replace with your actual auth)
const MCP_API_KEY = process.env.MCP_API_KEY || 'dev-mcp-key-12345';

function authenticateRequest(req) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== MCP_API_KEY) {
    return null;
  }
  return true;
}

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

// Helper to get user from API key or default user
async function getUserId(req) {
  // For now, just return the first user
  // In production, you'd associate API keys with users
  const user = await Meteor.users.findOneAsync({});
  return user ? user._id : null;
}

// MCP API Routes
WebApp.connectHandlers.use('/api/mcp/projects', async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    });
    res.end();
    return;
  }

  if (!authenticateRequest(req)) {
    sendJSON(res, 401, { error: 'Unauthorized' });
    return;
  }

  try {
    const teams = await Teams.find({}).fetchAsync();
    const projects = teams.map(team => ({
      id: team._id,
      name: team.name,
      createdAt: team.createdAt,
      memberCount: team.members ? team.members.length : 0,
    }));

    sendJSON(res, 200, { projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    sendJSON(res, 500, { error: error.message });
  }
});

WebApp.connectHandlers.use('/api/mcp/tickets', async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    });
    res.end();
    return;
  }

  if (!authenticateRequest(req)) {
    sendJSON(res, 401, { error: 'Unauthorized' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const tickets = await Tickets.find({}, { limit: 10, sort: { createdAt: -1 } }).fetchAsync();
      const ticketData = tickets.map(ticket => ({
        id: ticket._id,
        title: ticket.title,
        description: ticket.description,
        teamId: ticket.teamId,
        userId: ticket.userId,
        createdAt: ticket.createdAt,
      }));

      sendJSON(res, 200, { tickets: ticketData });
    } catch (error) {
      console.error('Error fetching tickets:', error);
      sendJSON(res, 500, { error: error.message });
    }
  } else if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { title, description, teamId } = data;

        if (!title || !teamId) {
          sendJSON(res, 400, { error: 'Missing required fields: title, teamId' });
          return;
        }

        const userId = await getUserId(req);
        if (!userId) {
          sendJSON(res, 400, { error: 'No user found' });
          return;
        }

        const ticketId = await Tickets.insertAsync({
          title,
          description: description || '',
          teamId,
          userId,
          createdAt: new Date(),
        });

        sendJSON(res, 201, {
          success: true,
          ticketId,
          message: 'Ticket created successfully',
        });
      } catch (error) {
        console.error('Error creating ticket:', error);
        sendJSON(res, 500, { error: error.message });
      }
    });
  } else {
    sendJSON(res, 405, { error: 'Method not allowed' });
  }
});

WebApp.connectHandlers.use('/api/mcp/status', async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    });
    res.end();
    return;
  }

  if (!authenticateRequest(req)) {
    sendJSON(res, 401, { error: 'Unauthorized' });
    return;
  }

  try {
    const userId = await getUserId(req);
    const recentTickets = await Tickets.find(
      { userId },
      { limit: 5, sort: { createdAt: -1 } }
    ).fetchAsync();

    const totalTickets = await Tickets.find({ userId }).countAsync();

    sendJSON(res, 200, {
      status: 'active',
      userId,
      totalTickets,
      recentTickets: recentTickets.map(t => ({
        id: t._id,
        title: t.title,
        teamId: t.teamId,
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching status:', error);
    sendJSON(res, 500, { error: error.message });
  }
});

// Health check
WebApp.connectHandlers.use('/api/mcp/health', (req, res) => {
  sendJSON(res, 200, { status: 'ok', timestamp: new Date() });
});

console.log('MCP API endpoints registered:');
console.log('  GET  /api/mcp/health');
console.log('  GET  /api/mcp/projects');
console.log('  GET  /api/mcp/tickets');
console.log('  POST /api/mcp/tickets');
console.log('  GET  /api/mcp/status');
console.log(`  API Key: ${MCP_API_KEY}`);
