# Ghost Taxi: Graveyard Shift

## High concept

You drive the only taxi in a cursed town. By day, you carry living passengers and earn cash. By night, the taxi reveals its true nature: you ferry stranded souls while monsters hunt them through the streets.

Every soul rescued becomes bound to the haunted taxi. Bound souls grant useful powers, but surviving nights also places permanent hexes on the car. The taxi grows stronger, stranger, and harder to control as a run continues.

## Design pillars

1. **The taxi is both ally and threat.** Its supernatural power saves the player, but possession makes its handling less predictable.
2. **Day prepares; night tests.** Day shifts are readable routing and economy. Night shifts are short, dangerous supernatural chases.
3. **Passengers change the drive.** Living passengers create constraints. Soul passengers provide powers.
4. **Every curse has an upside.** Hexes complicate driving while enabling stronger play styles. They should create decisions, not merely punish failure.
5. **Readable arcade action.** The game must remain understandable on a phone at speed: strong silhouettes, limited effects, large controls, short text.

## Core loop

### Day shift: the living

- Pick up passengers from visible taxi stands.
- Deliver them before the shift ends.
- Passenger traits alter the trip: impatient, fragile cargo, multiple stops, generous tipper, or tourist.
- Earn cash for repairs and mundane upgrades.
- Choose one bound soul to equip for the coming night.
- At sunset, the town changes without loading a different map: traffic thins, fog arrives, shortcuts open, and supernatural threats appear.

### Night shift: the dead

- Find stranded souls before their spirit meter fades.
- Carry one soul at a time to its destination: cemetery, old home, hospital, churchyard, river, or town limits.
- Monsters track the passenger and pursue the taxi.
- Use the taxi's equipped soul power and innate haunted abilities to escape.
- Each successful delivery binds that soul to the taxi and adds it to the player's power roster.
- Survive until dawn to bank rewards and advance to the next level.

### Between levels

- Repair the taxi or buy a practical upgrade.
- Equip one primary soul and, later, one passive soul.
- Resolve the night's hex: cleanse it at a cost or bind it permanently to gain its benefit as well as its drawback.
- Begin a harder day/night cycle.

## The HAUNT meter

HAUNT replaces the original high meter and is the central risk/reward system.

- It rises while carrying souls, using powers, passing haunted landmarks, and staying out after midnight.
- Higher HAUNT increases score, acceleration, and power recharge.
- Higher HAUNT also causes steering interference, false road signs, phantom obstacles, and more aggressive monsters.
- The player can reduce HAUNT at sanctuaries during the day, but doing so sacrifices score multiplier and power output.
- At maximum HAUNT, the taxi becomes fully possessed: extremely powerful, increasingly difficult to steer, and visible to every monster.

## Soul powers

| Soul | Active power | Personality cost |
| --- | --- | --- |
| Racer | Auto-drift through the next turn | Pulls toward shortcuts without permission |
| Mechanic | Repairs a portion of taxi integrity | Temporarily lowers top speed |
| Guardian | Phases through one collision | Greatly increases HAUNT |
| Scout | Reveals the safest route and nearby monsters | Adds false pings after the effect ends |
| Poltergeist | Repels nearby monsters and monster cars | Knocks loose street objects toward everyone |
| Bellhop | Instantly secures the current passenger | Reduces the delivery tip |
| Runaway | Huge speed burst | Disables braking during the burst |
| Medium | Reveals hidden soul pickups | Makes ordinary traffic partially transparent |

Only one active soul begins equipped. Later progression can unlock a passive passenger slot.

## Hexes

Hexes should be paired modifiers: an inconvenience with an exploitable strength.

| Hex | Drawback | Power |
| --- | --- | --- |
| Phantom Steering | The wheel occasionally tugs toward haunted roads | Perfect drift builds a temporary shield |
| Hungry Engine | Boost consumes taxi integrity | Destroying a monster restores integrity |
| Grave Tires | Wet roads become more slippery | The taxi can cross grave soil and blocked alleys |
| Backseat Whispers | Destination markers periodically vanish | The whispers reveal hidden shortcuts |
| Dead Headlights | Visibility shrinks as HAUNT rises | Headlight flashes stun nearby monsters |
| Fare Collector | Missed fares increase monster aggression | Consecutive deliveries multiply tips and score |

### Gaining hexes

- Surviving a night offers a voluntary hex with a strong upside.
- Being caught does not immediately end the run. The taxi takes heavy damage, loses the passenger, and receives a forced hex.
- A wreck or a second capture while critically damaged ends the run.
- This makes failure change the run instead of only erasing progress.

## Monsters

- **Ghouls:** common runners that swarm and try to slow the taxi.
- **Monster cars:** fast road pursuers that ram and box the player in.
- **Werewolves:** leap across blocks and punish predictable routes.
- **The Undertaker:** a slow, persistent boss vehicle that cannot be permanently destroyed.
- **Mimics:** appear as passengers or destination markers until approached.

No guns or gore are required. Threats attack through pursuit, ramming, obstruction, possession, and theft of the carried soul.

## Progression

- One level equals one complete day and night.
- Day passengers fund repairs and practical upgrades.
- Night passengers unlock supernatural powers.
- Bound hexes define the run's build.
- Districts unlock across levels: Downtown, Suburbia, Docks, Cemetery Ward, and Old Casino.
- Difficulty escalates through longer routes, stronger passenger conditions, denser monster combinations, and earlier nightfall.

## Failure and victory

- A captured soul is lost, the taxi is damaged, and a hex is applied.
- The run ends when taxi integrity reaches zero or the player is captured while critically damaged.
- A full run ends after the player carries a final soul beyond the town limits before sunrise.
- Score combines fares, rescued souls, remaining taxi integrity, HAUNT risk, and bound-hex multiplier.

## iPhone presentation

- Landscape-only, designed around modern wide iPhone ratios.
- Steering control at lower left; power and brake/boost controls at lower right.
- All controls respect device safe areas.
- HAUNT and integrity stay on opposite screen edges.
- Mission, passenger condition, and clock share one compact top-center band.
- Haptics communicate collision, possession, a fading soul, power readiness, and sunrise.
- Menus use native-feeling in-game panels; no browser prompts or external-looking dialogs.

## Scope for the first playable conversion

The first milestone proves the loop without rebuilding every system:

1. Rename the game and core meter.
2. Convert the existing vehicle into a taxi visually.
3. Replace the two jobs with living-passenger and soul-passenger taxi routes.
4. Turn the existing pursuit crew into non-weapon supernatural pursuers.
5. Add one soul power: Racer auto-drift/handling assist.
6. Add one paired hex: Phantom Steering.
7. Preserve the existing maps, traffic, score, touch controls, and day/night clock.

