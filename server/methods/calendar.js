import { Meteor } from 'meteor/meteor';

Meteor.methods({
  /**
   * Get user's Google Calendar events
   * Simple method that returns meeting name, date, time, duration
   */
  async 'getMyCalendarEvents'() {
    // Must be logged in
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in');
    }

    const user = await Meteor.userAsync();
    
    console.log('User found:', !!user);
    console.log('User has services:', !!(user && user.services));
    console.log('User has Google service:', !!(user && user.services && user.services.google));
    
    // Check if user has Google account with calendar access
    if (!user || !user.services || !user.services.google || !user.services.google.accessToken) {
      console.log('Calendar access check failed:');
      console.log('- User exists:', !!user);
      console.log('- Has services:', !!(user && user.services));
      console.log('- Services keys:', user && user.services ? Object.keys(user.services) : 'none');
      console.log('- Has Google:', !!(user && user.services && user.services.google));
      console.log('- Has access token:', !!(user && user.services && user.services.google && user.services.google.accessToken));
      throw new Meteor.Error('no-calendar-access', 'No Google Calendar access. Please login with Google.');
    }

    const accessToken = user.services.google.accessToken;
    console.log('Google access token obtained, length:', accessToken.length);
    console.log('Google service scope:', user.services.google.scope);

    try {
      // Get calendar events from past 7 days to next 30 days
      const now = new Date();
      const pastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      console.log('Fetching calendar events for user:', this.userId);

      // Call Google Calendar API using fetch (modern approach)
      const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
      url.searchParams.set('timeMin', pastWeek.toISOString());
      url.searchParams.set('timeMax', nextMonth.toISOString());
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('maxResults', '20');

      console.log('Making Calendar API request to:', url.toString());
      console.log('Access token length:', accessToken.length);
      
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      console.log('Calendar API response status:', response.status);
      console.log('Calendar API response status text:', response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.log('Calendar API error response:', errorText);
        throw new Meteor.Error('api-error', `Failed to fetch calendar events: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json();
      const events = responseData.items || [];
      console.log('Found', events.length, 'calendar events');

      // Process events to get only what we need
      const meetings = events
        .filter(event => event.start && event.start.dateTime) // Only timed events
        .map(event => {
          const startTime = new Date(event.start.dateTime);
          const endTime = new Date(event.end.dateTime);
          const duration = Math.round((endTime - startTime) / 60000); // minutes

          return {
            id: event.id,
            title: event.summary || 'Untitled Meeting',
            date: startTime.toLocaleDateString(),
            time: startTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
            endTime: endTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
            duration: duration
          };
        })
        .sort((a, b) => new Date(a.date + ' ' + a.time) - new Date(b.date + ' ' + b.time));

      return {
        success: true,
        meetings: meetings,
        count: meetings.length
      };

    } catch (error) {
      console.error('Calendar fetch error:', error);
      
      if (error.message && error.message.includes('401')) {
        throw new Meteor.Error('auth-expired', 'Calendar access expired. Please login again.');
      }
      
      throw new Meteor.Error('fetch-failed', 'Could not fetch calendar events');
    }
  }
});
