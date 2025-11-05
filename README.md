# Cubetris - Cube Tetris with Explosive Effects

A physics-based 3D puzzle game built in Unity where players launch colored cubes to create matching clusters that explode in spectacular voxel effects.

## Table of Contents

- [Overview](#overview)
- [Gameplay](#gameplay)
- [Project Structure](#project-structure)
- [Setup Instructions](#setup-instructions)
- [MCP Server Integration](#mcp-server-integration)
- [Architecture](#architecture)
- [Prefab Setup](#prefab-setup)
- [Configuration](#configuration)
- [Debug Features](#debug-features)
- [Performance](#performance)
- [Building](#building)

## Overview

**Cubetris** is a 3D physics-based puzzle game that combines elements of Tetris with match-3 mechanics. Players launch colored cubes down tracks toward a wall, creating stacks. When 3 or more adjacent cubes of the same color connect, they explode in a pixelated voxel effect, awarding points. Over time, the wall pushes forward, reducing space and increasing difficulty.

### Key Features

- **Physics-based gameplay** with realistic cube stacking
- **Grid-based match detection** using flood-fill algorithm
- **Pixelated voxel explosion effects** with particle systems
- **Object pooling** for optimal performance
- **20 progressive levels** with increasing difficulty
- **Obstacles and enemies** in advanced levels
- **Modular, clean architecture** for easy iteration
- **MCP server integration** for config management and analytics

## Gameplay

### Core Mechanics

1. **Spawning**: A cube appears at the spawn area with one of 5 colors
2. **Track Movement**: Use arrow keys (← →) or A/D to move between tracks
3. **Launching**: Press SPACE to launch the cube toward the wall
4. **Stacking**: Cubes stack naturally using Unity physics
5. **Matching**: When 3+ adjacent cubes of same color connect, they explode
6. **Scoring**: Earn points based on cluster size (larger = more points)
7. **Wall Push**: Wall slowly moves forward, reducing available space
8. **Game Over**: If cubes reach spawn area and block spawning

### Controls

- **Arrow Keys / A-D**: Move current cube left/right between tracks
- **SPACE**: Launch cube
- **ESC**: Pause game
- **R**: Restart level (debug)

### Difficulty Progression

Difficulty increases through 20 levels via:
- Wall speed and acceleration
- Number of tracks (6 to 16)
- Spawn rate (faster spawning)
- Obstacle probability
- Special cube mechanics

## Project Structure

```
Cubetris/
├── Assets/
│   ├── Scripts/
│   │   ├── Managers/
│   │   │   ├── GameManager.cs          # Core game state controller
│   │   │   └── LevelManager.cs         # Level loading and configuration
│   │   ├── Gameplay/
│   │   │   ├── Spawner.cs              # Cube spawning and launching
│   │   │   ├── CubeController.cs       # Individual cube behavior
│   │   │   └── WallController.cs       # Wall pushing mechanics
│   │   ├── Systems/
│   │   │   ├── MatchDetector.cs        # Grid-based match detection
│   │   │   ├── ExplosionEffect.cs      # Voxel explosion system
│   │   │   ├── VoxelController.cs      # Individual voxel behavior
│   │   │   └── ObjectPool.cs           # Object pooling system
│   │   ├── UI/
│   │   │   └── UIManager.cs            # UI and menu management
│   │   └── Obstacles/
│   │       ├── ObstacleController.cs   # Obstacle behavior
│   │       ├── ObstacleManager.cs      # Obstacle spawning
│   │       └── EnemyController.cs      # Enemy drone behavior
│   ├── Resources/
│   │   └── Configs/
│   │       └── levels.json             # 20-level configuration
│   ├── Prefabs/                        # Game object prefabs
│   ├── Materials/                      # Materials and physics materials
│   ├── Scenes/                         # Unity scenes
│   ├── Audio/                          # Sound effects
│   └── Particles/                      # Particle effects
└── README.md
```

## Setup Instructions

### Prerequisites

- **Unity 2021.3 LTS or higher**
- **C# 8+** support
- **Git** (for version control)

### Initial Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd Cubetris
   ```

2. **Open in Unity**:
   - Open Unity Hub
   - Click "Add" and select the Cubetris folder
   - Open the project (Unity will import assets)

3. **Create the main scene**:
   - Create a new scene: `Assets/Scenes/MainGame.unity`
   - Follow the [Scene Setup Guide](#scene-setup-guide) below

4. **Configure prefabs**:
   - Follow the [Prefab Setup](#prefab-setup) section

5. **Test**:
   - Press Play in Unity Editor
   - Verify gameplay mechanics work

## MCP Server Integration

### Overview

Cubetris is designed to integrate with an MCP (Multi-Client Protocol) server for:
- **Configuration management**: Remote level config updates
- **Analytics**: Score tracking and player statistics
- **High scores**: Leaderboard functionality
- **Build deployment**: Automated build distribution

### Configuration Files

All configuration files are stored in `Assets/Resources/Configs/` for easy access and hot-swapping:

```
Assets/Resources/Configs/
└── levels.json              # Level definitions (20 levels)
```

#### Levels Configuration

The `levels.json` file contains all 20 level definitions. Each level has:

```json
{
  "level": 1,                    // Level number (1-20)
  "trackCount": 6,               // Number of tracks (6-16)
  "wallSpeedStart": 0.02,        // Initial wall speed (units/sec)
  "wallSpeedRamp": 0.0,          // Speed increase per second
  "targetPoints": 100,           // Points needed to complete level
  "targetTime": 0,               // Time limit (0 = no limit)
  "obstacleProbability": 0.0,    // Chance of obstacle spawning (0-1)
  "specialCubeChance": 0.0,      // Chance of special cube (0-1)
  "spawnRate": 2.5               // Seconds between cube spawns
}
```

### MCP Server Endpoints

Implement these server-side endpoints for full integration:

#### 1. Configuration Management

**GET /api/config/levels**
- Returns: `levels.json` file
- Use: Client downloads latest level configuration

**POST /api/config/levels**
- Body: Updated `levels.json`
- Use: Admin updates level configuration
- Auth: Admin token required

#### 2. Analytics & Scoring

**POST /api/scores/submit**
```json
{
  "playerId": "string",
  "level": 1,
  "score": 1500,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

**GET /api/scores/leaderboard?level=1&limit=10**
- Returns: Top scores for specified level
- Use: Display leaderboards in-game

**POST /api/analytics/session**
```json
{
  "playerId": "string",
  "sessionId": "string",
  "events": [
    {
      "type": "cube_exploded",
      "data": { "color": "red", "clusterSize": 5 },
      "timestamp": "2024-01-01T12:00:00Z"
    }
  ]
}
```

### Client-Side Integration (To Implement)

Create `Assets/Scripts/Network/MCPClient.cs`:

```csharp
using UnityEngine;
using UnityEngine.Networking;
using System.Collections;

namespace Cubetris.Network
{
    public class MCPClient : MonoBehaviour
    {
        private const string BASE_URL = "https://your-mcp-server.com/api";

        // Download latest level config
        public IEnumerator DownloadLevelConfig()
        {
            using (UnityWebRequest request = UnityWebRequest.Get($"{BASE_URL}/config/levels"))
            {
                yield return request.SendWebRequest();

                if (request.result == UnityWebRequest.Result.Success)
                {
                    string json = request.downloadHandler.text;
                    // Save to Resources or use directly
                    System.IO.File.WriteAllText(
                        Application.dataPath + "/Resources/Configs/levels.json",
                        json
                    );
                }
            }
        }

        // Submit score
        public IEnumerator SubmitScore(int level, int score)
        {
            var data = new {
                playerId = SystemInfo.deviceUniqueIdentifier,
                level = level,
                score = score,
                timestamp = System.DateTime.UtcNow.ToString("o")
            };

            string json = JsonUtility.ToJson(data);

            using (UnityWebRequest request = UnityWebRequest.Post($"{BASE_URL}/scores/submit", json))
            {
                request.SetRequestHeader("Content-Type", "application/json");
                yield return request.SendWebRequest();

                if (request.result == UnityWebRequest.Result.Success)
                {
                    Debug.Log("Score submitted successfully");
                }
            }
        }
    }
}
```

### Build Pipeline Integration

#### Automated Builds

Create a Unity Editor script for automated builds:

```bash
# Build script location
Assets/Editor/BuildScript.cs
```

Example build command:
```bash
# Build for Windows
unity -quit -batchmode -projectPath . -executeMethod BuildScript.BuildWindows

# Build for macOS
unity -quit -batchmode -projectPath . -executeMethod BuildScript.BuildMacOS

# Build for Linux
unity -quit -batchmode -projectPath . -executeMethod BuildScript.BuildLinux
```

#### Config File Export

Before building, ensure config files are included:

1. Configs are in `Resources/Configs/` (automatically included in builds)
2. For external configs, copy to `StreamingAssets/`:
   ```bash
   cp Assets/Resources/Configs/levels.json Assets/StreamingAssets/
   ```

#### Post-Build Deployment

After building, upload to MCP server:

```bash
#!/bin/bash
# deploy.sh

BUILD_PATH="./Builds/Windows/Cubetris.exe"
MCP_SERVER="https://your-mcp-server.com"

# Upload build
curl -X POST -F "build=@${BUILD_PATH}" ${MCP_SERVER}/api/builds/upload

# Verify deployment
curl ${MCP_SERVER}/api/builds/latest
```

## Architecture

### Design Patterns

1. **Singleton Pattern**: GameManager, MatchDetector, ObjectPool, ExplosionEffect
2. **Object Pooling**: Cubes and voxels for performance
3. **Event System**: GameManager events for decoupled communication
4. **Component-Based**: Each GameObject has focused controllers
5. **Data-Driven**: JSON configuration for easy tuning

### Core Systems

#### GameManager
- Central state controller
- Coordinates all other managers
- Handles game lifecycle (start, pause, game over)
- Events for score, lives, state changes

#### LevelManager
- Loads level configs from JSON
- Applies parameters to game systems
- Manages level progression

#### MatchDetector
- Grid-based spatial indexing
- Flood-fill algorithm for cluster detection
- Triggers explosions for matches ≥ 3 cubes

#### ObjectPool
- Pre-allocates cubes and voxels
- Reuses objects for performance
- Configurable pool sizes

#### ExplosionEffect
- Spawns voxel particles
- Applies physics forces
- Manages voxel lifecycle

### Game Flow

```
Start Game
    ↓
Load Level Config → Apply to Systems
    ↓
Spawn Cube → Player Moves → Launch
    ↓
Cube Travels → Collision → Rest
    ↓
Register in Grid → Check Matches
    ↓
Match Found? → Yes → Explode → Award Points
    |              ↓
    No ←───────── Check Chain Reactions
    ↓
Wall Pushes Forward
    ↓
Reached Spawn? → Yes → Game Over
    |
    No → Continue (loop to Spawn Cube)
```

## Prefab Setup

### Required Prefabs

Create these prefabs in `Assets/Prefabs/`:

#### 1. Cube Prefab (`CubePrefab.prefab`)

**Components**:
- `BoxCollider` (size: 1, 1, 1)
- `Rigidbody`:
  - Mass: 1
  - Drag: 0.1
  - Angular Drag: 0.5
  - Collision Detection: Continuous
  - Interpolate: Interpolate
- `CubeController` script
- `MeshRenderer` with default material

**PhysicMaterial**:
- Create: `Assets/Materials/CubePhysicMaterial.physicMaterial`
  - Friction: 0.6
  - Bounciness: 0
  - Friction Combine: Average
  - Bounce Combine: Minimum

#### 2. Voxel Prefab (`VoxelPrefab.prefab`)

**Components**:
- `BoxCollider` (size: 0.1, 0.1, 0.1)
- `Rigidbody`:
  - Mass: 0.1
  - Drag: 0.5
  - Angular Drag: 0.5
  - Collision Detection: Discrete
- `VoxelController` script
- `MeshRenderer` with fade-capable material

**Scale**: 0.12 (12% of cube size)

#### 3. Wall Prefab (`Wall.prefab`)

**Components**:
- `BoxCollider` (size: 20, 10, 1) - adjust to cover all tracks
- `Rigidbody`:
  - Is Kinematic: true
- `WallController` script
- `MeshRenderer` with material

**Position**: (0, 0, 15) - far end of playfield

#### 4. Obstacle Prefab (`Obstacle.prefab`)

**Components**:
- `BoxCollider` (size: 0.8, 2, 0.8)
- `ObstacleController` script
- `MeshRenderer` with material

#### 5. Sparkle Particle (`SparkleParticle.prefab`)

**Components**:
- `ParticleSystem`:
  - Duration: 1
  - Start Lifetime: 0.5-1
  - Start Speed: 2-5
  - Start Size: 0.1-0.3
  - Emission: Burst of 20-30 particles
  - Shape: Sphere
  - Color over Lifetime: Fade out

### Scene Setup Guide

Create scene: `Assets/Scenes/MainGame.unity`

#### Hierarchy Structure

```
MainGame
├── GameManager (empty GameObject)
│   └── GameManager.cs
├── LevelManager (empty GameObject)
│   └── LevelManager.cs
├── UIManager (Canvas)
│   ├── UIManager.cs
│   ├── HUD Panel
│   ├── Main Menu Panel
│   ├── Pause Menu Panel
│   ├── Game Over Panel
│   └── Level Complete Panel
├── Spawner (empty GameObject at 0, 2, -10)
│   └── Spawner.cs
├── Wall (Cube)
│   └── WallController.cs
├── MatchDetector (empty GameObject)
│   └── MatchDetector.cs
├── ObjectPool (empty GameObject)
│   └── ObjectPool.cs
├── ExplosionEffect (empty GameObject)
│   └── ExplosionEffect.cs
├── ObstacleManager (empty GameObject)
│   └── ObstacleManager.cs
├── Main Camera
│   └── Position: (0, 8, -15), Rotation: (30, 0, 0)
├── Directional Light
│   └── Rotation: (50, -30, 0)
└── Playfield (Plane for visual reference)
    └── Scale: (2, 1, 2)
```

#### Inspector Configuration

**GameManager**:
- Assign all manager references
- Lives: 3
- Show Debug Info: ✓

**Spawner**:
- Track Count: 10
- Track Spacing: 1.0
- Spawn Rate: 2.0
- Launch Force: 15
- Cube Prefab: Assign CubePrefab
- Cube Colors: 5 colors (Red, Blue, Green, Yellow, Magenta)

**ObjectPool**:
- Cube Prefab: Assign CubePrefab
- Voxel Prefab: Assign VoxelPrefab
- Initial Cube Pool: 50
- Initial Voxel Pool: 100

**ExplosionEffect**:
- Voxel Prefab: Assign VoxelPrefab
- Voxels Per Explosion: 20
- Explosion Force: 5
- Sparkle Particle: Assign SparkleParticle prefab

**WallController**:
- Initial Position: Record starting Z position
- Game Over Z: -10
- Warning Distance: 5

## Configuration

### Physics Layers

Set up collision layers for optimization:

1. **Default**: General objects
2. **Cubes**: Player cubes
3. **Voxels**: Explosion voxels
4. **Wall**: Wall object
5. **Obstacles**: Obstacle objects

**Layer Collision Matrix**:
- Voxels ignore Voxels (reduce physics cost)
- Voxels ignore Obstacles
- Everything else interacts normally

### Physics Settings

Edit → Project Settings → Physics:
- Gravity: (0, -20, 0) - increased for faster cube settling
- Default Solver Iterations: 8
- Default Solver Velocity Iterations: 8
- Fixed Timestep: 0.02

### Tags

Create these tags:
- `Cube`
- `Wall`
- `Obstacle`
- `SpawnArea`
- `Voxel`

## Debug Features

### Debug Controls

- **R**: Restart level
- **ESC**: Pause/Resume

### Debug Toggles (GameManager Inspector)

- `showDebugInfo`: Enable gizmos and debug visualization
- `instantWallMove`: Speed up wall 10x for testing
- `spawnRateOverride`: Override spawn rate (-1 = use level default)

### Gizmos

When `showDebugInfo` is enabled:
- **Spawner**: Shows all track positions (cyan), current track (yellow)
- **WallController**: Shows game over line (red), warning zone (yellow)
- **MatchDetector**: Shows occupied grid cells with cube colors

### Console Logging

All major systems log important events:
- Cube spawning and launching
- Match detection and explosions
- Score updates
- Level transitions
- Game state changes

## Performance

### Optimization Techniques

1. **Object Pooling**:
   - Pre-allocate 50 cubes, 100 voxels
   - Reuse instead of instantiate/destroy
   - Configurable pool sizes

2. **Physics Optimization**:
   - Voxels ignore voxels (collision matrix)
   - Continuous collision only on cubes
   - Discrete collision on voxels
   - Sleep physics when cubes at rest

3. **Voxel Limiting**:
   - Max 200 active voxels
   - Switch to GPU particles when limit reached
   - Automatic voxel destruction after lifetime

4. **Material Property Blocks**:
   - No material instances created
   - Efficient color changes
   - No additional draw calls

5. **Grid-Based Detection**:
   - O(n) flood-fill instead of O(n²) checks
   - Only check resting cubes
   - Deferred match checking

### Target Performance

- **60 FPS** on mid-range desktop (GTX 1060 / RX 580)
- **30 FPS** on low-end laptop (integrated graphics)
- **Max 200 active physics objects** simultaneously
- **Memory**: < 500MB RAM usage

### Performance Monitoring

Monitor in Unity Profiler:
- Physics: Should be < 5ms per frame
- Rendering: Should be < 10ms per frame
- GC Alloc: Should be near zero during gameplay

## Building

### Build Settings

File → Build Settings:

**Platform**: Windows / macOS / Linux
**Architecture**: x86_64
**Development Build**: ✓ (for testing)

**Scenes in Build**:
1. MainGame.unity

### Build Configurations

#### Development Build
```
Target: Testing
- Development Build: ✓
- Script Debugging: ✓
- Deep Profiling Support: ✓
```

#### Release Build
```
Target: Distribution
- Development Build: ✗
- Script Debugging: ✗
- Compression Method: LZ4HC
- Code Stripping: Enabled
```

### Build Locations

```
Builds/
├── Windows/
│   └── Cubetris.exe
├── macOS/
│   └── Cubetris.app
└── Linux/
    └── Cubetris.x86_64
```

### Build Commands (Command Line)

```bash
# Windows
unity -quit -batchmode -projectPath . -buildWindows64Player ./Builds/Windows/Cubetris.exe

# macOS
unity -quit -batchmode -projectPath . -buildOSXUniversalPlayer ./Builds/macOS/Cubetris.app

# Linux
unity -quit -batchmode -projectPath . -buildLinux64Player ./Builds/Linux/Cubetris.x86_64
```

## Development Roadmap

### MVP (Current)
- ✅ Core gameplay mechanics
- ✅ Physics-based stacking
- ✅ Grid-based match detection
- ✅ Voxel explosion effects
- ✅ 20 level configurations
- ✅ Object pooling
- ✅ Basic obstacles

### Phase 2 (Next Steps)
- [ ] Complete UI implementation
- [ ] Audio system (SFX and music)
- [ ] Enhanced particle effects
- [ ] Special cube types
- [ ] Power-ups
- [ ] Tutorial system

### Phase 3 (Future)
- [ ] MCP client implementation
- [ ] Leaderboards
- [ ] Analytics integration
- [ ] Replay system
- [ ] Level editor
- [ ] Workshop integration

## Contributing

### Code Style

- Use C# naming conventions
- Namespace: `Cubetris`
- Comments: XML documentation for public methods
- Regions: Use for large classes

### Testing

Before committing:
1. Test all 20 levels
2. Check for memory leaks
3. Profile performance
4. Verify pooling works
5. Test game over conditions

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/your-feature

# Make changes and commit
git add .
git commit -m "Add: description"

# Push and create PR
git push origin feature/your-feature
```

## License

[Your License Here]

## Credits

Developed by: [Your Name/Team]
Unity Version: 2021.3 LTS
Engine: Unity Engine

## Support

For issues and feature requests, please use the issue tracker or contact the development team.

---

**Happy Building! 🎮**
