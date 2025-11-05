# Cubetris - Project Structure & Architecture

Complete reference for the Cubetris codebase organization and architecture.

## Directory Structure

```
Cubetris/
│
├── Assets/                          # Unity assets folder
│   │
│   ├── Scripts/                     # All C# scripts
│   │   ├── Managers/                # Core management systems
│   │   │   ├── GameManager.cs       # Main game state controller (Singleton)
│   │   │   └── LevelManager.cs      # Level loading and configuration
│   │   │
│   │   ├── Gameplay/                # Core gameplay mechanics
│   │   │   ├── Spawner.cs           # Cube spawning and track movement
│   │   │   ├── CubeController.cs    # Individual cube behavior and state
│   │   │   └── WallController.cs    # Wall pushing mechanic
│   │   │
│   │   ├── Systems/                 # Game systems
│   │   │   ├── MatchDetector.cs     # Grid-based cluster detection (Singleton)
│   │   │   ├── ExplosionEffect.cs   # Voxel explosion manager (Singleton)
│   │   │   ├── VoxelController.cs   # Individual voxel behavior
│   │   │   └── ObjectPool.cs        # Object pooling system (Singleton)
│   │   │
│   │   ├── UI/                      # User interface
│   │   │   └── UIManager.cs         # UI controller and updates
│   │   │
│   │   └── Obstacles/               # Obstacle and enemy systems
│   │       ├── ObstacleController.cs # Individual obstacle behavior
│   │       ├── ObstacleManager.cs   # Obstacle spawning and management
│   │       └── EnemyController.cs   # Enemy drone behavior
│   │
│   ├── Resources/                   # Unity Resources (loaded at runtime)
│   │   └── Configs/                 # Configuration files
│   │       └── levels.json          # 20-level configuration data
│   │
│   ├── Prefabs/                     # GameObject prefabs (to be created)
│   │   ├── CubePrefab.prefab        # Main game cube
│   │   ├── VoxelPrefab.prefab       # Explosion voxel particle
│   │   ├── ObstaclePrefab.prefab    # Track obstacle
│   │   └── SparkleParticle.prefab   # Particle effect for explosions
│   │
│   ├── Materials/                   # Materials and physics materials
│   │   ├── CubeMaterial.mat         # Cube material (color via property block)
│   │   ├── VoxelMaterial.mat        # Voxel material (transparent)
│   │   ├── WallMaterial.mat         # Wall material
│   │   └── CubePhysicMaterial.physicMaterial  # Physics properties
│   │
│   ├── Scenes/                      # Unity scenes
│   │   └── MainGame.unity           # Main gameplay scene
│   │
│   ├── Audio/                       # Audio files (to be added)
│   │   ├── SFX/                     # Sound effects
│   │   │   ├── explosion.wav
│   │   │   ├── cube_land.wav
│   │   │   └── match.wav
│   │   └── Music/                   # Background music
│   │
│   └── Particles/                   # Particle system prefabs
│       └── SparkleEffect.prefab
│
├── ProjectSettings/                 # Unity project settings (auto-generated)
│
├── Builds/                          # Build outputs (gitignored)
│   ├── Windows/
│   ├── macOS/
│   └── Linux/
│
├── Documentation/                   # Additional documentation
│
├── .gitignore                       # Git ignore rules
├── README.md                        # Main documentation
├── UNITY_SETUP_GUIDE.md            # Detailed Unity setup
├── QUICK_START.md                  # Quick reference
└── PROJECT_STRUCTURE.md            # This file
```

## Script Architecture

### Core Systems (Singletons)

These systems use the Singleton pattern for global access:

```
GameManager (Instance)
    ├── Manages: Game state, lifecycle, coordination
    └── Events: OnScoreChanged, OnLivesChanged, OnGameStateChanged

MatchDetector (Instance)
    ├── Manages: Grid storage, match detection
    └── Algorithm: Flood-fill for cluster detection

ObjectPool (Instance)
    ├── Manages: Cube and voxel pooling
    └── Pools: Separate queues for cubes and voxels

ExplosionEffect (Instance)
    └── Manages: Voxel spawning, particle effects, audio
```

### Component-Based Systems

These are attached to GameObjects:

```
LevelManager
    ├── Loads: JSON level configurations
    └── Applies: Parameters to Spawner and WallController

Spawner
    ├── Handles: Cube spawning, track movement, launching
    └── Input: Arrow keys, Space bar

CubeController (per cube)
    ├── Tracks: Color, state, grid position
    └── Lifecycle: Spawn → Launch → Travel → Rest → Match

WallController
    ├── Moves: Forward over time
    └── Triggers: Game over when reaching spawn

UIManager
    └── Updates: HUD, menus, game state displays

ObstacleManager
    └── Spawns: Obstacles and enemies based on probability
```

## Data Flow

### Spawning Flow

```
Spawner
    ↓ Request cube
ObjectPool
    ↓ Get/Create cube
CubeController
    ↓ Initialize(color)
Spawner
    ↓ Position on track
Player Input (Arrow keys)
    ↓ Move between tracks
Player Input (Space)
    ↓ Launch cube
CubeController
    ↓ Enable physics, apply force
```

### Matching Flow

```
CubeController (at rest)
    ↓ Register in grid
MatchDetector
    ↓ Flood-fill search
MatchDetector
    ↓ Found cluster ≥ 3?
    ├─ Yes → ProcessMatch()
    │         ↓
    │     Award points
    │         ↓
    │     Trigger explosions
    │         ↓
    │     ExplosionEffect
    │         ↓
    │     Spawn voxels
    │         ↓
    │     Check chain reactions
    │
    └─ No → Continue
```

### Explosion Flow

```
MatchDetector
    ↓ ProcessMatch(cluster)
CubeController.Explode()
    ↓ Unregister from grid
ExplosionEffect.CreateExplosion()
    ↓ Spawn N voxels from pool
VoxelController (per voxel)
    ↓ Apply physics force
    ↓ Fade over lifetime
    ↓ Return to pool
```

## Class Relationships

### Dependency Graph

```
GameManager
    ├── → LevelManager
    ├── → UIManager
    ├── → Spawner
    ├── → WallController
    └── → MatchDetector

LevelManager
    ├── → Spawner (applies config)
    └── → WallController (applies config)

Spawner
    ├── → ObjectPool (get cubes)
    └── → CubeController (initialize)

CubeController
    ├── → MatchDetector (register/check)
    └── → ExplosionEffect (trigger explosion)

MatchDetector
    └── → CubeController (cluster members)

ExplosionEffect
    ├── → ObjectPool (get voxels)
    └── → VoxelController (initialize)

ObstacleManager
    └── → ObstacleController (spawn)
```

### Singleton Access Pattern

```csharp
// Any script can access singletons via Instance property
if (GameManager.Instance != null)
{
    GameManager.Instance.AddScore(100);
}

if (ObjectPool.Instance != null)
{
    GameObject cube = ObjectPool.Instance.GetCube();
}
```

## Configuration System

### Level Configuration (JSON)

**Location**: `Assets/Resources/Configs/levels.json`

**Structure**:
```json
[
  {
    "level": 1,
    "trackCount": 6,
    "wallSpeedStart": 0.02,
    "wallSpeedRamp": 0.0,
    "targetPoints": 100,
    "targetTime": 0,
    "obstacleProbability": 0.0,
    "specialCubeChance": 0.0,
    "spawnRate": 2.5
  }
]
```

**Loading**:
```csharp
// LevelManager loads from Resources folder
TextAsset jsonFile = Resources.Load<TextAsset>("Configs/levels");
```

### Runtime Configuration

Configurable via Inspector (debugging):
- `GameManager.showDebugInfo` - Enable gizmos
- `GameManager.instantWallMove` - 10x wall speed
- `GameManager.spawnRateOverride` - Override spawn timing

## Event System

### GameManager Events

```csharp
public event Action<int> OnScoreChanged;
public event Action<int> OnLivesChanged;
public event Action<GameState> OnGameStateChanged;
public event Action OnGameOver;
public event Action OnLevelComplete;
```

**Usage**:
```csharp
// Subscribe
GameManager.Instance.OnScoreChanged += UpdateScoreDisplay;

// Unsubscribe (important!)
GameManager.Instance.OnScoreChanged -= UpdateScoreDisplay;
```

### VoxelController Events

```csharp
public event Action OnVoxelDestroyed;
```

## Performance Architecture

### Object Pooling Strategy

```
Initial Pool Sizes:
- Cubes: 50 (max 200)
- Voxels: 100 (max 500)

Pool Operations:
1. Pre-allocate on Awake()
2. Get() → Return from queue or create new
3. Return() → Reset and enqueue
4. Track active objects in HashSet
```

### Physics Optimization

```
Collision Layers:
- Cubes use Continuous detection
- Voxels use Discrete detection
- Voxels ignore other voxels (collision matrix)

Physics Sleeping:
- Cubes sleep when velocity < threshold
- Sleeping cubes registered in grid
```

### Voxel Performance

```
Strategy:
1. Limit active voxels to 200
2. When limit reached → Switch to GPU particles
3. Voxels auto-destroy after lifetime
4. Fade-out reduces visual pop

Performance Budget:
- Each explosion: 20 voxels × 0.1kg = 2kg total
- Max physics cost: 200 voxels = 20 explosions max
```

## Grid System

### Spatial Indexing

```
Grid Representation:
Dictionary<Vector2Int, CubeController>

Key: (trackIndex, heightIndex)
Value: CubeController reference

Conversion:
World Position → Grid Position
    x = Round(worldX / cellSize)
    y = Round(worldY / cellSize)

Grid Position → World Position
    worldX = gridX * cellSize
    worldY = gridY * cellSize
```

### Match Detection Algorithm

```
FloodFill(position, targetColor):
    1. Check if already visited → return
    2. Check if position has cube → return if not
    3. Check if color matches → return if not
    4. Add to visited set and cluster list
    5. Recursively check 4 neighbors (left, right, up, down)
    6. If cluster.Count ≥ minMatchSize → ProcessMatch()
```

### Neighbor Checking

```
4-Directional (Current):
- Left:  position + (-1, 0)
- Right: position + (1, 0)
- Up:    position + (0, 1)
- Down:  position + (0, -1)

8-Directional (Optional):
+ Diagonals:
  - position + (-1, 1)
  - position + (1, 1)
  - position + (-1, -1)
  - position + (1, -1)
```

## State Management

### Game States

```csharp
public enum GameState
{
    Menu,           // Main menu, not playing
    Playing,        // Active gameplay
    Paused,         // Game paused
    LevelComplete,  // Level finished successfully
    GameOver        // Lost all lives or wall reached spawn
}
```

### State Transitions

```
Menu
  ├→ StartGame() → Playing

Playing
  ├→ TogglePause() → Paused
  ├→ CompleteLevel() → LevelComplete
  └→ TriggerGameOver() → GameOver

Paused
  └→ TogglePause() → Playing

LevelComplete
  ├→ LoadNextLevel() → Playing
  └→ RestartLevel() → Playing

GameOver
  └→ RestartLevel() → Playing
```

## Extension Points

### Adding New Cube Types

1. Add to `CubeColorType` enum
2. Add color to `Spawner.cubeColors` array
3. Update `MatchDetector` if special matching rules needed
4. Add visual differentiation (materials/effects)

### Adding New Obstacles

1. Create prefab with `ObstacleController`
2. Assign to `ObstacleManager.obstaclePrefab`
3. Implement custom behavior in `ObstacleController`
4. Adjust spawn probability in level config

### Adding New Levels

1. Edit `Assets/Resources/Configs/levels.json`
2. Add new level object with parameters
3. Test difficulty progression
4. Adjust `LevelManager.TotalLevels` if needed

### Adding Audio

1. Import audio clips to `Assets/Audio/`
2. Add `AudioSource` to appropriate GameObjects
3. Reference clips in Inspector
4. Call `AudioSource.PlayOneShot()` on events

### Adding Special Effects

1. Create particle system prefab
2. Assign to `ExplosionEffect.sparkleParticlePrefab`
3. Or create new effect manager for specific effect
4. Trigger on appropriate game events

## Code Style Guide

### Naming Conventions

```csharp
// Public fields (Inspector-exposed)
[SerializeField] private int trackCount = 10;

// Private fields
private bool isActive = false;

// Properties
public int CurrentScore { get; private set; }

// Methods
public void AddScore(int points) { }
private void UpdateState() { }

// Events
public event Action<int> OnScoreChanged;

// Constants
private const float MAX_SPEED = 10f;
```

### Namespace

All scripts use namespace `Cubetris`:

```csharp
namespace Cubetris
{
    public class MyClass : MonoBehaviour
    {
        // ...
    }
}
```

### Comments

Use XML documentation for public methods:

```csharp
/// <summary>
/// Launch the current cube forward with force.
/// </summary>
public void LaunchCube()
{
    // Implementation
}
```

## Testing Strategy

### Unit Testing (Future)

Create tests for:
- Grid position conversion
- Match detection algorithm
- Object pool get/return logic
- Score calculation

### Integration Testing

Test scenarios:
1. Spawn → Launch → Stack → Match → Explode
2. Wall push → Game Over trigger
3. Level complete → Load next level
4. Obstacle spawn → Block track
5. Pool exhaustion → Create new vs. fail gracefully

### Performance Testing

Monitor in Unity Profiler:
- Frame time < 16.67ms (60 FPS)
- GC allocations during gameplay
- Physics step time
- Active rigidbody count

## Build Variants

### Debug Build
- Development Build: ✓
- Script Debugging: ✓
- Deep Profiling: ✓
- Logging: Verbose

### Release Build
- Development Build: ✗
- Code Stripping: ✓
- Compression: LZ4HC
- Logging: Errors only

### Profile Build
- Development Build: ✓
- Autoconnect Profiler: ✓
- Deep Profiling: ✗
- Logging: Warnings

---

**This document provides a complete reference for navigating and extending the Cubetris codebase.**
