// Single source of truth for the version + release notes.
// Loaded by both the game (game.js) and the standalone updates page (news.html).
const CHANGELOG = [
  { v: '1.7', title: 'Valet Chaos', items: [
    'Limos now prowl the casino ring and double park at the valet, backing up everyone behind them',
  ] },
  { v: '1.6', title: 'Roadworks & Rounds', items: [
    'Downtown closes a random street for construction every shift. Mind the barricades and find another way around',
    'A school bus now does its rounds through Suburbia',
  ] },
  { v: '1.5', title: 'Uptown, High Roller', items: [
    'Uptown is the high roller district. Jobs pay 60% more but the traffic is thick and the mafia hits harder',
    'A neon CASINO landmark with a valet loop and limos parked out front',
    'One way avenues. Follow the painted arrows or fight the flow',
  ] },
  { v: '1.4', title: 'Easy / Hard + Shift Stakes', items: [
    'Easy / Hard difficulty picker on the city select',
    'Pizza runs are a race against the clock. Deliver in time or it\'s free',
    'Ambulance patients now have health. Critical ones are a race against the clock',
    'You only get jailed after a few kills (three on Easy, one on Hard)',
  ] },
  { v: '1.3', title: 'Streets Alive', items: [
    'Only fast hits are fatal. Clip someone in the ambulance and rush them to the hospital to save them',
    'Pick your city from a map picker before each run',
    'Tap friendly pause menu with an End Game option',
    'City landmarks: Suburbia park + supermarket lot, Uptown roundabout',
    'Docks: beach, boardwalk & delivery piers you drive onto',
    'Downtown rush hour with heavy traffic and a highway ramp',
    'Two way traffic. Cars keep their lane and don\'t pile up',
  ] },
  { v: '1.2', title: 'Driving Polish', items: [
    'Pedestrians dodge out of your way',
    'Hold Shift to sprint',
    'Speedometer added',
    'Sleep now works (energy drains each shift)',
  ] },
  { v: '1.1', title: 'Heat & Maps', items: [
    'Shake the mafia by breaking away from the crew',
    '4 randomized city maps',
  ] },
  { v: '1.0', title: 'Launch', items: [
    'Pizza & ambulance shifts, get high, dodge the loan shark',
    'Desktop + mobile touch controls, day/night cycle',
  ] },
];
const VERSION = CHANGELOG[0].v;
