# Cubetris - Minimum Viable Steam Release Roadmap

**Objective**: Ship a polished, bug-free version of Cubetris on Steam with core gameplay intact.

**Estimated Timeline**: 3-6 months (solo dev) | 1-3 months (small team)

---

## Table of Contents

1. [Phase 1: Unity Implementation](#phase-1-unity-implementation)
2. [Phase 2: Core Polish](#phase-2-core-polish)
3. [Phase 3: Content & Balance](#phase-3-content--balance)
4. [Phase 4: Audio & Juice](#phase-4-audio--juice)
5. [Phase 5: Steam Integration](#phase-5-steam-integration)
6. [Phase 6: Marketing & Legal](#phase-6-marketing--legal)
7. [Phase 7: QA & Launch Prep](#phase-7-qa--launch-prep)
8. [Cost Breakdown](#cost-breakdown)
9. [Launch Checklist](#launch-checklist)

---

## Phase 1: Unity Implementation
**Goal**: Get the game actually running in Unity
**Duration**: 2-3 weeks
**Status**: 🔴 NOT STARTED

### 1.1 Scene Setup (1-2 days)
- [ ] Create MainGame scene following UNITY_SETUP_GUIDE.md
- [ ] Set up all GameObjects (GameManager, Spawner, Wall, etc.)
- [ ] Configure camera and lighting
- [ ] Link all script references in Inspector

### 1.2 Prefab Creation (1-2 days)
- [ ] Create CubePrefab
  - Add cube mesh
  - Configure Rigidbody (mass: 1, continuous collision)
  - Add CubeController script
  - Create 5 color material variants
- [ ] Create VoxelPrefab
  - Small cube (0.12 scale)
  - Rigidbody (mass: 0.1)
  - Fade-capable material
  - VoxelController script
- [ ] Create ObstaclePrefab
  - Cylinder mesh
  - ObstacleController script
- [ ] Create SparkleParticle prefab
  - Particle System configured
  - Burst emission (20-30 particles)

### 1.3 Materials & Physics (1 day)
- [ ] Create CubePhysicMaterial (friction: 0.6, bounce: 0)
- [ ] Set up collision layers (Cubes, Voxels, Wall)
- [ ] Configure Layer Collision Matrix (voxels ignore voxels)
- [ ] Create basic materials for each cube color
- [ ] Create transparent material for voxels

### 1.4 Basic UI (2-3 days)
- [ ] Create Canvas with UI elements
- [ ] Main Menu (Start, Quit buttons)
- [ ] HUD (Score, Lives, Level display)
- [ ] Pause Menu (Resume, Restart, Quit)
- [ ] Game Over screen (Final Score, Restart)
- [ ] Level Complete screen (Score, Next Level)
- [ ] Wire up all UIManager references
- [ ] Add TextMeshPro (free Unity package)

### 1.5 First Playable Test (1 day)
- [ ] Link all prefabs to managers
- [ ] Test spawn → move → launch → stack
- [ ] Verify match detection works
- [ ] Check explosions spawn voxels
- [ ] Confirm wall pushes forward
- [ ] Test game over condition

**Milestone**: You can play through 1 level end-to-end ✅

---

## Phase 2: Core Polish
**Goal**: Make gameplay feel good and bug-free
**Duration**: 2-3 weeks
**Status**: 🔴 NOT STARTED

### 2.1 Input & Controls (2-3 days)
- [ ] Implement Unity New Input System (recommended) or polish old Input
- [ ] Add input buffering (queue Space press if pressed early)
- [ ] Add haptic feedback for gamepad
- [ ] Implement control remapping in settings
- [ ] Test with keyboard, mouse, and gamepad
- [ ] Create control tutorial/overlay

### 2.2 Gameplay Tuning (3-5 days)
- [ ] Playtest all 20 levels
- [ ] Adjust difficulty curve (wall speed, target scores)
- [ ] Balance special cube spawn rates
- [ ] Tune physics (cube mass, launch force, friction)
- [ ] Fix any edge case bugs in match detection
- [ ] Ensure chain reactions work reliably
- [ ] Adjust voxel explosion parameters for satisfying feel

### 2.3 Visual Feedback (2-3 days)
- [ ] Add screen shake on explosions (use Cinemachine)
- [ ] Implement combo counter UI with animations
- [ ] Add score pop-ups on matches (+100, +500, etc.)
- [ ] Create cube launch trail effect
- [ ] Add wall warning glow when approaching spawn
- [ ] Implement smooth camera transitions
- [ ] Add simple background (gradient or static image)

### 2.4 Bug Fixing (3-5 days)
- [ ] Fix cube stacking issues (if cubes fall through floor)
- [ ] Resolve match detection edge cases
- [ ] Fix pool exhaustion crashes
- [ ] Ensure no null reference exceptions
- [ ] Handle edge cases (restart during explosion, etc.)
- [ ] Fix any UI layout issues
- [ ] Memory leak testing (check for objects not returned to pool)

**Milestone**: Game is stable and fun to play for 30+ minutes ✅

---

## Phase 3: Content & Balance
**Goal**: Ensure 20 levels are fun and progression feels good
**Duration**: 1-2 weeks
**Status**: 🔴 NOT STARTED

### 3.1 Level Design (5-7 days)
- [ ] Playtest each level multiple times
- [ ] Adjust levels.json parameters based on playtests:
  - Track count progression (6 → 10 → 12 → 16)
  - Wall speed curve
  - Target score balance
  - Spawn rates
- [ ] Ensure each level introduces something new:
  - Level 1-5: Learn basics
  - Level 6-10: Increase speed
  - Level 11-15: More tracks, obstacles start
  - Level 16-20: Maximum difficulty
- [ ] Create difficulty spike graph and smooth it out
- [ ] Test full playthrough (all 20 levels)

### 3.2 Tutorial & Onboarding (2-3 days)
- [ ] Create simple tutorial level (Level 0)
  - Text prompts: "Press ← → to move"
  - "Press SPACE to launch"
  - "Match 3+ cubes to explode"
- [ ] Add tooltips for first-time players
- [ ] Create "How to Play" menu section with images
- [ ] Add skipable tutorial option
- [ ] Test with someone who hasn't played before

### 3.3 Progression Feedback (1-2 days)
- [ ] Add level transition animations
- [ ] Show progress indicator (Level X / 20)
- [ ] Display stars/medals based on score (optional)
- [ ] Victory screen after level 20 completion
- [ ] Track and display total score across all levels

**Milestone**: All 20 levels are playable and balanced ✅

---

## Phase 4: Audio & Juice
**Goal**: Make the game satisfying with sound and particle effects
**Duration**: 2-3 weeks
**Status**: 🔴 NOT STARTED

### 4.1 Sound Effects (3-5 days)
**Option A**: Use free assets (Freesound.org, OpenGameArt.org)
**Option B**: Commission sound designer ($200-500)

Required SFX:
- [ ] Cube spawn sound (soft chime)
- [ ] Cube launch sound (whoosh)
- [ ] Cube land/collision sound (thud)
- [ ] Match detection sound (success chime)
- [ ] Explosion sound (boom - 3 variations for small/medium/large)
- [ ] Wall warning sound (alarm beep)
- [ ] UI button clicks
- [ ] Game over sound
- [ ] Level complete sound (victory fanfare)
- [ ] Menu music (calm, loopable)
- [ ] Gameplay music (upbeat, loopable)

Implementation:
- [ ] Import all audio files
- [ ] Add AudioSource to appropriate GameObjects
- [ ] Implement audio pooling for explosion sounds (multiple at once)
- [ ] Add volume sliders in settings (Master, SFX, Music)
- [ ] Test audio mixing (ensure no clipping)

### 4.2 Music (2-3 days)
**Option A**: Use royalty-free music (Incompetech.com, Purple Planet Music)
**Option B**: Commission composer ($300-800 for 2-3 tracks)

Required Tracks:
- [ ] Main Menu theme (30s loop, calm/ambient)
- [ ] Gameplay theme (2-3 min loop, energetic)
- [ ] Victory theme (20s, celebratory)

Implementation:
- [ ] Import music tracks
- [ ] Set up AudioSource on GameManager
- [ ] Implement smooth crossfading between tracks
- [ ] Add music intensity system (optional: speed up as wall approaches)
- [ ] Test music loops seamlessly

### 4.3 Particle Effects (2-3 days)
- [ ] Enhance voxel explosions (add glow, trails)
- [ ] Create sparkle particle effect for matches
- [ ] Add dust particles when cubes land
- [ ] Create impact ring effect for large explosions
- [ ] Add ambient particles in play area (floating dust)
- [ ] Optimize particle systems (GPU instancing)

### 4.4 Visual Polish (2-3 days)
- [ ] Add post-processing (Unity Post Processing Stack):
  - Bloom for explosions
  - Color grading for mood
  - Vignette for focus
- [ ] Create simple skybox or background
- [ ] Add subtle camera movement (breathing effect)
- [ ] Polish UI with icons and better fonts
- [ ] Add smooth transitions between screens (fade in/out)

**Milestone**: Game feels polished and satisfying to play ✅

---

## Phase 5: Steam Integration
**Goal**: Get game working on Steam platform
**Duration**: 1-2 weeks
**Status**: 🔴 NOT STARTED

### 5.1 Steam Setup (1-2 days)
- [ ] Create Steam Partner account ($100 one-time fee)
- [ ] Set up Steamworks Developer portal
- [ ] Create app ID for Cubetris
- [ ] Download Steamworks SDK
- [ ] Install Steamworks.NET (Unity package) or Facepunch.Steamworks

### 5.2 Steam Features Integration (3-5 days)
**Minimum Required**:
- [ ] Steam authentication (verify user owns game)
- [ ] Steam overlay working
- [ ] Cloud saves via Steam Cloud
- [ ] Basic achievements (10-15 achievements minimum)
  - Complete Level 1
  - Complete Level 10
  - Complete all 20 levels
  - Score 10,000 points
  - Get 5x combo
  - Match 100 cubes
  - Play for 1 hour
  - etc.

**Optional but Recommended**:
- [ ] Leaderboards (global high scores)
- [ ] Steam Stats (track cubes matched, games played, etc.)
- [ ] Steam Input API (for controller support)

### 5.3 Build Pipeline (2-3 days)
- [ ] Set up build automation (Windows, macOS, Linux)
- [ ] Configure build settings:
  - Company name
  - Product name: "Cubetris"
  - Version: 1.0.0
  - Default icon
  - Splash screen
- [ ] Test builds on all platforms:
  - Windows 64-bit (required)
  - macOS (optional but recommended)
  - Linux (optional but recommended)
- [ ] Set up SteamPipe for uploading builds
- [ ] Create depot configuration
- [ ] Upload test build to Steam

### 5.4 Steam Store Page Setup (2-3 days)
- [ ] Write store description (compelling copy)
- [ ] Create key features list (5-7 bullet points)
- [ ] Specify system requirements (minimum & recommended)
- [ ] Set up pricing ($4.99 - $9.99 recommended for indie puzzle)
- [ ] Choose release date
- [ ] Configure Steam tags (Puzzle, Physics, Casual, Strategy, etc.)

**Milestone**: Game installable and playable via Steam ✅

---

## Phase 6: Marketing & Legal
**Goal**: Prepare store presence and legal requirements
**Duration**: 2-3 weeks (can overlap with Phase 5)
**Status**: 🔴 NOT STARTED

### 6.1 Marketing Assets (5-7 days)
**Screenshots** (Steam requires minimum 5):
- [ ] Capture 1920×1080 gameplay screenshots
- [ ] Show variety: different levels, explosions, UI states
- [ ] Edit for visual appeal (color correction, composition)
- [ ] Include at least 1 HUD screenshot
- [ ] Take screenshots of best moments (big explosions)

**Trailer** (1-2 minutes):
**Option A**: DIY with Unity Timeline and video editor ($0)
**Option B**: Commission trailer editor ($200-500)

Required footage:
- [ ] 5 seconds: Game logo/title reveal
- [ ] 15 seconds: Core gameplay (spawn, move, launch)
- [ ] 10 seconds: Matching and explosions
- [ ] 10 seconds: Show multiple levels/variety
- [ ] 5 seconds: Show UI/features
- [ ] 10 seconds: Big satisfying moments (chain reactions)
- [ ] 5 seconds: Call to action (Wishlist now!)

- [ ] Add upbeat music (licensed or royalty-free)
- [ ] Add text overlays explaining mechanics
- [ ] Export in 1080p or 4K
- [ ] Upload to YouTube and Steam

**Capsule Images** (Steam required):
- [ ] Header capsule: 460×215
- [ ] Small capsule: 231×87
- [ ] Main capsule: 616×353
- [ ] Library hero: 3840×1240
- [ ] Library capsule: 600×900

**Logo**:
- [ ] Design or commission Cubetris logo
- [ ] Clean, readable, memorable
- [ ] Works at small sizes (icon)
- [ ] Multiple variations (with/without text)

### 6.2 Legal Requirements (1-2 days)
- [ ] Create EULA (End User License Agreement)
  - Use template from other indie games
  - Customize for your game
- [ ] Privacy Policy (if collecting any data)
  - Required if using analytics
  - Template available online
- [ ] Copyright notices
  - © 2025 [Your Name/Studio]
  - Include in game credits
- [ ] Third-party attribution
  - List all asset sources (fonts, sounds, etc.)
  - Include required licenses
  - Create Credits screen in game

### 6.3 Business Setup (varies by location)
- [ ] Decide business structure:
  - Solo dev: Personal name or DBA/sole proprietorship
  - Team: LLC or equivalent
- [ ] Set up business bank account (optional but recommended)
- [ ] Understand tax implications (Steam pays out revenue)
- [ ] Set up payment method for Steam (bank details, tax forms)

### 6.4 Pre-Launch Marketing (ongoing)
**Free Marketing**:
- [ ] Create Twitter/X account (@Cubetris_Game)
  - Post development updates
  - Share GIFs of gameplay
  - Engage with gamedev community
- [ ] Create TikTok/Instagram for short gameplay clips
- [ ] Post on Reddit:
  - r/Unity3D (development updates)
  - r/IndieDev (progress posts)
  - r/gamedev (technical discussions)
  - r/indiegaming (promotion)
- [ ] Create itch.io page with demo (optional)
- [ ] Submit to gaming blogs/sites (IndieDB, etc.)
- [ ] Reach out to YouTube/Twitch streamers (small ones first)

**Paid Marketing** (optional, $500-2000 budget):
- [ ] Steam visibility package (featured placement)
- [ ] Paid ads (Twitter, Reddit, YouTube)
- [ ] Influencer sponsorships

**Milestone**: Store page looks professional and compelling ✅

---

## Phase 7: QA & Launch Prep
**Goal**: Ensure bug-free launch
**Duration**: 2-4 weeks
**Status**: 🔴 NOT STARTED

### 7.1 Internal QA (1 week)
Test Matrix:
- [ ] **Platforms**: Windows, macOS, Linux
- [ ] **Controllers**: Keyboard, mouse, Xbox controller, PlayStation controller
- [ ] **Resolutions**: 1080p, 1440p, 4K, ultrawide
- [ ] **Performance**: Test on low-end, mid-range, high-end PCs

Test Cases (minimum 50 test cases):
- [ ] All 20 levels completable
- [ ] All achievements unlock correctly
- [ ] Save/load works (cloud and local)
- [ ] Pause/resume works in all states
- [ ] UI scales correctly at all resolutions
- [ ] Audio plays correctly (no missing sounds)
- [ ] No crashes during normal gameplay
- [ ] No crashes during edge cases (spam restart, etc.)
- [ ] Leaderboards upload scores correctly
- [ ] Steam overlay works

Bug Tracking:
- [ ] Set up bug tracker (Trello, Notion, or GitHub Issues)
- [ ] Prioritize bugs (Critical, High, Medium, Low)
- [ ] Fix all Critical and High bugs
- [ ] Fix Medium bugs if time allows

### 7.2 External Beta Testing (1-2 weeks)
- [ ] Recruit 10-20 beta testers:
  - Friends/family
  - Discord community
  - Reddit volunteers
- [ ] Create beta Steam key codes
- [ ] Set up feedback form (Google Forms or TypeForm)
- [ ] Collect feedback on:
  - Bugs encountered
  - Difficulty balance
  - Clarity of mechanics
  - Overall fun factor
- [ ] Iterate based on feedback

### 7.3 Performance Optimization (3-5 days)
- [ ] Profile with Unity Profiler:
  - Target: 60 FPS on GTX 1050 / RX 560
  - Identify bottlenecks (CPU, GPU, memory)
- [ ] Optimize as needed:
  - Reduce draw calls (batching)
  - Optimize particle count
  - LOD for distant objects
  - Async scene loading
- [ ] Add graphics settings:
  - Quality presets (Low, Medium, High, Ultra)
  - VSync toggle
  - FPS limiter
  - Resolution options
- [ ] Test on minimum spec hardware

### 7.4 Accessibility Pass (1-2 days)
- [ ] Add colorblind mode (symbols on cubes)
- [ ] Ensure all text is readable (font size, contrast)
- [ ] Add subtitles for any audio cues (if applicable)
- [ ] Test with only keyboard
- [ ] Test with only mouse
- [ ] Test with only gamepad
- [ ] Add control rebinding (if not already done)

### 7.5 Final Polish (2-3 days)
- [ ] Review all UI text for typos
- [ ] Ensure credits are complete and accurate
- [ ] Add "Made with Unity" splash (required)
- [ ] Add your studio logo (if applicable)
- [ ] Final audio mix pass
- [ ] Final lighting/visual pass
- [ ] Create final build (version 1.0.0)
- [ ] Test final build thoroughly (regression testing)

### 7.6 Launch Preparation (1-2 days)
- [ ] Upload final build to Steam (mark as default branch)
- [ ] Set release date (give 2+ weeks for Steam review)
- [ ] Prepare launch day social posts
- [ ] Prepare press release (optional)
- [ ] Create email list for launch announcement
- [ ] Set up Discord server for community (optional)
- [ ] Prepare launch day livestream (optional)
- [ ] Notify wishlist users (Steam does this automatically)

**Milestone**: Game is polished, tested, and ready to ship ✅

---

## Cost Breakdown

### Mandatory Costs
| Item | Cost | Notes |
|------|------|-------|
| Steam Partner Fee | $100 | One-time, per game |
| **Total Mandatory** | **$100** | |

### Recommended Costs
| Item | Cost | Notes |
|------|------|-------|
| Sound Effects Pack | $50-200 | Or use free assets |
| Music (2-3 tracks) | $300-800 | Or use royalty-free |
| Logo Design | $50-300 | Fiverr or 99designs |
| Trailer Editing | $200-500 | If outsourcing |
| **Total Recommended** | **$600-1800** | |

### Optional Costs
| Item | Cost | Notes |
|------|------|-------|
| Marketing Budget | $500-2000 | Ads, influencers |
| Testing Service | $200-500 | Professional QA |
| Localization | $500-2000 | Translate to other languages |
| **Total Optional** | **$1200-4500** | |

### **Total Investment Range**
- **Minimum**: $100 (just Steam fee, DIY everything)
- **Recommended**: $700-1900 (professional quality)
- **Polished**: $2000-6000 (with marketing)

### Time Investment
- **Solo Developer**: 3-6 months (part-time) or 1.5-3 months (full-time)
- **Small Team (2-3)**: 1-3 months
- **With Outsourcing**: 2-4 months (faster but more $)

---

## Launch Checklist

### 4 Weeks Before Launch
- [ ] Steamworks page complete (description, screenshots, trailer)
- [ ] All required capsule images uploaded
- [ ] Pricing set
- [ ] Release date announced
- [ ] Beta testing complete
- [ ] All critical bugs fixed

### 2 Weeks Before Launch
- [ ] Final build uploaded to Steam
- [ ] Achievement icons created and uploaded
- [ ] System requirements verified
- [ ] Press release drafted
- [ ] Social media posts scheduled
- [ ] Email to mailing list prepared

### 1 Week Before Launch
- [ ] Verify Steam build works on all platforms
- [ ] Send review keys to press/streamers (if applicable)
- [ ] Final marketing push (tweets, Reddit posts)
- [ ] Prepare launch day monitoring plan
- [ ] Ensure support email is set up

### Launch Day
- [ ] Monitor Steam forums for issues
- [ ] Respond to early reviews
- [ ] Post launch announcement on all channels
- [ ] Monitor for critical bugs
- [ ] Celebrate! 🎉

### Post-Launch (First Week)
- [ ] Hotfix any critical bugs immediately
- [ ] Respond to community feedback
- [ ] Monitor reviews and adjust based on feedback
- [ ] Continue marketing efforts
- [ ] Plan first update/patch

---

## Success Metrics

### Launch Goals (First Month)
- **Wishlist Conversions**: 20-40% of wishlists convert to sales
- **Reviews**: Target 10+ positive reviews
- **Rating**: Maintain 75%+ positive (mostly positive)
- **Sales**: 100-500 units (reasonable for indie puzzle game)
- **Revenue**: $500-5000 (after Steam's 30% cut)

### Long-Term Goals (First Year)
- **Total Sales**: 1,000-5,000 units
- **Revenue**: $5,000-$50,000
- **Community**: 500+ Discord members or Steam group
- **Updates**: 2-3 content updates
- **Reviews**: 50+ reviews, mostly positive

### Break-Even Analysis
If you spent $1,000 total and price at $6.99:
- Steam takes 30% = $4.89 per sale (your revenue)
- Break-even: 205 sales
- Realistic with good marketing and decent game

---

## Recommended Workflow

### Realistic Timeline (Solo, Part-Time)
```
Month 1: Unity implementation + Core polish
Month 2: Content, audio sourcing, initial testing
Month 3: Steam integration, marketing prep
Month 4: QA, external beta, final polish
Month 5: Marketing push, final prep
Month 6: Launch!
```

### Accelerated Timeline (Solo, Full-Time)
```
Weeks 1-2: Unity implementation
Weeks 3-4: Core polish + content
Weeks 5-6: Audio + visual polish
Weeks 7-8: Steam integration
Weeks 9-10: Marketing assets
Weeks 11-12: QA + final prep
Week 13: LAUNCH
```

### Team Timeline (2-3 people, Part-Time)
```
Month 1: Unity implementation + Core polish
Month 2: Content + Audio + Steam integration (parallel)
Month 3: Marketing + QA + Launch prep
Month 4: LAUNCH
```

---

## Critical Path (Bare Minimum)

If you absolutely must ship ASAP, this is the minimum:

### Week 1-2: Make it playable
- Unity scene setup
- Prefabs created
- Basic UI
- First playable build

### Week 3-4: Make it fun
- Polish gameplay feel
- Fix major bugs
- Balance 20 levels
- Add simple SFX (free assets)

### Week 5-6: Make it shippable
- Steam integration (achievements, cloud saves)
- Create store page
- Take screenshots
- Make simple trailer (screen recording + music)

### Week 7-8: Ship it
- Beta test with 5-10 people
- Fix critical bugs
- Upload final build
- Launch!

**Absolute minimum**: 2 months full-time, $100 budget

---

## Common Pitfalls to Avoid

### 1. Feature Creep
❌ "Let me just add multiplayer..."
✅ Ship the core game first, add features in updates

### 2. Perfectionism
❌ "The voxels don't look perfect..."
✅ Good enough is good enough for v1.0

### 3. Underestimating QA
❌ "I tested it myself, it's fine"
✅ Always get external testers

### 4. Poor Marketing Timing
❌ Start marketing 1 week before launch
✅ Start building wishlist 3+ months before

### 5. Ignoring Community
❌ Launch and disappear
✅ Engage with players, respond to feedback

### 6. Wrong Pricing
❌ Price too high ($19.99 for puzzle game)
✅ Research similar games ($4.99-$9.99 sweet spot)

### 7. No Post-Launch Plan
❌ "Game is shipped, I'm done"
✅ Plan 2-3 updates in first 3 months

---

## Final Recommendations

### Priority Order
1. **Gameplay First**: Make sure core loop is fun (Phase 1-2)
2. **Content Second**: Ensure 20 levels are balanced (Phase 3)
3. **Polish Third**: Add audio and juice (Phase 4)
4. **Platform Fourth**: Steam integration (Phase 5)
5. **Marketing Fifth**: Store page and promotion (Phase 6)
6. **Quality Last**: Testing and fixing (Phase 7)

### What Can Be Cut (If Needed)
- macOS/Linux builds (ship Windows first)
- Controller support (keyboard is enough)
- Leaderboards (add post-launch)
- Trailer (can launch with screenshots only)
- Localization (English first, translate later)

### What Cannot Be Cut
- Core gameplay working
- All 20 levels playable
- Basic SFX (game feels dead without it)
- Steam achievements (players expect it)
- Bug-free experience (critical bugs = refunds)

### When to Launch
**Good Times**:
- January-February (post-holiday lull, people have money)
- September-October (before holiday rush)
- Avoid: Late November-December (AAA competition)

**Day of Week**:
- Tuesday-Thursday (best visibility on Steam)
- Avoid: Friday (weekend gets lost)
- Avoid: Monday (low engagement)

---

## Conclusion

### Absolute Minimum Path to Steam
1. ✅ Complete Unity implementation (UNITY_SETUP_GUIDE.md)
2. ✅ Add basic SFX and music
3. ✅ Balance all 20 levels
4. ✅ Integrate Steam (achievements, cloud saves)
5. ✅ Create store page (screenshots, description)
6. ✅ Beta test with 10 people
7. ✅ Fix critical bugs
8. ✅ Launch

**Timeline**: 2-3 months full-time
**Budget**: $100-1000
**Result**: Shippable game on Steam

### Recommended Path for Quality
Follow all 7 phases in this document for a polished, professional release that will get positive reviews and word-of-mouth.

**Timeline**: 3-6 months part-time
**Budget**: $700-2000
**Result**: High-quality indie game with good chance of success

---

**You have all the code. Now it's execution time.** 🚀

Start with Phase 1, ship the MVP, iterate based on player feedback. You can always add features from FUTURE_FEATURES.md after launch!

Good luck! 🎮✨
