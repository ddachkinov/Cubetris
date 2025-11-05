# Unity Setup Guide - Cubetris

Complete step-by-step guide for setting up Cubetris in Unity Editor.

## Table of Contents

1. [Creating the Scene](#creating-the-scene)
2. [Setting Up Prefabs](#setting-up-prefabs)
3. [Configuring Physics](#configuring-physics)
4. [Setting Up UI](#setting-up-ui)
5. [Testing](#testing)

---

## Creating the Scene

### Step 1: Create Main Scene

1. In Unity Editor, go to `File → New Scene`
2. Save as `Assets/Scenes/MainGame.unity`
3. Set up the hierarchy as follows:

### Step 2: Create Core GameObjects

#### GameManager

1. Create empty GameObject: `GameObject → Create Empty`
2. Name: `GameManager`
3. Add Component: `GameManager` script
4. Position: (0, 0, 0)

**Inspector Settings**:
- Lives: `3`
- Show Debug Info: `✓`
- Instant Wall Move: `☐` (debugging only)
- Spawn Rate Override: `-1`

#### LevelManager

1. Create empty GameObject
2. Name: `LevelManager`
3. Add Component: `LevelManager` script
4. Position: (0, 0, 0)

**Inspector Settings**:
- Level Config Path: `Configs/levels` (no .json extension)
- Current Level Index: `1`

#### MatchDetector

1. Create empty GameObject
2. Name: `MatchDetector`
3. Add Component: `MatchDetector` script
4. Position: (0, 0, 0)

**Inspector Settings**:
- Grid Origin: `(0, 0, 0)`
- Cell Size: `1.0`
- Min Match Size: `3`
- Base Points Per Cube: `10`
- Cluster Size Multiplier: `1.5`
- Show Grid Debug: `✓`

#### ObjectPool

1. Create empty GameObject
2. Name: `ObjectPool`
3. Add Component: `ObjectPool` script
4. Position: (0, 0, 0)

**Inspector Settings**:
- Cube Prefab: `Assign after creating prefab`
- Initial Cube Pool Size: `50`
- Max Cube Pool Size: `200`
- Voxel Prefab: `Assign after creating prefab`
- Initial Voxel Pool Size: `100`
- Max Voxel Pool Size: `500`

#### ExplosionEffect

1. Create empty GameObject
2. Name: `ExplosionEffect`
3. Add Component: `ExplosionEffect` script
4. Position: (0, 0, 0)

**Inspector Settings**:
- Voxel Prefab: `Assign after creating prefab`
- Voxels Per Explosion: `20`
- Voxel Scale: `0.12`
- Voxel Lifetime: `2.0`
- Explosion Force: `5.0`
- Explosion Radius: `0.5`
- Fade Start Time: `1.0`
- Max Active Voxels: `200`

#### ObstacleManager

1. Create empty GameObject
2. Name: `ObstacleManager`
3. Add Component: `ObstacleManager` script
4. Position: (0, 0, 0)

**Inspector Settings**:
- Spawn Interval: `10.0`
- Obstacle Duration: `5.0`
- Enemy Spawn Interval: `20.0`

### Step 3: Create Gameplay Objects

#### Spawner

1. Create empty GameObject
2. Name: `Spawner`
3. Add Component: `Spawner` script
4. **Position: `(0, 2, -10)`** ← Important!

**Inspector Settings**:
- Spawn Height: `2.0`
- Spawn Z: `-10.0`
- Spawn Rate: `2.0`
- Track Count: `10`
- Track Spacing: `1.0`
- Launch Force: `15.0`
- Track Switch Speed: `10.0`
- Cube Prefab: `Assign after creating prefab`
- Cube Colors (Array of 5):
  - Element 0: Red `(1, 0, 0, 1)`
  - Element 1: Blue `(0, 0, 1, 1)`
  - Element 2: Green `(0, 1, 0, 1)`
  - Element 3: Yellow `(1, 1, 0, 1)`
  - Element 4: Magenta `(1, 0, 1, 1)`
- Special Cube Chance: `0.0`

#### Wall

1. Create Cube: `GameObject → 3D Object → Cube`
2. Name: `Wall`
3. **Position: `(0, 5, 15)`**
4. **Scale: `(20, 10, 1)`**
5. Add Component: `WallController` script

**Inspector Settings**:
- Current Speed: `0.02`
- Speed Ramp: `0.0`
- Game Over Z: `-10.0`
- Warning Distance: `5.0`
- Normal Color: Gray `(0.5, 0.5, 0.5, 1)`
- Warning Color: Red `(1, 0, 0, 1)`

**Rigidbody Component** (Add via Inspector):
- Is Kinematic: `✓`
- Use Gravity: `☐`

#### Playfield (Visual Reference)

1. Create Plane: `GameObject → 3D Object → Plane`
2. Name: `Playfield`
3. Position: `(0, 0, 5)`
4. Scale: `(2, 1, 2)`
5. Optional: Create material for grid texture

### Step 4: Camera Setup

1. Select Main Camera
2. **Position: `(0, 10, -10)`**
3. **Rotation: `(40, 0, 0)`**

**Camera Component**:
- Field of View: `60`
- Clipping Planes:
  - Near: `0.3`
  - Far: `100`

### Step 5: Lighting

1. Select Directional Light
2. **Rotation: `(50, -30, 0)`**

**Light Component**:
- Color: White
- Intensity: `1.0`
- Shadow Type: Soft Shadows

### Step 6: Link References

Go back to **GameManager** Inspector and assign all references:
- Level Manager: `Drag LevelManager GameObject`
- UI Manager: `Will assign after UI setup`
- Spawner: `Drag Spawner GameObject`
- Wall Controller: `Drag Wall GameObject`
- Match Detector: `Drag MatchDetector GameObject`

Go to **LevelManager** Inspector:
- Spawner: `Drag Spawner GameObject`
- Wall Controller: `Drag Wall GameObject`

---

## Setting Up Prefabs

### Cube Prefab

1. Create Cube: `GameObject → 3D Object → Cube`
2. Name: `CubePrefab`
3. Position: `(0, 0, 0)`
4. Scale: `(1, 1, 1)`

**Add Components**:

1. **BoxCollider** (already present):
   - Size: `(1, 1, 1)`
   - Center: `(0, 0, 0)`

2. **Rigidbody** (Add Component):
   - Mass: `1.0`
   - Drag: `0.1`
   - Angular Drag: `0.5`
   - Use Gravity: `✓`
   - Is Kinematic: `☐` (will be toggled by script)
   - Interpolate: `Interpolate`
   - Collision Detection: `Continuous`
   - Constraints: None

3. **CubeController** script (Add Component):
   - Rest Velocity Threshold: `0.1`
   - Rest Check Delay: `0.5`

**Create Material**:
1. Right-click in Project: `Create → Material`
2. Name: `CubeMaterial`
3. Shader: `Standard`
4. Color: White (will be changed via script)
5. Drag to Cube's MeshRenderer

**Create Physics Material**:
1. Right-click in `Assets/Materials`: `Create → Physic Material`
2. Name: `CubePhysicMaterial`
3. Settings:
   - Dynamic Friction: `0.6`
   - Static Friction: `0.6`
   - Bounciness: `0.0`
   - Friction Combine: `Average`
   - Bounce Combine: `Minimum`
4. Drag to Cube's BoxCollider → Material

**Create Prefab**:
1. Drag `CubePrefab` from Hierarchy to `Assets/Prefabs/`
2. Delete from scene

### Voxel Prefab

1. Create Cube: `GameObject → 3D Object → Cube`
2. Name: `VoxelPrefab`
3. **Scale: `(0.12, 0.12, 0.12)`** ← Important!

**Add Components**:

1. **BoxCollider**:
   - Size: `(1, 1, 1)` (will be 0.12 in world space due to scale)

2. **Rigidbody**:
   - Mass: `0.1`
   - Drag: `0.5`
   - Angular Drag: `0.5`
   - Use Gravity: `✓`
   - Interpolate: `None`
   - Collision Detection: `Discrete`

3. **VoxelController** script:
   - Lifetime: `2.0`
   - Fade Start Time: `1.0`
   - Use Fade: `✓`
   - Use Scale Fade: `✓`

**Create Material**:
1. Create → Material: `VoxelMaterial`
2. Shader: `Standard`
3. Rendering Mode: `Fade` (for transparency)
4. Color: White
5. Drag to Voxel's MeshRenderer

**Create Prefab**:
1. Drag to `Assets/Prefabs/VoxelPrefab`
2. Delete from scene

### Obstacle Prefab

1. Create Cylinder: `GameObject → 3D Object → Cylinder`
2. Name: `ObstaclePrefab`
3. Scale: `(0.4, 1, 0.4)`

**Add Components**:

1. **ObstacleController** script:
   - Block Duration: `5.0`
   - Warning Time: `1.0`

**Create Material**:
1. Create → Material: `ObstacleMaterial`
2. Color: Gray
3. Drag to Obstacle's MeshRenderer

**Create Prefab**:
1. Drag to `Assets/Prefabs/ObstaclePrefab`
2. Delete from scene

### Sparkle Particle Prefab

1. Create Particle System: `GameObject → Effects → Particle System`
2. Name: `SparkleParticle`

**Particle System Settings**:

**Main Module**:
- Duration: `1.0`
- Looping: `☐`
- Start Lifetime: `0.5 - 1.0` (Random Between Two Constants)
- Start Speed: `2 - 5`
- Start Size: `0.1 - 0.3`
- Start Color: White
- Play On Awake: `✓`

**Emission Module**:
- Rate over Time: `0`
- Bursts:
  - Time: `0`
  - Count: `20 - 30`

**Shape Module**:
- Shape: `Sphere`
- Radius: `0.5`

**Color over Lifetime Module**:
- Enable: `✓`
- Gradient: Fade from white to transparent

**Size over Lifetime Module**:
- Enable: `✓`
- Curve: Start at 1, end at 0

**Renderer Module**:
- Render Mode: `Billboard`
- Material: `Default-Particle`

**Create Prefab**:
1. Drag to `Assets/Prefabs/SparkleParticle`
2. Delete from scene

---

## Configuring Physics

### Physics Layers

1. Go to `Edit → Project Settings → Tags and Layers`
2. Add layers:
   - Layer 6: `Cubes`
   - Layer 7: `Voxels`
   - Layer 8: `Wall`
   - Layer 9: `Obstacles`

### Layer Collision Matrix

1. Go to `Edit → Project Settings → Physics`
2. Scroll to Layer Collision Matrix
3. Disable collisions:
   - `Voxels` ↔ `Voxels` (☐)
   - `Voxels` ↔ `Obstacles` (☐)

### Physics Settings

In `Edit → Project Settings → Physics`:

**Gravity**: `(0, -20, 0)`
**Default Material**: None
**Bounce Threshold**: `2`
**Sleep Threshold**: `0.005`
**Default Contact Offset**: `0.01`
**Default Solver Iterations**: `8`
**Default Solver Velocity Iterations**: `8`
**Queries Hit Triggers**: `☐`
**Enable Adaptive Force**: `☐`
**Auto Simulation**: `✓`
**Auto Sync Transforms**: `☐`

---

## Setting Up UI

### Create Canvas

1. `GameObject → UI → Canvas`
2. Name: `UICanvas`

**Canvas Settings**:
- Render Mode: `Screen Space - Overlay`
- Pixel Perfect: `☐`

**Canvas Scaler**:
- UI Scale Mode: `Scale With Screen Size`
- Reference Resolution: `1920 x 1080`
- Match: `0.5` (middle between width and height)

### Add UIManager Script

1. Select UICanvas
2. Add Component: `UIManager` script

### Create UI Panels

#### HUD Panel

1. Right-click UICanvas → `UI → Panel`
2. Name: `HUDPanel`

**Add Children**:

**Score Text**:
- UI → Text (or TextMeshPro - Text)
- Name: `ScoreText`
- Anchor: Top-Left
- Position: `(100, -50)`
- Text: "Score: 0"
- Font Size: 36

**Lives Text**:
- Name: `LivesText`
- Anchor: Top-Left
- Position: `(100, -100)`
- Text: "Lives: 3"
- Font Size: 32

**Level Text**:
- Name: `LevelText`
- Anchor: Top-Right
- Position: `(-100, -50)`
- Text: "Level: 1/20"
- Font Size: 32

**Target Text**:
- Name: `TargetText`
- Anchor: Top-Center
- Position: `(0, -50)`
- Text: "Target: 100"
- Font Size: 32

**Next Cube Preview**:
- UI → Image
- Name: `NextCubePreview`
- Anchor: Top-Right
- Position: `(-100, -150)`
- Size: `(50, 50)`

#### Main Menu Panel

1. Right-click UICanvas → UI → Panel
2. Name: `MainMenuPanel`

**Add Children**:

**Title Text**:
- UI → Text
- Text: "CUBETRIS"
- Font Size: 72
- Anchor: Middle-Center
- Position: `(0, 200)`

**Start Button**:
- UI → Button
- Name: `StartButton`
- Position: `(0, 0)`
- Size: `(300, 80)`
- Text: "Start Game"
- OnClick: `UIManager.OnStartGameButton`

**Quit Button**:
- UI → Button
- Name: `QuitButton`
- Position: `(0, -100)`
- Size: `(300, 80)`
- Text: "Quit"
- OnClick: `UIManager.OnQuitButton`

#### Pause Menu Panel

1. Create Panel: `PauseMenuPanel`
2. Set active: `☐` (inactive by default)

**Add Children**:

**Resume Button**:
- UI → Button
- Text: "Resume"
- OnClick: `UIManager.OnResumeButton`

**Restart Button**:
- UI → Button
- Text: "Restart"
- OnClick: `UIManager.OnRestartButton`

**Quit Button**:
- UI → Button
- Text: "Quit to Menu"
- OnClick: `UIManager.OnQuitButton`

#### Game Over Panel

1. Create Panel: `GameOverPanel`
2. Set active: `☐`

**Add Children**:

**Game Over Text**:
- UI → Text
- Text: "GAME OVER"
- Font Size: 64

**Final Score Text**:
- UI → Text
- Name: `FinalScoreText`
- Text: "Final Score: 0"

**Restart Button**:
- OnClick: `UIManager.OnRestartButton`

#### Level Complete Panel

1. Create Panel: `LevelCompletePanel`
2. Set active: `☐`

**Add Children**:

**Complete Text**:
- Text: "LEVEL COMPLETE!"
- Font Size: 56

**Score Text**:
- Name: `LevelCompleteScoreText`

**Next Level Button**:
- UI → Button
- Text: "Next Level"
- OnClick: `UIManager.OnNextLevelButton`

### Link UI References

Go to UIManager Inspector and assign all references:
- Score Text: `Drag ScoreText`
- Lives Text: `Drag LivesText`
- Level Text: `Drag LevelText`
- Target Text: `Drag TargetText`
- Next Cube Preview: `Drag NextCubePreview Image`
- HUD Panel: `Drag HUDPanel`
- Main Menu Panel: `Drag MainMenuPanel`
- Pause Menu Panel: `Drag PauseMenuPanel`
- Game Over Panel: `Drag GameOverPanel`
- Level Complete Panel: `Drag LevelCompletePanel`
- Final Score Text: `Drag FinalScoreText`
- Level Complete Score Text: `Drag LevelCompleteScoreText`

### Final UIManager Link

Go back to **GameManager** Inspector:
- UI Manager: `Drag UICanvas GameObject`

---

## Testing

### Pre-Flight Checklist

Before testing, verify:

**Prefabs Created**:
- ☐ CubePrefab exists in `Assets/Prefabs/`
- ☐ VoxelPrefab exists in `Assets/Prefabs/`
- ☐ ObstaclePrefab exists in `Assets/Prefabs/`
- ☐ SparkleParticle exists in `Assets/Prefabs/`

**Prefabs Assigned**:
- ☐ Spawner → Cube Prefab assigned
- ☐ ObjectPool → Cube Prefab assigned
- ☐ ObjectPool → Voxel Prefab assigned
- ☐ ExplosionEffect → Voxel Prefab assigned
- ☐ ExplosionEffect → Sparkle Particle assigned
- ☐ ObstacleManager → Obstacle Prefab assigned

**References Linked**:
- ☐ GameManager has all manager references
- ☐ LevelManager has Spawner and Wall references
- ☐ UIManager has all UI element references

**JSON Config**:
- ☐ `levels.json` exists in `Assets/Resources/Configs/`

### Testing Steps

1. **Press Play** in Unity Editor

2. **Check Console** for errors

3. **Test Controls**:
   - Arrow keys move cube left/right
   - Space launches cube
   - ESC pauses game

4. **Test Gameplay**:
   - Cubes spawn automatically
   - Cubes launch toward wall
   - Cubes stack with physics
   - 3+ matching cubes explode
   - Score increases on matches
   - Wall pushes forward

5. **Test Systems**:
   - Check Profiler: CPU should be reasonable
   - Check Memory: Object pools working (no continuous instantiation)
   - Check Physics: Voxels don't cause lag

### Common Issues

**Issue**: Cubes don't spawn
- **Fix**: Check Spawner → Cube Prefab is assigned
- **Fix**: Check ObjectPool → Cube Prefab is assigned

**Issue**: No explosions
- **Fix**: Check MatchDetector exists in scene
- **Fix**: Check ExplosionEffect → Voxel Prefab assigned

**Issue**: UI doesn't update
- **Fix**: Check UIManager references are assigned
- **Fix**: Check GameManager → UI Manager is assigned

**Issue**: Level doesn't load
- **Fix**: Verify `levels.json` is in `Assets/Resources/Configs/`
- **Fix**: Check LevelManager → Level Config Path is `Configs/levels`

**Issue**: Performance lag
- **Fix**: Reduce voxels per explosion
- **Fix**: Check voxel-voxel collisions are disabled
- **Fix**: Increase Max Active Voxels limit to use GPU particles

---

## Next Steps

After successful testing:

1. Create additional prefab variants
2. Add audio clips for explosions and collisions
3. Customize materials and visual effects
4. Adjust level difficulty in `levels.json`
5. Build and test standalone executable

## Resources

- [Unity Documentation](https://docs.unity3d.com/)
- [Main README](README.md)
- [GitHub Issues](https://github.com/your-repo/issues)

---

**Setup Complete! Start playing and iterating! 🎮**
