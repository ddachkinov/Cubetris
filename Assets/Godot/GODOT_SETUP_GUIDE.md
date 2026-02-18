# Cubetris — Godot 4 Setup Guide

Complete guide to get Cubetris running in Godot 4.

---

## Prerequisites

- **Godot 4.2+** (download from https://godotengine.org)
- **No plugins required** — pure GDScript, no C# needed

---

## 1 — Open the Project

1. Launch Godot 4
2. Click **Import** → navigate to `Assets/Godot/` → select `project.godot`
3. Click **Import & Edit**

Godot will import all assets automatically.

---

## 2 — Autoloads (already configured in project.godot)

The following singletons are pre-registered in `project.godot`:

| Singleton       | Script                                    |
|-----------------|-------------------------------------------|
| `GameManager`   | `Scripts/Managers/GameManager.gd`         |
| `LevelManager`  | `Scripts/Managers/LevelManager.gd`        |
| `MatchDetector` | `Scripts/Systems/MatchDetector.gd`        |
| `ObjectPool`    | `Scripts/Systems/ObjectPool.gd`           |
| `ExplosionEffect` | `Scripts/Systems/ExplosionEffect.gd`    |

Verify via **Project → Project Settings → Autoload**.

---

## 3 — Create Scenes

### 3a — CubePrefab.tscn

```
RigidBody3D  (script: CubeController.gd)
└── MeshInstance3D   (BoxMesh, size 1×1×1)
└── CollisionShape3D (BoxShape3D, size 1×1×1)
```

**RigidBody3D settings:**
- Mass: `1.0`
- Gravity Scale: `1.0`
- Continuous CD: `On`
- Contact Monitor: `On`
- Max Contacts: `4`

Save as `Scenes/CubePrefab.tscn`

---

### 3b — VoxelPrefab.tscn

```
RigidBody3D  (script: VoxelController.gd)
└── MeshInstance3D   (BoxMesh, size 1×1×1)
└── CollisionShape3D (BoxShape3D, size 1×1×1)
```

**RigidBody3D settings:**
- Mass: `0.1`
- Linear Damp: `0.5`
- Angular Damp: `0.5`

**Node3D scale:** `(0.12, 0.12, 0.12)`

Save as `Scenes/VoxelPrefab.tscn`

---

### 3c — MainGame.tscn

Create a **Node3D** as root, save as `Scenes/MainGame.tscn`.

Build this hierarchy:

```
Node3D  (MainGame)
├── Camera3D
│     position (0, 10, -12)
│     rotation_degrees (40, 0, 0)
│     fov 60
│
├── DirectionalLight3D
│     rotation_degrees (50, -30, 0)
│
├── Spawner  (Node3D)           ← script: Spawner.gd
│     position (0, 2, -10)
│
├── Wall  (StaticBody3D)        ← add WallController.gd here
│   ├── MeshInstance3D  (BoxMesh 20×10×1)
│   └── CollisionShape3D
│     position (0, 5, 15)
│
├── Playfield  (MeshInstance3D) ← PlaneMesh, scale (2,1,2), pos (0,0,5)
│
├── ObstacleManager  (Node3D)   ← script: ObstacleManager.gd
│
└── UICanvas  (CanvasLayer)     ← script: UIManager.gd
    ├── HUDPanel (Control)
    │   ├── ScoreLabel
    │   ├── LivesLabel
    │   ├── LevelLabel
    │   ├── TargetLabel
    │   └── NextCubePreview (ColorRect)
    ├── MainMenuPanel (Control)
    │   ├── TitleLabel
    │   └── StartButton   → UIManager.on_start_game_pressed()
    ├── PauseMenuPanel (Control, hidden)
    │   ├── ResumeButton  → UIManager.on_resume_pressed()
    │   └── RestartButton → UIManager.on_restart_pressed()
    ├── GameOverPanel (Control, hidden)
    │   ├── FinalScoreLabel
    │   └── RestartButton → UIManager.on_restart_pressed()
    └── LevelCompletePanel (Control, hidden)
        ├── LevelCompleteScoreLabel
        └── NextLevelButton → UIManager.on_next_level_pressed()
```

---

## 4 — Assign Inspector Properties

### Spawner (Node3D)
| Property          | Value              |
|-------------------|--------------------|
| Cube Scene        | CubePrefab.tscn    |
| Track Count       | 10                 |
| Track Spacing     | 1.0                |
| Spawn Height      | 2.0                |
| Spawn Z           | -10.0              |
| Launch Force      | 15.0               |
| Spawn Rate        | 2.0                |
| Cube Colors       | 5 colors (see below) |

**Cube Colors array:**
- [0] `Color(1,0,0)` Red
- [1] `Color(0,0,1)` Blue
- [2] `Color(0,1,0)` Green
- [3] `Color(1,1,0)` Yellow
- [4] `Color(1,0,1)` Magenta

### ObjectPool (Autoload Inspector)
| Property               | Value           |
|------------------------|-----------------|
| Cube Scene             | CubePrefab.tscn |
| Voxel Scene            | VoxelPrefab.tscn|
| Initial Cube Pool Size | 50              |
| Initial Voxel Pool Size| 100             |
| Max Cube Pool Size     | 200             |
| Max Voxel Pool Size    | 500             |

### ExplosionEffect (Autoload Inspector)
| Property             | Value            |
|----------------------|------------------|
| Voxels Per Explosion | 20               |
| Voxel Scale          | 0.12             |
| Voxel Lifetime       | 2.0              |
| Explosion Force      | 5.0              |
| Max Active Voxels    | 200              |

### WallController (on Wall StaticBody3D)
| Property         | Value  |
|------------------|--------|
| Wall Speed Start | 0.02   |
| Game Over Z      | -10.0  |
| Warning Distance | 5.0    |

### UIManager (on UICanvas CanvasLayer)
Assign all `@export` node references by dragging from the scene tree.

---

## 5 — Physics Layers

Go to **Project → Project Settings → Layer Names → 3D Physics**:

| Layer | Name       |
|-------|------------|
| 1     | Default    |
| 2     | Cubes      |
| 3     | Voxels     |
| 4     | Wall       |
| 5     | Obstacles  |

**In CubePrefab:** collision_layer = 2, collision_mask = 1|4
**In VoxelPrefab:** collision_layer = 3, collision_mask = 1 (voxels ignore each other)
**Wall:** collision_layer = 4, collision_mask = 2

---

## 6 — Input Map (already in project.godot)

| Action       | Key            |
|--------------|----------------|
| `move_left`  | A / Left Arrow |
| `move_right` | D / Right Arrow|
| `launch`     | Space          |
| `pause`      | Escape         |
| `restart`    | R              |

Verify at **Project → Project Settings → Input Map**.

---

## 7 — Press Play ▶

If everything is wired correctly:
- Cube appears at spawn area
- A/D or arrows move it between tracks
- Space launches it toward the wall
- Cubes stack with physics
- 3+ same-color cubes explode
- Score increases
- Wall slowly advances

---

## Key GDScript ↔ Unity C# Differences

| Unity C#                         | Godot GDScript                        |
|----------------------------------|---------------------------------------|
| `MonoBehaviour`                  | `extends Node3D` / `extends Node`     |
| `[SerializeField]`               | `@export`                             |
| `GetComponent<T>()`              | `$NodeName` or `get_node()`           |
| `Rigidbody`                      | `RigidBody3D`                         |
| `rb.AddForce()`                  | `rb.apply_central_impulse()`          |
| `rb.velocity`                    | `rb.linear_velocity`                  |
| `rb.isKinematic`                 | `rb.freeze`                           |
| `StartCoroutine()`               | `await get_tree().create_timer().timeout` |
| `event Action<T> OnX`            | `signal x(value: T)`                  |
| `OnX?.Invoke(val)`               | `x.emit(val)`                         |
| `Instantiate(prefab)`            | `scene.instantiate()`                 |
| `Destroy(obj)`                   | `obj.queue_free()`                    |
| `DontDestroyOnLoad`              | Autoload (singleton node)             |
| `Time.time`                      | `Time.get_ticks_msec() / 1000.0`      |
| `Debug.Log()`                    | `print()`                             |
| `Physics.OverlapBox()`           | `PhysicsDirectSpaceState3D.intersect_box()` |

---

## File Reference

```
Assets/Godot/
├── project.godot
├── Scripts/
│   ├── Managers/
│   │   ├── GameManager.gd       # Autoload — state, score, lives
│   │   └── LevelManager.gd      # Autoload — JSON level loading
│   ├── Gameplay/
│   │   ├── Spawner.gd           # Track movement + launching
│   │   ├── CubeController.gd    # Per-cube physics + grid
│   │   └── WallController.gd    # Wall push + game-over
│   ├── Systems/
│   │   ├── MatchDetector.gd     # Autoload — flood-fill detection
│   │   ├── ObjectPool.gd        # Autoload — cube/voxel pooling
│   │   ├── ExplosionEffect.gd   # Autoload — voxel explosions
│   │   └── VoxelController.gd   # Per-voxel fade + lifetime
│   ├── UI/
│   │   └── UIManager.gd         # HUD + panels + button callbacks
│   └── Obstacles/
│       ├── ObstacleController.gd
│       ├── ObstacleManager.gd
│       └── EnemyController.gd
├── Scenes/                      # Create: MainGame.tscn, CubePrefab.tscn, VoxelPrefab.tscn
├── Resources/
│   └── Configs/
│       └── levels.json          # 20 levels — same as Unity version
└── GODOT_SETUP_GUIDE.md
```

---

## Export for Desktop (Steam-ready)

1. **Project → Export**
2. Add preset: **Windows Desktop** (or macOS / Linux)
3. Set export path: `../../Builds/Windows/Cubetris.exe`
4. Click **Export Project**

For Steam, install the **GodotSteam** plugin:
```
https://godotsteam.com
```
Then follow GodotSteam's quickstart guide — it mirrors the Steamworks.NET pattern from the Unity roadmap.

---

*Good luck! The Godot port uses identical game logic to the Unity version — only the engine API differs.* 🎮
