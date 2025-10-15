/**
 * Ozwell iframe-sync Integration for TimeHarbor
 * Syncs ticket form state with the chat widget in real-time
 */

class OzwellStateSync {
  constructor() {
    this.broker = null;
    this.formFields = {
      title: null,
      description: null,
      hours: null,
      minutes: null,
      seconds: null,
      team: null
    };
    this.init();
  }

  init() {
    // Wait for user to be logged in and form to be available
    const checkFormReady = setInterval(() => {
      if (typeof Meteor !== 'undefined' && Meteor.userId()) {
        // Try to find form fields
        this.formFields.title = document.querySelector('input[name="title"]');
        this.formFields.description = document.querySelector('textarea[name="github"]');
        this.formFields.hours = document.querySelector('input[name="hours"]');
        this.formFields.minutes = document.querySelector('input[name="minutes"]');
        this.formFields.seconds = document.querySelector('input[name="seconds"]');
        this.formFields.team = document.querySelector('select[name="team"]');

        // Check if at least title field exists (main indicator form is loaded)
        if (this.formFields.title) {
          clearInterval(checkFormReady);
          this.initializeBroker();
          this.attachListeners();
          console.log('[iframe-sync] State sync initialized');
        }
      }
    }, 500);
  }

  initializeBroker() {
    // Initialize broker with current form state
    this.broker = new IframeSyncBroker({
      ticketForm: this.getCurrentFormState()
    });

    console.log('[iframe-sync] Broker initialized with state:', this.getCurrentFormState());
  }

  getCurrentFormState() {
    return {
      title: this.formFields.title?.value || '',
      description: this.formFields.description?.value || '',
      hours: this.formFields.hours?.value || '0',
      minutes: this.formFields.minutes?.value || '0',
      seconds: this.formFields.seconds?.value || '0',
      team: this.formFields.team?.value || '',
      teamName: this.formFields.team?.selectedOptions[0]?.text || ''
    };
  }

  updateState(field, value) {
    if (!this.broker) {
      console.warn('[iframe-sync] Broker not initialized yet');
      return;
    }

    const update = {
      ticketForm: {
        [field]: value
      }
    };

    // For team changes, also include the team name
    if (field === 'team') {
      update.ticketForm.teamName = this.formFields.team?.selectedOptions[0]?.text || '';
    }

    this.broker.stateChange(update);
    console.log(`[iframe-sync] State updated: ${field} = ${value}`);
  }

  attachListeners() {
    // Title field
    if (this.formFields.title) {
      this.formFields.title.addEventListener('input', (e) => {
        this.updateState('title', e.target.value);
      });
    }

    // Description field
    if (this.formFields.description) {
      this.formFields.description.addEventListener('input', (e) => {
        this.updateState('description', e.target.value);
      });
    }

    // Hours field
    if (this.formFields.hours) {
      this.formFields.hours.addEventListener('input', (e) => {
        this.updateState('hours', e.target.value);
      });
    }

    // Minutes field
    if (this.formFields.minutes) {
      this.formFields.minutes.addEventListener('input', (e) => {
        this.updateState('minutes', e.target.value);
      });
    }

    // Seconds field
    if (this.formFields.seconds) {
      this.formFields.seconds.addEventListener('input', (e) => {
        this.updateState('seconds', e.target.value);
      });
    }

    // Team selection
    if (this.formFields.team) {
      this.formFields.team.addEventListener('change', (e) => {
        this.updateState('team', e.target.value);
      });
    }

    console.log('[iframe-sync] Event listeners attached to form fields');
  }

  // Public method to manually trigger state sync (useful after tool execution)
  syncCurrentState() {
    if (!this.broker) return;

    this.broker.stateChange({
      ticketForm: this.getCurrentFormState()
    });

    console.log('[iframe-sync] Manual state sync triggered');
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.ozwellStateSync = new OzwellStateSync();
  });
} else {
  window.ozwellStateSync = new OzwellStateSync();
}
