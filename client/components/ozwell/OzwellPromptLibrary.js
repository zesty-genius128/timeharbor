import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';

// Global reactive variables for prompt library
const promptLibraryState = {
  availablePrompts: new ReactiveVar([]),
  promptResult: new ReactiveVar(''),
  showPromptResult: new ReactiveVar(false),
  isLoading: new ReactiveVar(false)
};

/**
 * Prompt Library Helper Functions
 */
const PromptLibraryHelper = {
  // Initialize prompt library
  async init() {
    try {
      const prompts = await Meteor.callAsync('getAvailablePrompts');
      promptLibraryState.availablePrompts.set(prompts);
    } catch (error) {
      console.error('Failed to load prompt library:', error);
    }
  },

  // Execute a prompt
  async executePrompt(promptType, teamId, additionalContext = {}) {
    try {
      promptLibraryState.isLoading.set(true);
      
      let promptData;
      
      switch (promptType) {
        case 'time_entry':
          promptData = await Meteor.callAsync('getTimeEntryPrompt', teamId);
          break;
          
        case 'daily_summary':
          promptData = await Meteor.callAsync('getDailySummaryPrompt', teamId);
          break;
          
        case 'cross_link':
          promptData = await Meteor.callAsync('getCrossLinkPrompt', teamId, additionalContext.currentText || '');
          break;
          
        case 'activity_title':
          promptData = await Meteor.callAsync('getActivityTitlePrompt', teamId, additionalContext.currentTitle || '', additionalContext.reference || '');
          break;
          
        default:
          throw new Error('Unknown prompt type');
      }

      // Display the generated prompt
      promptLibraryState.promptResult.set(promptData.template);
      promptLibraryState.showPromptResult.set(true);

      // Optionally, you could also send this directly to Ozwell
      // await this.sendToOzwell(promptData);

    } catch (error) {
      console.error('Failed to execute prompt:', error);
      alert('Failed to generate prompt. Please try again.');
    } finally {
      promptLibraryState.isLoading.set(false);
    }
  },

  // Send prompt directly to Ozwell (future enhancement)
  async sendToOzwell(promptData) {
    // This would integrate with the OzwellHelper to open Ozwell
    // with the pre-populated prompt
    const { OzwellHelper } = await import('./OzwellModal.js');
    
    await OzwellHelper.open(
      '#promptResultText',
      'prompt_library',
      {
        promptType: promptData.promptType,
        context: promptData.context,
        initialPrompt: promptData.template
      }
    );
  },

  // Clear prompt result
  clearResult() {
    promptLibraryState.promptResult.set('');
    promptLibraryState.showPromptResult.set(false);
  },

  // Copy result to clipboard
  copyResult() {
    const textarea = document.getElementById('promptResultText');
    if (textarea) {
      textarea.select();
      document.execCommand('copy');
      
      // Show success feedback
      const btn = document.getElementById('copyPromptResult');
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('btn-success');
      
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('btn-success');
      }, 2000);
    }
  }
};

/**
 * Template Helpers
 */
Template.ozwellPromptLibrary.helpers({
  availablePrompts() {
    return promptLibraryState.availablePrompts.get();
  },
  
  promptResult() {
    return promptLibraryState.promptResult.get();
  },
  
  showPromptResult() {
    return promptLibraryState.showPromptResult.get();
  },
  
  currentTeamId() {
    // This should be passed from the parent template
    return Template.instance().data?.teamId || null;
  },
  
  isLoading() {
    return promptLibraryState.isLoading.get();
  }
});

/**
 * Template Events
 */
Template.ozwellPromptLibrary.events({
  'click .ozwell-prompt-btn'(event) {
    event.preventDefault();
    
    const button = event.currentTarget;
    const promptType = button.getAttribute('data-prompt-type');
    const teamId = button.getAttribute('data-team-id');
    
    if (!teamId) {
      alert('Please select a project first');
      return;
    }
    
    // Get additional context if needed
    const additionalContext = {};
    
    // For certain prompts, we might need current form data
    if (promptType === 'activity_title') {
      const titleInput = document.querySelector('input[name="title"]');
      const githubInput = document.querySelector('input[name="github"]');
      
      additionalContext.currentTitle = titleInput ? titleInput.value : '';
      additionalContext.reference = githubInput ? githubInput.value : '';
    }
    
    PromptLibraryHelper.executePrompt(promptType, teamId, additionalContext);
  },
  
  'click #copyPromptResult'() {
    PromptLibraryHelper.copyResult();
  },
  
  'click #clearPromptResult'() {
    PromptLibraryHelper.clearResult();
  }
});

/**
 * Template Lifecycle
 */
Template.ozwellPromptLibrary.onCreated(function() {
  // Initialize prompt library when template is created
  PromptLibraryHelper.init();
});

// Export for use in other components
export { PromptLibraryHelper, promptLibraryState };