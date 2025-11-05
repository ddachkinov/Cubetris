# Cubetris - Quick Start Guide

Get up and running with Cubetris in 15 minutes.

## Prerequisites

- Unity 2021.3 LTS or higher installed
- Git (for cloning)
- Basic Unity knowledge

## Quick Setup (5 steps)

### 1. Clone and Open (2 min)

```bash
git clone <repository-url>
cd Cubetris
```

Open Unity Hub → Add → Select Cubetris folder → Open

### 2. Verify Folder Structure (1 min)

Check that these folders exist:
```
Assets/
├── Scripts/      ✓
├── Resources/    ✓
│   └── Configs/
│       └── levels.json  ✓
├── Prefabs/      ✓
├── Materials/    ✓
└── Scenes/       ✓
```

### 3. Create Scene (5 min)

Follow the fast-track scene setup:

**A. Create Core Objects** (drag scripts onto empty GameObjects):
- GameManager (+ GameManager.cs)
- LevelManager (+ LevelManager.cs)
- MatchDetector (+ MatchDetector.cs)
- ObjectPool (+ ObjectPool.cs)
- ExplosionEffect (+ ExplosionEffect.cs)
- ObstacleManager (+ ObstacleManager.cs)

**B. Create Gameplay Objects**:
- Spawner at (0, 2, -10) + Spawner.cs
- Wall (Cube) at (0, 5, 15), scale (20, 10, 1) + WallController.cs + Rigidbody (kinematic)
- Main Camera at (0, 10, -10), rotation (40, 0, 0)

**C. Save Scene**: `Assets/Scenes/MainGame.unity`

### 4. Create Essential Prefabs (5 min)

**CubePrefab**:
1. Create Cube
2. Add Rigidbody (mass: 1, continuous collision)
3. Add CubeController script
4. Drag to `Assets/Prefabs/CubePrefab`
5. Delete from scene

**VoxelPrefab**:
1. Create Cube, scale to (0.12, 0.12, 0.12)
2. Add Rigidbody (mass: 0.1, discrete collision)
3. Add VoxelController script
4. Drag to `Assets/Prefabs/VoxelPrefab`
5. Delete from scene

### 5. Link Everything (2 min)

**Spawner**:
- Cube Prefab → CubePrefab
- Track Count: 10
- Cube Colors: Add 5 colors (Red, Blue, Green, Yellow, Magenta)

**ObjectPool**:
- Cube Prefab → CubePrefab
- Voxel Prefab → VoxelPrefab

**ExplosionEffect**:
- Voxel Prefab → VoxelPrefab

**GameManager**:
- Assign all manager references (drag from Hierarchy)

**LevelManager**:
- Spawner → Spawner
- Wall Controller → Wall

## Press Play!

If everything is correct:
- ✓ Cube spawns in front of camera
- ✓ Arrow keys move it left/right
- ✓ Space launches it forward
- ✓ Console shows "Game Started!"

## Troubleshooting

### No cube spawns
→ Check: Spawner → Cube Prefab is assigned
→ Check: ObjectPool → Cube Prefab is assigned

### Cube doesn't move
→ Check: Spawner position is (0, 2, -10)
→ Check: Game is playing (press Play button)

### Can't see anything
→ Check: Camera position (0, 10, -10), rotation (40, 0, 0)
→ Check: Wall position (0, 5, 15)

### Console errors
→ Check: All scripts are in correct folders
→ Check: `levels.json` exists in `Assets/Resources/Configs/`

## Next Steps

**Minimal UI** (Optional for MVP):
1. Create Canvas
2. Add TextMeshPro text for score
3. Assign to UIManager

**Full Setup**:
→ See [UNITY_SETUP_GUIDE.md](UNITY_SETUP_GUIDE.md)

**Development**:
→ See [README.md](README.md)

## Controls

- **←/→ or A/D**: Move cube between tracks
- **SPACE**: Launch cube
- **ESC**: Pause
- **R**: Restart (debug)

## Testing Checklist

After setup, test these:

- [ ] Cube spawns automatically
- [ ] Arrow keys move cube left/right
- [ ] Space launches cube toward wall
- [ ] Cubes stack on collision
- [ ] Wall slowly moves forward
- [ ] Console shows "Loaded X levels"

## Common Mistakes

1. **Forgot to assign prefabs** → Check all "None (GameObject)" in Inspector
2. **Scripts not attached** → Each GameObject needs its script component
3. **Wrong positions** → Spawner at -10, Wall at +15 on Z-axis
4. **Missing levels.json** → Must be in `Resources/Configs/`
5. **No references linked** → GameManager needs all manager references

## Advanced: Full Feature Test

Once basic test works, verify:

- [ ] Match detection (launch 3+ same color cubes adjacent)
- [ ] Explosions (voxels spawn and fade)
- [ ] Score updates (Console shows points)
- [ ] Wall reaches spawn → Game Over
- [ ] Level progression (reach target points)

## Performance Check

Open Window → Analysis → Profiler while playing:

**Good Performance**:
- CPU: < 20ms per frame
- Physics: < 5ms per frame
- GC Alloc: Near 0 during gameplay

**If performance is bad**:
1. Reduce voxels per explosion (ExplosionEffect → 10 instead of 20)
2. Check voxel-voxel collisions disabled (Edit → Project Settings → Physics → Layer Collision Matrix)
3. Reduce max active voxels (ExplosionEffect → 100 instead of 200)

## Getting Help

**Issue**: Setup not working
→ Check [UNITY_SETUP_GUIDE.md](UNITY_SETUP_GUIDE.md) for detailed steps

**Issue**: Gameplay bugs
→ Enable Debug Info (GameManager → Show Debug Info ✓)
→ Check Console for error messages

**Issue**: Performance problems
→ See Performance section in [README.md](README.md)

**Issue**: Build problems
→ See Building section in [README.md](README.md)

## Minimal Working Configuration

Absolute minimum to see something work:

```
Scene Objects (Required):
- GameManager + script
- Spawner + script (with CubePrefab assigned)
- ObjectPool + script (with CubePrefab assigned)
- Main Camera

Prefabs (Required):
- CubePrefab (Cube + Rigidbody + CubeController)

Config (Required):
- Assets/Resources/Configs/levels.json
```

Everything else can be added incrementally.

## Development Workflow

1. **Make changes** to scripts
2. **Save** (Ctrl+S)
3. **Switch to Unity** (auto-recompile)
4. **Press Play** to test
5. **Check Console** for errors
6. **Iterate**

## Tips

- Use **Gizmos** (GameManager → Show Debug Info) to visualize tracks
- Press **R** during gameplay to quick restart
- Check **Profiler** regularly to catch performance issues early
- Commit often to git (small changes)
- Test each system in isolation before integrating

---

**You're ready to go! Have fun building Cubetris! 🎮**
