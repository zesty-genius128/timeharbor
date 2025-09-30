import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Teams } from '../../../collections.js';

Template.calendar.onCreated(function () {
  // Calendar reactive variables
  this.calendarEvents = new ReactiveVar([]);
  this.isSyncingCalendar = new ReactiveVar(false);
  this.calendarError = new ReactiveVar('');
});

Template.calendar.helpers({
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

Template.calendar.events({
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
    
    // Get user's teams for selection
    const userTeams = Teams.find({ 
      $or: [
        { members: Meteor.userId() },
        { leader: Meteor.userId() },
        { admins: Meteor.userId() }
      ]
    }).fetch();
    
    if (userTeams.length === 0) {
      alert('You need to be a member of at least one team to log time.');
      return;
    }
    
    // If user has only one team, use it directly
    if (userTeams.length === 1) {
      logCalendarMeeting(userTeams[0]._id, meetingId, title, duration);
      return;
    }
    
    // Multiple teams - show selection modal
    showTeamSelectionModal(userTeams, meetingId, title, duration);
  }
});

// Helper functions for calendar meeting logging
function logCalendarMeeting(teamId, meetingId, title, duration) {
  // Show loading state on the button
  const button = $(`.log-meeting[data-meeting-id="${meetingId}"]`);
  const originalText = button.text();
  button.text('Logging...').prop('disabled', true);
  
  // Call server method to log the meeting time
  Meteor.call('logCalendarMeeting', {
    teamId,
    meetingId,
    title,
    duration
  }, (error, result) => {
    // Reset button state
    button.text(originalText).prop('disabled', false);
    
    if (error) {
      console.error('Failed to log calendar meeting:', error);
      alert(`Failed to log meeting time: ${error.reason || error.message}`);
    } else {
      console.log('Calendar meeting logged successfully:', result);
      button.text('✓ Logged').addClass('btn-success').removeClass('btn-primary');
      
      // Show success message
      alert(`Successfully logged ${duration} minutes for "${title}" to your timesheet!`);
      
      // Optionally disable the button to prevent duplicate logging
      setTimeout(() => {
        button.prop('disabled', true);
      }, 1000);
    }
  });
}

function showTeamSelectionModal(userTeams, meetingId, title, duration) {
  // Create modal HTML
  const modalHtml = `
    <div id="team-selection-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-semibold mb-4">Select Team for Meeting</h3>
        <p class="text-sm text-gray-600 mb-4">
          Which team should this meeting time be logged to?<br>
          <strong>"${title}"</strong> (${duration} minutes)
        </p>
        <div class="space-y-2 mb-4">
          ${userTeams.map(team => `
            <button class="team-select-btn w-full text-left p-3 border rounded hover:bg-gray-50" 
                    data-team-id="${team._id}" data-team-name="${team.name}">
              <div class="font-medium">${team.name}</div>
              <div class="text-sm text-gray-500">
                ${team.leader === Meteor.userId() ? 'Leader' : 'Member'}
              </div>
            </button>
          `).join('')}
        </div>
        <div class="flex gap-2">
          <button id="cancel-team-selection" class="btn btn-outline flex-1">Cancel</button>
        </div>
      </div>
    </div>
  `;
  
  // Add modal to page
  $('body').append(modalHtml);
  
  // Handle team selection
  $('.team-select-btn').on('click', function() {
    const teamId = $(this).data('team-id');
    const teamName = $(this).data('team-name');
    
    // Close modal
    $('#team-selection-modal').remove();
    
    // Log the meeting to selected team
    logCalendarMeeting(teamId, meetingId, title, duration);
  });
  
  // Handle cancel
  $('#cancel-team-selection').on('click', function() {
    $('#team-selection-modal').remove();
  });
  
  // Close on backdrop click
  $('#team-selection-modal').on('click', function(e) {
    if (e.target === this) {
      $(this).remove();
    }
  });
}
