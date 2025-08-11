import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Teams, Tickets, ClockEvents } from '../../../collections.js';
import { currentTime } from '../layout/MainLayout.js';
import { formatTime, calculateTotalTime } from '../../utils/TimeUtils.js';
import { getUserTeams } from '../../utils/UserTeamUtils.js';

// Constants for better maintainability
const ERROR_MESSAGES = {
  CLOCK_OUT_FAILED: 'Failed to clock out: ',
  CLOCK_IN_FAILED: 'Failed to clock in: ',
  STOP_TICKET_FAILED: 'Failed to stop active ticket: ',
  CREATE_TICKET_FAILED: 'Error creating ticket: ',
  START_TIMER_FAILED: 'Failed to start timer: ',
  STOP_TIMER_FAILED: 'Failed to stop timer: ',
  STOP_CURRENT_TIMER_FAILED: 'Failed to stop current timer: ',
  ADD_TICKET_FAILED: 'Failed to add ticket to clock event: ',
  STOP_TICKET_CLOCK_EVENT_FAILED: 'Failed to stop current ticket in clock event: '
};

const USER_MESSAGES = {
  TITLE_REQUIRED: 'Ticket title is required.',
  START_SESSION_FIRST: 'Please start a session before starting an activity.',
  SELECT_TICKET: 'Select a ticket to clock in/out.'
};

/**
 * Utility functions to reduce code duplication and improve maintainability
 */
const TicketUtils = {
  /**
   * Stops an active ticket and updates clock event
   * @param {string} ticketId - ID of ticket to stop
   * @param {string} teamId - Team ID
   * @param {Function} onSuccess - Success callback
   * @param {Function} onError - Error callback
   */
  stopActiveTicket(ticketId, teamId, onSuccess, onError) {
    const now = Date.now();
    
    Meteor.call('updateTicketStop', ticketId, now, (err) => {
      if (err) {
        onError(err);
        return;
      }
      
      // Also stop the ticket in the clock event
      const clockEvent = ClockEvents.findOne({ userId: Meteor.userId(), teamId, endTime: null });
      if (clockEvent) {
        Meteor.call('clockEventStopTicket', clockEvent._id, ticketId, now, (err) => {
          if (err) {
            console.error('Failed to stop ticket in clock event:', err);
          }
        });
      }
      
      onSuccess();
    });
  },

  /**
   * Starts a ticket and adds it to clock event
   * @param {string} ticketId - ID of ticket to start
   * @param {string} teamId - Team ID
   * @param {Function} onSuccess - Success callback
   * @param {Function} onError - Error callback
   */
  startTicket(ticketId, teamId, onSuccess, onError) {
    const now = Date.now();
    
    Meteor.call('updateTicketStart', ticketId, now, (err) => {
      if (err) {
        onError(err);
        return;
      }
      
      // Add to clock event if user is clocked in
      const clockEvent = ClockEvents.findOne({ userId: Meteor.userId(), teamId, endTime: null });
      if (clockEvent) {
        Meteor.call('clockEventAddTicket', clockEvent._id, ticketId, now, (err) => {
          if (err) {
            console.error('Failed to add ticket to clock event:', err);
          }
        });
      }
      
      onSuccess();
    });
  },

  /**
   * Checks if user has active session for team
   * @param {string} teamId - Team ID
   * @returns {boolean} - True if session is active
   */
  hasActiveSession(teamId) {
    return !!ClockEvents.findOne({ userId: Meteor.userId(), teamId, endTime: null });
  },

  /**
   * Safely stops a session, ensuring all active tickets are stopped first
   * @param {string} teamId - Team ID
   * @param {string} activeTicketId - Active ticket ID if any
   * @param {Function} onSuccess - Success callback
   * @param {Function} onError - Error callback
   */
  stopSessionSafely(teamId, activeTicketId, onSuccess, onError) {
    if (activeTicketId) {
      const activeTicket = Tickets.findOne(activeTicketId);
      if (activeTicket && activeTicket.startTimestamp) {
        // Stop the active ticket first
        this.stopActiveTicket(
          activeTicketId, 
          teamId,
          () => {
            // Now stop the session
            Meteor.call('clockEventStop', teamId, (err) => {
              if (err) {
                onError(err);
              } else {
                onSuccess();
              }
            });
          },
          onError
        );
        return;
      }
    }
    
    // No active ticket, just stop the session
    Meteor.call('clockEventStop', teamId, (err) => {
      if (err) {
        onError(err);
      } else {
        onSuccess();
      }
    });
  }
};

Template.tickets.onCreated(function () {
  this.showCreateTicketForm = new ReactiveVar(false);
  this.selectedTeamId = new ReactiveVar(null);
  // Restore last active ticket if it is still running
  this.activeTicketId = new ReactiveVar(null);
  this.clockedIn = new ReactiveVar(false);

  this.autorun(() => {
    // If no team is selected, default to the first team
    const teamIds = Teams.find({}).map(t => t._id);

    let teamId = this.selectedTeamId.get();
    if (!teamId) {
      this.selectedTeamId.set(teamIds[0]);
      teamId = this.selectedTeamId.get();
    }

    this.subscribe('teamTickets', teamIds);

    if (teamId) {
      // Restore active ticket if any ticket for this team has a startTimestamp
      const runningTicket = Tickets.findOne({ teamId, startTimestamp: { $exists: true } });
      if (runningTicket) {
        this.activeTicketId.set(runningTicket._id);
      } else {
        this.activeTicketId.set(null);
      }
    }
  });
});

Template.tickets.onDestroyed(function() {
  // No cleanup needed anymore since we're using a global reactive timer
});

Template.tickets.helpers({
  userTeams: getUserTeams,
  isSelectedTeam(teamId) {
    // Return 'selected' if this team is the selected one
    return Template.instance().selectedTeamId && Template.instance().selectedTeamId.get() === teamId ? 'selected' : '';
  },
  showCreateTicketForm() {
    return Template.instance().showCreateTicketForm.get();
  },
  tickets() {
    const teamId = Template.instance().selectedTeamId.get();
    if (!teamId) return [];
    const activeTicketId = Template.instance().activeTicketId.get();
    const now = currentTime.get(); // Use reactive time source
    return Tickets.find({ teamId }).fetch().map(ticket => {
      // If this ticket is active and has a startTimestamp, show live time
      if (ticket._id === activeTicketId && ticket.startTimestamp) {
        const elapsed = Math.max(0, Math.floor((now - ticket.startTimestamp) / 1000));
        return {
          ...ticket,
          displayTime: (ticket.accumulatedTime || 0) + elapsed
        };
      } else {
        return {
          ...ticket,
          displayTime: ticket.accumulatedTime || 0
        };
      }
    });
  },
  isActive(ticketId) {
    return Template.instance().activeTicketId.get() === ticketId;
  },
  formatTime,  // Using imported utility
  githubLink(github) {
    if (!github) return '';
    if (github.startsWith('http')) return github;
    return `https://github.com/${github}`;
  },
  isClockedIn() {
    return Template.instance().clockedIn.get();
  },
  clockedIn() {
    return Template.instance().clockedIn.get();
  },
  selectedTeamId() {
    return Template.instance().selectedTeamId.get();
  },
  isClockedInForTeam(teamId) {
    const clockEvent = ClockEvents.findOne({ userId: Meteor.userId(), teamId, endTime: null });
    return !!clockEvent;
  },
  currentClockEventTime() {
    const teamId = Template.instance().selectedTeamId.get();
    const clockEvent = ClockEvents.findOne({ userId: Meteor.userId(), teamId, endTime: null });
    if (!clockEvent) return 0;
    return calculateTotalTime(clockEvent);  // Using imported utility
  },
      // Helper for button classes
   getButtonClasses(ticketId) {
     const isActive = Template.instance().activeTicketId.get() === ticketId;
     const teamId = Template.instance().selectedTeamId.get();
     const hasActiveSession = teamId ? TicketUtils.hasActiveSession(teamId) : false;

     if (isActive) return 'btn btn-outline btn-neutral';
     if (hasActiveSession) return 'btn btn-outline btn-neutral';
     return 'btn btn-disabled';
   },

   // Helper for button tooltip
   getButtonTooltip(ticketId) {
     const isActive = Template.instance().activeTicketId.get() === ticketId;
     const teamId = Template.instance().selectedTeamId.get();
     const hasActiveSession = teamId ? TicketUtils.hasActiveSession(teamId) : false;

     if (isActive) return 'Click to stop this activity';
     if (hasActiveSession) return 'Click to start this activity';
     return 'Start a session first to begin activities';
   },
});

// Rest of the events code remains unchanged
Template.tickets.events({
  'change #teamSelect'(e, t) {
    t.selectedTeamId.set(e.target.value);
  },
  'click #showCreateTicketForm'(e, t) {
    t.showCreateTicketForm.set(true);
  },
  'click #cancelCreateTicket'(e, t) {
    t.showCreateTicketForm.set(false);
  },
  'submit #createTicketForm'(e, t) {
    e.preventDefault();
    const teamId = t.selectedTeamId.get();
    const title = e.target.title.value.trim();
    const github = e.target.github.value.trim();
    const hours = parseInt(e.target.hours.value) || 0;
    const minutes = parseInt(e.target.minutes.value) || 0;
    const seconds = parseInt(e.target.seconds.value) || 0;
    const accumulatedTime = hours * 3600 + minutes * 60 + seconds;
         if (!title) {
       alert(USER_MESSAGES.TITLE_REQUIRED);
       return;
     }
    Meteor.call('createTicket', { teamId, title, github, accumulatedTime }, (err, ticketId) => {
      if (!err) {
        t.showCreateTicketForm.set(false);
        // Auto-start the ticket if there's time specified
        if (accumulatedTime > 0) {
          const now = Date.now();
          // Start the new timer
          t.activeTicketId.set(ticketId);
          Meteor.call('updateTicketStart', ticketId, now, (err) => {
            if (err) {
              alert(ERROR_MESSAGES.START_TIMER_FAILED + err.reason);
              return;
            }
            // If user is clocked in, add the ticket timing entry to the clock event
            const clockEvent = ClockEvents.findOne({ userId: Meteor.userId(), teamId, endTime: null });
            if (clockEvent) {
              Meteor.call('clockEventAddTicket', clockEvent._id, ticketId, now, (err) => {
                if (err) {
                  alert(ERROR_MESSAGES.ADD_TICKET_FAILED + err.reason);
                }
              });
            }
          });
        }
             } else {
         alert(ERROR_MESSAGES.CREATE_TICKET_FAILED + err.reason);
       }
    });
  },
  'click .activate-ticket'(e, t) {
    const ticketId = e.currentTarget.dataset.id;
    const isActive = t.activeTicketId.get() === ticketId;
    const ticket = Tickets.findOne(ticketId);
    const teamId = t.selectedTeamId.get();

    // Check if user is clocked in for this team
    const clockEvent = ClockEvents.findOne({ userId: Meteor.userId(), teamId, endTime: null });
    if (!isActive) {
      // Check if session is active before allowing activity start
      if (!clockEvent) {
        alert(USER_MESSAGES.START_SESSION_FIRST);
        return;
      }
      // Stop any currently active ticket first
      const currentActiveTicketId = t.activeTicketId.get();
      if (currentActiveTicketId) {
        const currentTicket = Tickets.findOne(currentActiveTicketId);
        if (currentTicket && currentTicket.startTimestamp) {
          const now = Date.now();
          // Stop the current ticket
          Meteor.call('updateTicketStart', ticketId, now, (err, result) => {
            if (err) {
              alert(ERROR_MESSAGES.STOP_CURRENT_TIMER_FAILED + err.reason);
              return;
            }
             // Check if server returned false (no active session)
            if (result === false) {
            alert(USER_MESSAGES.START_SESSION_FIRST);
            t.activeTicketId.set(null);
            return;
        }
          });

          // Stop the current ticket in the clock event if needed
          if (clockEvent) {
            Meteor.call('clockEventStopTicket', clockEvent._id, currentActiveTicketId, now, (err) => {
              if (err) {
                alert(ERROR_MESSAGES.STOP_TICKET_CLOCK_EVENT_FAILED + err.reason);
                return;
              }
            });
          }
        }
      }

      // Start the new timer
      t.activeTicketId.set(ticketId);
      const now = Date.now();
      Meteor.call('updateTicketStart', ticketId, now, (err) => {
        if (err) {
          alert(ERROR_MESSAGES.START_TIMER_FAILED + err.reason);
          return;
        }
      });

      // If user is clocked in, add the new ticket timing entry to the clock event
      // Note: Initial accumulated time is now handled server-side in clockEventAddTicket
      if (clockEvent) {
        Meteor.call('clockEventAddTicket', clockEvent._id, ticketId, now, (err) => {
          if (err) {
            alert(ERROR_MESSAGES.ADD_TICKET_FAILED + err.reason);
          }
        });
      }
    } else {
      // Stop the timer: calculate elapsed, add to accumulatedTime, clear startTimestamp
      if (ticket && ticket.startTimestamp) {
        const now = Date.now();
        Meteor.call('updateTicketStop', ticketId, now, (err) => {
          if (err) {
            alert(ERROR_MESSAGES.STOP_TIMER_FAILED + err.reason);
          }
        });

        // If user is clocked in, stop the ticket timing in the clock event
        if (clockEvent) {
          Meteor.call('clockEventStopTicket', clockEvent._id, ticketId, now, (err) => {
            if (err) {
              alert(ERROR_MESSAGES.STOP_TICKET_CLOCK_EVENT_FAILED + err.reason);
            }
          });
        }
      }
      t.activeTicketId.set(null);
    }
  },
  'click #clockInOut'(e, t) {
    const ticketId = t.activeTicketId.get();
    const clockedIn = t.clockedIn.get();
    if (!ticketId) {
      alert(USER_MESSAGES.SELECT_TICKET);
      return;
    }
    if (!clockedIn) {
      Meteor.call('clockIn', ticketId, (err) => {
        if (!err) t.clockedIn.set(true);
      });
    } else {
      Meteor.call('clockOut', ticketId, (err) => {
        if (!err) t.clockedIn.set(false);
      });
    }
  },
  'click #clockInBtn'(e, t) {
    const teamId = t.selectedTeamId.get();
    Meteor.call('clockEventStart', teamId, (err, clockEventId) => {
      if (err) {
        alert(ERROR_MESSAGES.CLOCK_IN_FAILED + err.reason);
      }
    });
  },
  'blur [name="title"]'(e, t) {
    const input = e.target.value.trim();
    if (input.startsWith('http://') || input.startsWith('https://')) {
      Meteor.call('extractUrlTitle', input, (err, result) => {
        if (!err && result.title) {
          document.querySelector('[name="github"]').value = input;
          e.target.value = result.title;
        }
      });
    }
  },

  'paste [name="title"]'(e, t) {
    setTimeout(() => {
      const input = e.target.value.trim();
      if (input.startsWith('http://') || input.startsWith('https://')) {
        Meteor.call('extractUrlTitle', input, (err, result) => {
          if (!err && result.title) {
            document.querySelector('[name="github"]').value = input;
            e.target.value = result.title;
          }
        });
      }
    }, 0);
  },

  'click #clockOutBtn'(e, t) {
    const teamId = t.selectedTeamId.get();
    
    // Check if there's an active ticket that needs to be stopped
    const activeTicketId = t.activeTicketId.get();
    if (activeTicketId) {
      const activeTicket = Tickets.findOne(activeTicketId);
      if (activeTicket && activeTicket.startTimestamp) {
        // Stop the active ticket first
        const now = Date.now();
        Meteor.call('updateTicketStop', activeTicketId, now, (err) => {
          if (err) {
            alert(ERROR_MESSAGES.STOP_TICKET_FAILED + err.reason);
            return;
          }
          
          // Also stop the ticket in the clock event
          const clockEvent = ClockEvents.findOne({ userId: Meteor.userId(), teamId, endTime: null });
          if (clockEvent) {
            Meteor.call('clockEventStopTicket', clockEvent._id, activeTicketId, now, (err) => {
              if (err) {
                console.error('Failed to stop ticket in clock event:', err);
              }
            });
          }
          
          // Now stop the session
          Meteor.call('clockEventStop', teamId, (err) => {
            if (err) {
              alert(ERROR_MESSAGES.CLOCK_OUT_FAILED + err.reason);
            } else {
              t.activeTicketId.set(null);
            }
          });
        });
        return;
      }
    }
    
    // No active ticket, just stop the session
    Meteor.call('clockEventStop', teamId, (err) => {
      if (err) {
        alert(ERROR_MESSAGES.CLOCK_OUT_FAILED + err.reason);
      } else {
        t.activeTicketId.set(null);
      }
    });
  },
});