import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Teams, Tickets, ClockEvents } from '../../../collections.js';
import { formatTime, formatDate, calculateTotalTime } from '../../utils/TimeUtils.js';
import { getTeamName, getUserEmail, getUserName } from '../../utils/UserTeamUtils.js';
import { Grid } from 'ag-grid-community';

Template.home.onCreated(function () {
  const template = this;
  
  // Initialize reactive variables for team dashboard
  template.selectedDate = new ReactiveVar(new Date().toISOString().split('T')[0]); // Today's date in YYYY-MM-DD format
  
  this.autorun(() => {
    // userTeams and clockEventsForUser subscriptions moved to MainLayout
    // Subscribe to all clock events for teams the user leads
    const leaderTeams = Teams.find({ leader: Meteor.userId() }).fetch();
    const teamIds = leaderTeams.map(t => t._id);
    if (teamIds.length) {
      this.subscribe('clockEventsForTeams', teamIds);
      // Also subscribe to all tickets for these teams
      this.subscribe('teamTickets', teamIds);
    }
    
    // Subscribe to all users from ALL teams (not just leader teams) for proper user display
    const allTeams = Teams.find({
      $or: [
        { members: Meteor.userId() },
        { leader: Meteor.userId() },
        { admins: Meteor.userId() }
      ]
    }).fetch();
    
    const allMembers = Array.from(new Set(
      allTeams.flatMap(t => [...(t.members || []), ...(t.admins || []), t.leader].filter(id => id))
    ));
    if (allMembers.length) {
      this.subscribe('usersByIds', allMembers);
    }
  });
});

Template.home.onRendered(function () {
  const instance = this;

  // Column definitions mirroring the former table
  const columnDefs = [
    { headerName: 'Team Member', field: 'displayName', flex: 1.5, sortable: true, filter: 'agTextColumnFilter' },
    { headerName: 'Email', field: 'userEmail', flex: 1.5, sortable: true, filter: 'agTextColumnFilter' },
    { 
      headerName: 'Total Hours', field: 'totalSeconds', flex: 1, sortable: true, filter: 'agNumberColumnFilter',
      valueFormatter: p => formatTime(p.value)
    },
    { 
      headerName: 'First Clock-in', field: 'firstClockIn', flex: 1.2, sortable: true, filter: 'agDateColumnFilter',
      valueFormatter: p => p.value ? formatDate(p.value) : 'No activity'
    },
    { 
      headerName: 'Last Clock-out', field: 'lastClockOut', flex: 1.2, sortable: true, filter: 'agDateColumnFilter',
      valueFormatter: p => {
        if (!p.value) return p.data?.hasActiveSession ? 'Active' : '-';
        return formatDate(p.value);
      }
    },
    { 
      headerName: 'Tickets Worked', field: 'tickets', flex: 1.5, sortable: false, filter: false,
      valueFormatter: p => (Array.isArray(p.value) && p.value.length) ? p.value.join(', ') : 'No tickets'
    }
  ];

  instance.gridOptions = {
    columnDefs,
    defaultColDef: {
      resizable: true,
      sortable: true,
      filter: true,
    }
  };

  // Shared computation with the template helper, extracted for grid usage
  const computeTeamMemberSummary = () => {
    const selectedDate = instance.selectedDate.get();
    const leaderTeams = Teams.find({ leader: Meteor.userId() }).fetch();
    if (!leaderTeams.length) return [];

    const startOfDay = new Date(selectedDate + 'T00:00:00').getTime();
    const endOfDay = new Date(selectedDate + 'T23:59:59').getTime();
    const teamIds = leaderTeams.map(t => t._id);

    const allMembers = Array.from(new Set(
      leaderTeams.flatMap(t => [...(t.members || []), ...(t.admins || []), t.leader].filter(id => id))
    ));

    const rows = allMembers.map(userId => {
      const userClockEvents = ClockEvents.find({
        userId: userId,
        teamId: { $in: teamIds },
        startTimestamp: { $gte: startOfDay, $lte: endOfDay }
      }).fetch();

      if (userClockEvents.length === 0) {
        return {
          userId,
          displayName: getUserName(userId),
          userEmail: getUserEmail(userId),
          totalSeconds: 0,
          firstClockIn: null,
          lastClockOut: null,
          hasActiveSession: false,
          tickets: []
        };
      }

      let totalSeconds = 0;
      let firstClockIn = null;
      let lastClockOut = null;
      let hasActiveSession = false;
      const ticketTitles = new Set();

      userClockEvents.forEach(clockEvent => {
        totalSeconds += calculateTotalTime(clockEvent);
        if (!firstClockIn || clockEvent.startTimestamp < firstClockIn) {
          firstClockIn = clockEvent.startTimestamp;
        }
        if (clockEvent.endTime) {
          if (!lastClockOut || clockEvent.endTime > lastClockOut) {
            lastClockOut = clockEvent.endTime;
          }
        } else {
          hasActiveSession = true;
        }
        clockEvent.tickets?.forEach(ticket => {
          const ticketDoc = Tickets.findOne(ticket.ticketId);
          if (ticketDoc) ticketTitles.add(ticketDoc.title);
        });
      });

      return {
        userId,
        displayName: getUserName(userId),
        userEmail: getUserEmail(userId),
        totalSeconds,
        firstClockIn,
        lastClockOut,
        hasActiveSession,
        tickets: Array.from(ticketTitles)
      };
    });

    return rows.filter(member => member.totalSeconds > 0 || member.hasActiveSession);
  };

  // Initialize grid
  const gridEl = instance.find('#teamDashboardGrid');
  if (gridEl) {
    new Grid(gridEl, instance.gridOptions);
    const initialRows = computeTeamMemberSummary();
    if (instance.gridOptions?.api) {
      instance.gridOptions.api.setRowData(initialRows);
    }
  }

  // Reactive updates: respond to date changes and collection updates
  instance.autorun(() => {
    // Dependencies to re-run: selected date, relevant collections
    instance.selectedDate.get();
    Teams.find({ leader: Meteor.userId() }).fetch();
    ClockEvents.find().fetch();
    Tickets.find().fetch();

    const rows = computeTeamMemberSummary();
    if (instance.gridOptions?.api) {
      instance.gridOptions.api.setRowData(rows);
    }
  });
});

Template.home.onDestroyed(function () {
  if (this.gridOptions?.api) {
    this.gridOptions.api.destroy();
  }
});

Template.home.helpers({
  allClockEvents() {
    // Show all clock events for teams the user leads, flat list, most recent first
    const leaderTeams = Teams.find({ leader: Meteor.userId() }).fetch();
    const teamIds = leaderTeams.map(t => t._id);
    return ClockEvents.find({ teamId: { $in: teamIds } }, { sort: { startTimestamp: -1 } }).fetch();
  },
  teamName: getTeamName,
  userName: getUserEmail,
  formatDate,  // Using imported utility
  ticketTitle(ticketId) {
    const ticket = Tickets.findOne(ticketId);
    return ticket ? ticket.title : `Unknown Ticket (${ticketId})`;
  },
  clockEventTotalTime(clockEvent) {
    return calculateTotalTime(clockEvent);  // Using imported utility
  },
  ticketTotalTime(ticket) {
    return calculateTotalTime(ticket);  // Using imported utility
  },
  formatTime,  // Using imported utility
  
  // Team Dashboard helpers
  isTeamLeader() {
    return Teams.findOne({ leader: Meteor.userId() });
  },
  
  selectedDate() {
    return Template.instance().selectedDate.get();
  },
  
  formatDateOnly(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  },
  
  teamMemberSummary() {
    const template = Template.instance();
    const selectedDate = template.selectedDate.get();
    const leaderTeams = Teams.find({ leader: Meteor.userId() }).fetch();
    
    if (!leaderTeams.length) return [];
    
    // Get start and end of selected date
    const startOfDay = new Date(selectedDate + 'T00:00:00').getTime();
    const endOfDay = new Date(selectedDate + 'T23:59:59').getTime();
    
    const teamIds = leaderTeams.map(t => t._id);
    
    // Get all team members
    const allMembers = Array.from(new Set(
      leaderTeams.flatMap(t => [...(t.members || []), ...(t.admins || []), t.leader].filter(id => id))
    ));
    
    return allMembers.map(userId => {
      // Get clock events for this user on selected date
      const userClockEvents = ClockEvents.find({
        userId: userId,
        teamId: { $in: teamIds },
        startTimestamp: { $gte: startOfDay, $lte: endOfDay }
      }).fetch();
      
      if (userClockEvents.length === 0) {
        return {
          userId: userId,
          userEmail: getUserEmail(userId),
          totalSeconds: 0,
          firstClockIn: null,
          lastClockOut: null,
          hasActiveSession: false,
          tickets: []
        };
      }
      
      // Calculate total time and get first/last times
      let totalSeconds = 0;
      let firstClockIn = null;
      let lastClockOut = null;
      let hasActiveSession = false;
      const ticketTitles = new Set();
      
      userClockEvents.forEach(clockEvent => {
        // Add up total time
        totalSeconds += calculateTotalTime(clockEvent);
        
        // Track first clock-in
        if (!firstClockIn || clockEvent.startTimestamp < firstClockIn) {
          firstClockIn = clockEvent.startTimestamp;
        }
        
        // Track last clock-out
        if (clockEvent.endTime) {
          if (!lastClockOut || clockEvent.endTime > lastClockOut) {
            lastClockOut = clockEvent.endTime;
          }
        } else {
          hasActiveSession = true;
        }
        
        // Collect ticket titles
        clockEvent.tickets?.forEach(ticket => {
          const ticketDoc = Tickets.findOne(ticket.ticketId);
          if (ticketDoc) {
            ticketTitles.add(ticketDoc.title);
          }
        });
      });
      
      return {
        userId: userId,
        userEmail: getUserEmail(userId),
        totalSeconds: totalSeconds,
        firstClockIn: firstClockIn,
        lastClockOut: lastClockOut,
        hasActiveSession: hasActiveSession,
        tickets: Array.from(ticketTitles)
      };
    }).filter(member => member.totalSeconds > 0 || member.hasActiveSession); // Only show members with activity
  },
  
  // Helper to get user name in template
  getDisplayName(userId) {
    return getUserName(userId);
  }
});

Template.home.events({
  'change #date-filter'(event, template) {
    const selectedDate = event.target.value;
    template.selectedDate.set(selectedDate);
  },
  
  'click #today-btn'(event, template) {
    const today = new Date().toISOString().split('T')[0];
    template.selectedDate.set(today);
    // Update the input field
    template.$('#date-filter').val(today);
  },
  
  'click #yesterday-btn'(event, template) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    template.selectedDate.set(yesterdayStr);
    // Update the input field
    template.$('#date-filter').val(yesterdayStr);
  }
});