# Cubetris - Future Features & Enhancements

**Version**: 2.0 Roadmap
**Status**: Design Document
**Last Updated**: 2025-11-17

---

## Table of Contents

1. [Core Gameplay Enhancements](#core-gameplay-enhancements)
2. [Special Cube Types](#special-cube-types)
3. [Power-Ups & Abilities](#power-ups--abilities)
4. [Game Modes](#game-modes)
5. [Progression Systems](#progression-systems)
6. [Social & Competitive Features](#social--competitive-features)
7. [Visual & Audio Polish](#visual--audio-polish)
8. [Advanced Mechanics](#advanced-mechanics)
9. [Accessibility Features](#accessibility-features)
10. [Monetization & Live Ops](#monetization--live-ops)

---

## Core Gameplay Enhancements

### 1. Multi-Cube Tetrominos

**Concept**: Instead of single cubes, spawn classic Tetris shapes (I, O, T, L, J, S, Z pieces)

**Design**:
- Player rotates pieces in mid-air before launching
- Pieces maintain their shape during launch
- Matching considers individual cube colors within the piece
- Adds strategic depth: "Do I launch now or wait for better positioning?"

**Implementation Priority**: HIGH
**Complexity**: Medium
**Impact**: Major gameplay evolution

```csharp
public enum TetrominoType
{
    Single,      // Current gameplay
    I_Piece,     // 4 in a row
    O_Piece,     // 2x2 square
    T_Piece,     // T shape
    L_Piece,     // L shape
    // etc.
}
```

### 2. Gravity Mechanics

**Concept**: When cubes explode, cubes above fall down naturally

**Design**:
- Remove matched cubes
- Trigger physics on cubes above (remove kinematic)
- Let them fall and settle
- Check for chain reactions
- Creates cascading combos like Candy Crush

**Implementation Priority**: HIGH
**Complexity**: Medium
**Impact**: Chain reactions become more satisfying

**Technical Notes**:
- Need to detect "floating" cubes after explosion
- Apply gravity pulse to unsupported cubes
- Wait for settling before next match check

### 3. Combo System

**Concept**: Reward rapid successive matches with multipliers

**Design**:
- **2x Combo**: Second match within 3 seconds
- **3x Combo**: Third match within 3 seconds
- **5x Combo**: Five matches within 3 seconds
- Visual: Combo counter on screen with animated text
- Audio: Increasing pitch for each combo level

**Scoring Formula**:
```
Score = BasePoints × ClusterSize × ComboMultiplier × LevelMultiplier
```

**Implementation Priority**: HIGH
**Complexity**: Low
**Impact**: Makes match timing strategic

### 4. Time Attack Mode

**Concept**: Race against the clock instead of wall

**Design**:
- 2-minute rounds
- Score as many points as possible
- Wall doesn't move (or moves slowly)
- Spawn rate increases every 30 seconds
- Perfect for competitive leaderboards

**Implementation Priority**: MEDIUM
**Complexity**: Low
**Impact**: Alternative game mode for variety

---

## Special Cube Types

### 1. Bomb Cube (Black with fuse icon)

**Behavior**:
- When matched, explodes in 3x3 area
- Destroys all cubes in radius (any color)
- Creates massive voxel explosion
- Awards bonus points per cube destroyed

**Spawn**: 5% chance in levels 10+

### 2. Rainbow Cube (Multi-colored/prism effect)

**Behavior**:
- Matches with ANY color
- Wildcard for completing difficult matches
- Sparkles to indicate special status
- Explodes in rainbow particle effect

**Spawn**: 3% chance in levels 8+

### 3. Multiplier Cube (Gold/glowing)

**Behavior**:
- When included in match, doubles score for that match
- Can stack (2 multipliers = 4x, 3 multipliers = 8x)
- Rare and valuable

**Spawn**: 2% chance in levels 12+

### 4. Freeze Cube (Ice blue, frozen effect)

**Behavior**:
- When matched, temporarily stops wall movement (5 seconds)
- Gives player breathing room
- Ice particles on explosion

**Spawn**: 4% chance in levels 5+

### 5. Chain Cube (Linked appearance)

**Behavior**:
- When one chain cube explodes, ALL chain cubes of same color explode
- Can create massive chain reactions across the board
- High risk/reward: can clear board or waste positioning

**Spawn**: 3% chance in levels 15+

### 6. Heavy Cube (Metallic, dense)

**Behavior**:
- Cannot be destroyed by adjacent explosions
- Must be matched directly
- Creates obstacles for player
- Higher mass, stacks more stable

**Spawn**: 5% chance in levels 7+ (as challenge)

### 7. Ghost Cube (Transparent, ethereal)

**Behavior**:
- Phases through other cubes (no collision)
- Only stops at wall or floor
- Can create matches in hard-to-reach places
- Useful for clearing back areas

**Spawn**: 2% chance in levels 18+

---

## Power-Ups & Abilities

### Rechargeable Abilities (Cooldown-Based)

**1. Laser Blast**
- **Cooldown**: 30 seconds
- **Effect**: Destroys entire vertical column of cubes
- **Visual**: Red laser beam from top to bottom
- **Use Case**: Clear specific color column or remove blockage

**2. Color Swap**
- **Cooldown**: 20 seconds
- **Effect**: Change current cube to any color you want
- **Visual**: Color selection wheel appears
- **Use Case**: Strategic color choice for guaranteed match

**3. Time Slow**
- **Cooldown**: 45 seconds
- **Effect**: Slow time by 50% for 5 seconds
- **Visual**: Screen desaturates, motion trails
- **Use Case**: Plan complex moves or escape tight situations

**4. Magnet Pull**
- **Cooldown**: 25 seconds
- **Effect**: Pull wall backwards 2 units
- **Visual**: Electromagnetic pulse effect
- **Use Case**: Buy time when wall getting too close

**5. Shuffle**
- **Cooldown**: 60 seconds
- **Effect**: Re-randomize all cube colors on board
- **Visual**: Swirling particle tornado
- **Use Case**: Last resort when no good moves available

### Passive Upgrades (Unlock & Equip)

**1. Extended Launch**: +20% launch force
**2. Quick Spawn**: -0.5s spawn delay
**3. Color Vision**: Next 3 cubes shown instead of 1
**4. Lucky Streak**: +10% special cube spawn chance
**5. Chain Master**: Combos last 5 seconds instead of 3
**6. Vortex**: Small gravity pull toward matches
**7. Precision**: Cubes snap to grid more accurately
**8. Fortified**: Cubes can't be destroyed by enemies

---

## Game Modes

### 1. **Classic Mode** (Current)
- Survive as long as possible
- Wall pushes forward
- Reach target score per level

### 2. **Time Attack**
- 2-minute rounds
- Maximize score
- No wall pressure
- Leaderboard focused

### 3. **Puzzle Mode**
- Pre-placed cube configurations
- Limited moves to clear all cubes
- 100 hand-crafted puzzles
- Brain-teaser focus
- Star rating (1-3 stars based on moves used)

**Example Puzzle**:
```
Goal: Clear all cubes in 5 moves
Board: Specific pattern with exact solution
Reward: Stars for efficiency
```

### 4. **Endless Mode**
- No levels, just survive
- Wall speed gradually increases forever
- Leaderboard: Longest survival time
- For hardcore players

### 5. **Zen Mode**
- No wall movement
- No time pressure
- Relaxing cube matching
- Satisfying explosions
- For stress relief

### 6. **Challenge Mode**
- Daily/Weekly challenges with unique constraints
- Examples:
  - "Only red and blue cubes"
  - "No power-ups allowed"
  - "Wall moves 2x speed"
  - "Match clusters of 5+ only"
- Rewards: Special currency, cosmetics

### 7. **Versus Mode** (Multiplayer)
- Split-screen or online
- Race to target score
- Send "garbage" cubes to opponent on big matches
- First to fill their board loses
- Similar to Tetris 99 competitive format

### 8. **Co-op Mode**
- 2 players, shared board
- Each controls different tracks (player 1: tracks 1-5, player 2: tracks 6-10)
- Work together to achieve score goal
- Requires coordination

### 9. **Boss Mode**
- Every 5 levels, face a "boss"
- Boss is a giant cube that spawns enemies
- Must destroy by matching cubes near it
- Boss has health bar
- Unique boss per world (5 worlds × 4 bosses = 20 bosses)

---

## Progression Systems

### 1. Player Leveling

**XP Sources**:
- Cubes matched: 1 XP
- Level completed: 50 XP
- Daily login: 10 XP
- Challenge completed: 100 XP

**Rewards per Level**:
- Every 5 levels: Unlock new power-up
- Every 10 levels: Unlock new cube type
- Every 25 levels: Unlock new game mode
- Max level: 100

### 2. Skill Tree

**Three Branches**:

**Precision Branch** (Blue):
- Improved grid snapping
- See future cube colors
- Slow-motion aiming
- Perfect shot bonus

**Power Branch** (Red):
- Stronger explosions
- More voxels per explosion
- Explosive radius increase
- Power-up cooldown reduction

**Strategy Branch** (Green):
- Extended combo timers
- Higher special cube chances
- Bonus score multipliers
- Tactical pause ability

**Implementation**:
- Earn skill points per player level
- Respec allowed (with soft currency cost)
- Visual tree with unlock paths

### 3. Mastery System

**Per-Level Mastery**:
- Bronze: Complete level
- Silver: Complete with 150% target score
- Gold: Complete with 200% target score
- Platinum: Complete with no power-ups used

**Rewards**:
- Cosmetic cube skins
- Title badges
- Profile borders
- Special voxel effects

### 4. Achievement System

**Examples**:
- "Chain Master": 10x combo
- "Cube Crusher": Destroy 10,000 cubes
- "Perfect Game": Complete level with 100% accuracy
- "Speed Runner": Complete level in under 2 minutes
- "No Deaths": Complete all 20 levels without game over
- "Rainbow Collector": Match 100 rainbow cubes

**Categories**:
- Gameplay achievements (50)
- Collection achievements (25)
- Social achievements (15)
- Secret achievements (10)

**Total**: 100 achievements

---

## Social & Competitive Features

### 1. Leaderboards

**Global Leaderboards**:
- Highest score (all-time)
- Highest score (weekly)
- Longest survival (endless mode)
- Fastest time (puzzle mode)

**Friends Leaderboards**:
- Compare with friends only
- Send challenges
- "Beat My Score" notifications

**Regional Leaderboards**:
- Country-based rankings
- Regional tournaments

### 2. Replays

**Features**:
- Auto-record best games
- Share replay code
- Watch other players' replays
- Learn from top players
- Save up to 10 replays

**Replay Controls**:
- Pause/play
- Speed up (2x, 4x, 8x)
- Camera angle change
- Show player inputs

### 3. Clans/Guilds

**Clan Features**:
- Create or join clan (max 50 members)
- Clan chat
- Clan challenges (shared goals)
- Clan leaderboard ranking
- Clan tournaments

**Clan Rewards**:
- Exclusive clan cosmetics
- Bonus XP for clan members
- Clan treasury for purchases

### 4. Tournaments

**Weekly Tournaments**:
- Entry fee (free or premium currency)
- Bracket-style or score-based
- Top 10% get rewards
- Grand prize for #1

**Season Championships**:
- 3-month seasons
- Qualify through weekly tournaments
- Championship final at season end
- Major prizes and recognition

### 5. Sharing & Streaming

**Share Features**:
- Screenshot match results
- Share to social media (Twitter, Discord, Instagram)
- Auto-generate highlight clips (best explosion, biggest combo)
- Streaming integration (Twitch/YouTube alerts on milestones)

---

## Visual & Audio Polish

### 1. Visual Effects Enhancements

**Explosions**:
- **Tier 1** (3 cubes): Standard voxel explosion
- **Tier 2** (5+ cubes): Add screen shake, particle ring
- **Tier 3** (7+ cubes): Add slow-motion, lens flare, impact wave
- **Tier 4** (10+ cubes): Nuclear-style explosion with shockwave

**Combos**:
- Combo text animation (growing, pulsing)
- Screen edge glow (intensifies with combo)
- Lightning between matched cubes
- Victory sparkles on high combos

**Special Cubes**:
- Idle animation (glow, rotate, pulse)
- Trail effect during launch
- Unique explosion per type
- Sound signature for each

### 2. Cube Skins/Themes

**Unlockable Themes**:
- **Classic**: Standard colored cubes (default)
- **Neon**: Glowing cyberpunk aesthetic
- **Gem**: Diamond/crystal appearance
- **Candy**: Colorful candy-coated look
- **Metal**: Industrial steel/chrome
- **Nature**: Wood, stone, leaves texture
- **Space**: Planets, stars, cosmic theme
- **Retro**: Low-poly 90s CG aesthetic
- **Hologram**: Sci-fi translucent
- **Pixel**: 8-bit pixelated cubes

**Implementation**:
- Unlock via achievements or shop
- Apply globally or per-game
- Mix and match colors with themes

### 3. Dynamic Camera

**Camera Modes**:
- **Standard**: Fixed isometric view (current)
- **Dynamic**: Smooth follow current cube
- **Cinematic**: Auto-zoom on explosions
- **First-Person**: Behind-cube view during launch
- **Top-Down**: Bird's eye view

**Camera Effects**:
- Screen shake on explosions (intensity based on size)
- Slow-motion on special moments
- Depth of field on menu/pause
- Motion blur during fast action

### 4. Audio Design

**Layered Music System**:
- Base melody (always playing)
- Add percussion layer on first match
- Add bass layer on combo
- Add synth layer on power-up use
- Increase tempo as wall approaches
- Dynamic mixing based on gameplay intensity

**Sound Effects**:
- Unique sound per cube color (musical notes)
- Matched cubes play chord (harmonize)
- Bigger matches = richer sound
- Satisfying "crunch" on cube landing
- Whoosh on cube launch
- Epic "boom" on big explosions

**Voice Acting** (Optional):
- Announcer for combos ("DOUBLE!", "TRIPLE!", "INCREDIBLE!")
- Encourage on close calls
- Congratulate on achievements
- Warn when wall approaching

### 5. Particle System Upgrades

**Advanced Voxel Physics**:
- Voxels bounce off surfaces
- Voxels interact with wind force
- Voxels emit light (glow)
- Voxels leave trails

**Environmental Particles**:
- Floating dust in play area
- Sparkles on successful matches
- Energy waves from wall
- Cube aura based on next color

---

## Advanced Mechanics

### 1. Physics Modifiers

**Environmental Effects** (Per Level):
- **Low Gravity**: Cubes float more, harder to stack
- **High Gravity**: Cubes fall fast, easier stacking
- **Wind**: Horizontal force pushes cubes left/right
- **Magnetism**: Cubes attract to same color
- **Bouncy**: Cubes bounce on impact (chaotic)

### 2. Multi-Tier Stacking

**Vertical Layers**:
- Current: Single horizontal layer
- Enhanced: 3D stacking (up to 5 layers high)
- Matching considers 3D neighbors (front, back, left, right, up, down)
- Visualization challenge (camera rotation needed)
- Advanced gameplay depth

### 3. Track Merging/Splitting

**Dynamic Tracks**:
- Some levels have tracks that merge/split
- Forces strategic positioning
- Adds complexity to aiming
- Visual: Tracks animate narrowing/widening

### 4. Conveyor Tracks

**Moving Tracks**:
- Tracks slowly move left or right
- Player must compensate during aiming
- Creates moving target challenge
- Different speeds per level

### 5. Portal Mechanics

**Teleportation**:
- Some tracks have portals
- Cube enters portal, exits at different track
- Strategic repositioning
- Visual: Swirling vortex effect

### 6. Destructible Wall

**Wall Health System**:
- Wall has HP (displayed)
- Big matches damage wall
- Push wall back by damaging it
- Boss fights use this mechanic
- Alternative win condition: Destroy wall

### 7. Cube Crafting

**Combine System**:
- Hold 2 cubes before launching
- Combine them into special cube
- Recipes: Red + Blue = Purple (wildcard)
- Yellow + Red = Orange (bomb)
- Strategic resource management

---

## Accessibility Features

### 1. Colorblind Modes

**Options**:
- Deuteranopia (red-green)
- Protanopia (red-green)
- Tritanopia (blue-yellow)
- Monochrome (full colorblind)

**Implementation**:
- Add symbols/patterns to cubes (not just color)
- High contrast mode
- Configurable color palette

### 2. Difficulty Options

**Adjustable Parameters**:
- Wall speed multiplier (50% - 200%)
- Spawn rate (slow, normal, fast)
- Match size requirement (2, 3, 4, 5 cubes minimum)
- Power-up availability (off, normal, unlimited)
- Aim assist (grid prediction overlay)

### 3. Control Options

**Input Methods**:
- Keyboard (current)
- Mouse (click tracks, click launch button)
- Gamepad (thumbstick + buttons)
- Touch (mobile - swipe to move, tap to launch)
- Accessibility controllers

**Remapping**:
- Fully customizable key bindings
- Multiple control schemes
- Save presets

### 4. Visual Assists

**Options**:
- Larger UI text
- High contrast mode
- Reduced motion (fewer particles)
- Slow-motion toggle
- Aim guide line (trajectory prediction)
- Grid overlay (always visible)

### 5. Audio Assists

**Options**:
- Visual sound indicators (subtitles for audio cues)
- Haptic feedback (controller rumble)
- Screen flash on important events
- Text-to-speech for menus

---

## Monetization & Live Ops

### 1. Progression Currency

**Soft Currency (Cubes)**:
- Earned through gameplay
- Used for power-ups, skill resets, continues
- Generated generously

**Hard Currency (Gems)**:
- Purchased with real money OR earned slowly
- Used for cosmetics, special items
- Optional, never pay-to-win

### 2. Cosmetic Shop

**Purchasable Items**:
- Cube skins/themes
- Voxel particle effects
- UI themes
- Victory animations
- Profile customization
- Emotes (for multiplayer)

**Pricing**:
- Common items: 100 gems
- Rare items: 500 gems
- Legendary items: 1000 gems

### 3. Battle Pass System

**Seasonal Pass** (3 months):
- Free track: Basic rewards for all
- Premium track ($10): Enhanced rewards
- 50 tiers of rewards
- Earn XP through playing

**Rewards Include**:
- Exclusive skins
- Currency bundles
- Power-up packs
- Profile customization
- Title badges

### 4. Daily/Weekly Missions

**Daily Missions** (3 per day):
- "Match 50 cubes"
- "Complete 3 levels"
- "Earn a 5x combo"
- Reward: 50 cubes, 10 gems

**Weekly Missions** (3 per week):
- "Complete 20 levels"
- "Earn 50,000 points"
- "Use each power-up once"
- Reward: 500 cubes, 100 gems

### 5. Limited-Time Events

**Event Types**:
- **Seasonal Events**: Holiday themes (Halloween, Christmas, etc.)
- **Challenge Events**: Special game mode for 1 week
- **Community Events**: Global goal (all players contribute)
- **Competitive Events**: Tournament with prizes

**Event Rewards**:
- Exclusive cosmetics (time-limited)
- Bonus currency
- Special achievements
- Unique titles

### 6. Fair Monetization Principles

**No Pay-to-Win**:
- All purchases are cosmetic only
- Power-ups available through gameplay
- Premium currency can be earned (slowly) for free
- No energy system (play unlimited)

**Ethical Practices**:
- No loot boxes (direct purchases only)
- Transparent pricing
- No aggressive ads
- Respect player time

---

## Technical Improvements

### 1. Cloud Save

**Features**:
- Auto-save progress to cloud
- Cross-platform sync
- Play on PC, continue on mobile
- Multiple save slots
- Manual backup/restore

### 2. Modding Support

**Workshop/Modding Tools**:
- Level editor (create custom levels)
- Cube skin creator
- Custom particle effects
- Share with community
- Browse/download user content

**Scripting API**:
- Lua scripting for custom mechanics
- Safe sandboxed execution
- Documentation and examples

### 3. Performance Optimization

**Targets**:
- 120 FPS mode (high-end PC)
- 60 FPS stable (mid-range)
- 30 FPS minimum (low-end/mobile)

**Optimizations**:
- LOD system for distant cubes
- Occlusion culling
- Object pooling enhancements
- GPU instancing for voxels
- Async loading

### 4. Analytics & Telemetry

**Data Collection** (with user consent):
- Level completion rates
- Average score per level
- Most used power-ups
- Drop-off points
- Player behavior patterns

**Use Cases**:
- Balance difficulty
- Identify frustration points
- Guide feature development
- A/B testing new features

---

## Mobile Adaptation

### 1. Touch Controls

**Interface**:
- Swipe left/right to change tracks
- Tap screen to launch
- Hold to charge power shot
- Pinch to zoom
- Double-tap for power-up

### 2. Mobile-Specific Features

**Optimizations**:
- Simplified graphics settings
- Battery saver mode
- Portrait and landscape support
- One-handed mode
- Cloud save integration

**Monetization**:
- Optional ads for continues
- Rewarded video for power-ups
- IAP for currency
- No forced ads (player choice)

### 3. Cross-Platform Play

**Features**:
- Shared account across PC/mobile
- Cross-platform leaderboards
- Same progression system
- Cloud save sync
- Platform-specific controls

---

## Story & World Building

### 1. Narrative Campaign

**Story Concept**:
- You're a "Cube Architect" in a digital world
- The "Wall" is corruption spreading through the system
- Match cubes to purify the world
- 5 worlds with 20 levels each (100 levels total)
- Each world has unique theme and boss

**World Themes**:
1. **Digital Realm**: Classic tech aesthetic (Levels 1-20)
2. **Nature Core**: Organic, living environment (Levels 21-40)
3. **Void Space**: Dark, mysterious cosmos (Levels 41-60)
4. **Crystal Caverns**: Gem-filled underground (Levels 61-80)
5. **Core Nexus**: Final battle against corruption (Levels 81-100)

### 2. Character System

**Unlockable Characters**:
- Each has unique passive ability
- Cosmetic differences
- Voice lines and personality
- Unlock through campaign or achievements

**Example Characters**:
- **Ada**: The Strategist (Extended combo time)
- **Bolt**: The Speedster (Faster spawn rate)
- **Crystal**: The Enchantress (Higher special cube chance)
- **Forge**: The Engineer (Stronger explosions)

### 3. Cutscenes & Lore

**Story Delivery**:
- Brief cutscenes between worlds
- Comic-style panels
- Voice-over narration
- Collectible lore entries

**Environmental Storytelling**:
- Background changes as corruption clears
- NPCs appear in background celebrating
- Visual progression of world healing

---

## Implementation Priorities

### Phase 1: Core Gameplay Depth (3-6 months)
- ✅ Special cube types (bomb, rainbow, multiplier)
- ✅ Combo system
- ✅ Power-ups (3-5 abilities)
- ✅ Gravity mechanics
- ✅ Achievement system (basic)

### Phase 2: Content Expansion (3-6 months)
- ✅ Additional game modes (Time Attack, Puzzle, Endless)
- ✅ 50 more levels (total 70)
- ✅ Skill tree system
- ✅ Daily/weekly challenges
- ✅ Cosmetic shop

### Phase 3: Social & Competitive (3-6 months)
- ✅ Leaderboards
- ✅ Replays
- ✅ Versus mode (multiplayer)
- ✅ Tournaments
- ✅ Clans/guilds

### Phase 4: Polish & Live Ops (Ongoing)
- ✅ Battle pass system
- ✅ Seasonal events
- ✅ Mobile port
- ✅ Modding support
- ✅ Story campaign

---

## Metrics for Success

### Engagement Metrics
- **DAU** (Daily Active Users): Target 10,000+
- **Retention**: D1: 40%, D7: 20%, D30: 10%
- **Session Length**: Average 15-20 minutes
- **Sessions per Day**: 2-3

### Monetization Metrics
- **ARPU** (Average Revenue Per User): $2-5
- **Conversion Rate**: 5-10% of players
- **LTV** (Lifetime Value): $10-20
- **IAP Distribution**: 70% cosmetics, 30% convenience

### Quality Metrics
- **Bug Reports**: < 1 per 1000 sessions
- **Crash Rate**: < 0.1%
- **Average Rating**: 4.5+ stars
- **Support Tickets**: < 5% of users

---

## Conclusion

This roadmap transforms Cubetris from a solid MVP into a rich, engaging experience with:

✨ **Depth**: Multiple game modes, mechanics, and strategies
🎨 **Expression**: Cosmetics, customization, themes
🏆 **Competition**: Leaderboards, tournaments, PvP
🤝 **Community**: Clans, sharing, modding
📈 **Progression**: Leveling, skills, mastery
🎭 **Story**: Narrative campaign with characters
💰 **Sustainability**: Fair monetization for long-term development

**Core Philosophy**: Fun first, fair monetization, respect player time

The game evolves from a physics puzzler into a competitive, social experience with long-term engagement and community building at its core.

---

**Next Steps**:
1. Prioritize features based on player feedback
2. Prototype special cubes and combo system
3. Design and balance first 5 additional levels
4. Implement basic achievement system
5. Gather community input on roadmap

**Living Document**: This roadmap will evolve based on player feedback, technical constraints, and market trends.

---

*Let's make Cubetris incredible!* 🎮✨
