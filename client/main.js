import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Teams, Tickets, ClockEvents } from '../collections.js';

// Import HTML template first
import './main.html';

// Import authentication components after HTML is loaded
import './components/auth/AuthPage.js';
import './components/layout/MainLayout.js';

// Import team components
import './components/teams/TeamsPage.js';

// Import ticket components
import './components/tickets/TicketsPage.js';

// Import home components
import './components/home/HomePage.js';

// Import currentTime from MainLayout
import { currentTime } from './components/layout/MainLayout.js';