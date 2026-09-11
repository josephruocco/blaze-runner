// Single source of truth for the version + release notes.
// Loaded by both the game (game.js) and the standalone updates page (news.html).
const CHANGELOG = [
  { v: '0.1', title: 'The First Haunting', items: [
    'Drive living taxi fares by day and stranded souls by night',
    'Monster cars hunt the taxi after dark',
    'Rescue the Racer Soul to unlock supernatural handling',
    'Getting caught binds the Phantom Steering hex to the car',
  ] },
];
const VERSION = CHANGELOG[0].v;
