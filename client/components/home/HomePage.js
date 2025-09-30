import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Teams, Tickets, ClockEvents } from '../../../collections.js';
import { currentTime } from '../layout/MainLayout.js';
import { formatTime, formatDate, calculateTotalTime } from '../../utils/TimeUtils.js';
import { getTeamName, getUserEmail } from '../../utils/UserTeamUtils.js';
import { isTeamsLoading, isClockEventsLoading } from '../layout/MainLayout.js';

Template.home.onCreated(function () {
  // Calendar reactive variables
  this.calendarEvents = new ReactiveVar([]);
  this.isSyncingCalendar = new ReactiveVar(false);
  this.calendarError = new ReactiveVar('');

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
    // Subscribe to all users in those teams for username display
    const allMembers = Array.from(new Set(leaderTeams.flatMap(t => t.members)));
    if (allMembers.length) {
      this.subscribe('usersByIds', allMembers);
    }
  });
});

Template.home.helpers({
  leaderTeams() {
    return Teams.find({ leader: Meteor.userId() }).fetch();
  },
  teamClockEvents(teamId) {
    return ClockEvents.find({ teamId }).fetch();
  },
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
  isClockEventsLoading,
  isTeamsLoading,
  
  // Calendar helpers
  calendarEvents() {
    return Template.instance().calendarEvents.get();
  },
  hasCalendarEvents() {
    return Template.instance().calendarEvents.get().length > 0;
  },
  isSyncingCalendar() {
    return Template.instance().isSyncingCalendar.get();
  },
  calendarError() {
    return Template.instance().calendarError.get();
  },
  hasGoogleAccount() {
    const user = Meteor.user();
    console.log('=== GOOGLE ACCOUNT DEBUG ===');
    console.log('User exists:', !!user);
    console.log('User services:', user && user.services ? Object.keys(user.services) : 'No services');
    console.log('Has Google service:', !!(user && user.services && user.services.google));
    
    if (user && user.services && user.services.google) {
      console.log('Google service details:');
      console.log('- ID:', user.services.google.id);
      console.log('- Access token exists:', !!user.services.google.accessToken);
      console.log('- Access token length:', user.services.google.accessToken ? user.services.google.accessToken.length : 0);
      console.log('- Scope:', user.services.google.scope);
      console.log('- Email:', user.services.google.email);
    }
    console.log('=== END DEBUG ===');
    
    return user && user.services && user.services.google;
  }
});

Template.home.events({
  'click #reauth-google'(event, template) {
    event.preventDefault();
    
    console.log('Re-authenticating with Google for calendar permissions...');
    
    // Force Google login with calendar permissions
    Meteor.loginWithGoogle({
      requestPermissions: ['email', 'profile', 'https://www.googleapis.com/auth/calendar.readonly'],
      requestOfflineToken: true,
      forceApprovalPrompt: true // Force Google to show permissions again
    }, (error) => {
      if (error) {
        console.error('Google re-auth error:', error);
        template.calendarError.set('Failed to re-authenticate: ' + error.reason);
      } else {
        console.log('Google re-authentication successful!');
        template.calendarError.set('');
        // Automatically try to sync after re-auth
        setTimeout(() => {
          $('#sync-calendar').click();
        }, 1000);
      }
    });
  },

  'click #connect-google-account'(event, template) {
    event.preventDefault();
    
    console.log('Connecting Google account with calendar permissions...');
    
    // Simple Google OAuth with explicit popup style
    Meteor.loginWithGoogle({
      requestPermissions: ['email', 'profile', 'https://www.googleapis.com/auth/calendar.readonly'],
      requestOfflineToken: true,
      forceApprovalPrompt: true,
      loginStyle: 'popup'
    }, (error) => {
      if (error) {
        console.error('Google connect error:', error);
        template.calendarError.set('Failed to connect Google: ' + error.reason);
      } else {
        console.log('Google connection successful!');
        template.calendarError.set('');
        
        // Wait for user object to update
        setTimeout(() => {
          const user = Meteor.user();
          console.log('=== AFTER GOOGLE CONNECTION DEBUG ===');
          console.log('User ID:', user ? user._id : 'No user');
          console.log('User services:', user && user.services ? Object.keys(user.services) : 'No services');
          
          if (user && user.services && user.services.google) {
            console.log('✅ Google service found! Calendar access should work now.');
            $('#sync-calendar').click();
          } else {
            console.log('❌ No Google service found. Trying page refresh...');
            setTimeout(() => location.reload(), 1000);
          }
          console.log('=== END DEBUG ===');
        }, 2000);
      }
    });
  },

  'click #test-google-oauth'(event, template) {
    event.preventDefault();
    
    console.log('=== TESTING GOOGLE OAUTH AVAILABILITY ===');
    console.log('Meteor.loginWithGoogle available:', typeof Meteor.loginWithGoogle);
    console.log('Google package loaded:', !!Package.google);
    
    if (typeof Meteor.loginWithGoogle !== 'function') {
      alert('ERROR: Meteor.loginWithGoogle is not available. Google package not loaded.');
      return;
    }
    
    console.log('Testing basic Google OAuth...');
    
    Meteor.loginWithGoogle({
      requestPermissions: ['email', 'profile'],
      loginStyle: 'popup'
    }, (error) => {
      if (error) {
        console.error('Basic Google OAuth test failed:', error);
        alert('Basic Google OAuth failed: ' + error.reason);
      } else {
        console.log('Basic Google OAuth test successful!');
        alert('Basic Google OAuth works! Check console for user details.');
        
        setTimeout(() => {
          const user = Meteor.user();
          console.log('Test result - User services:', user && user.services ? Object.keys(user.services) : 'No services');
        }, 1000);
      }
    });
  },

  'click #force-logout-login'(event, template) {
    event.preventDefault();
    
    if (confirm('This will log you out completely and then login with Google. Continue?')) {
      console.log('=== FORCING FRESH GOOGLE LOGIN ===');
      
      Meteor.logout((error) => {
        if (error) {
          console.error('Logout error:', error);
          alert('Logout failed: ' + error.reason);
          return;
        }
        
        console.log('Logged out successfully. Starting fresh Google login...');
        
        // Wait a moment for logout to complete
        setTimeout(() => {
          Meteor.loginWithGoogle({
            requestPermissions: ['email', 'profile', 'https://www.googleapis.com/auth/calendar.readonly'],
            requestOfflineToken: true,
            loginStyle: 'popup'
          }, (loginError) => {
            if (loginError) {
              console.error('Fresh Google login error:', loginError);
              alert('Fresh Google login failed: ' + loginError.reason);
            } else {
              console.log('Fresh Google login successful!');
              alert('Fresh Google login successful! Page will reload...');
              setTimeout(() => location.reload(), 1000);
            }
          });
        }, 1000);
      });
    }
  },

  'click #sync-calendar'(event, template) {
    event.preventDefault();
    
    if (template.isSyncingCalendar.get()) return;
    
    template.isSyncingCalendar.set(true);
    template.calendarError.set('');
    
    // Call the calendar method
    Meteor.call('getMyCalendarEvents', (error, result) => {
      template.isSyncingCalendar.set(false);
      
      if (error) {
        console.error('Calendar sync error:', error);
        template.calendarError.set(error.reason || 'Failed to sync calendar');
      } else {
        console.log('Calendar synced:', result);
        template.calendarEvents.set(result.meetings);
        template.calendarError.set('');
        
        if (result.count === 0) {
          template.calendarError.set('No calendar events found for the past 7 days or next 30 days.');
        }
      }
    });
  },
  
  'click .log-meeting'(event, template) {
    event.preventDefault();
    
    const meetingId = event.currentTarget.dataset.meetingId;
    const duration = parseInt(event.currentTarget.dataset.duration);
    const title = event.currentTarget.dataset.title;
    
    // Here you would log the time - for now just show an alert
    alert(`Logged ${duration} minutes for "${title}"`);
    
    // In the future, you could call a method to log time:
    // Meteor.call('logMeetingTime', meetingId, duration, title);
  }
});