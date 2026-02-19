extends Node3D

## ObstacleManager — spawns obstacles and enemies based on level probability.

# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------
@export var obstacle_scene: PackedScene
@export var enemy_scene:    PackedScene

@export var spawn_interval:   float = 10.0
@export var obstacle_duration: float = 5.0
@export var enemy_interval:   float = 20.0

# Probability is updated from LevelManager each level
var obstacle_probability: float = 0.0
var enemy_probability:    float = 0.0

# ---------------------------------------------------------------------------
# Internal
# ---------------------------------------------------------------------------
var _active_obstacles: Array[Node3D] = []
var _is_spawning: bool = false

var _obstacle_timer: float = 0.0
var _enemy_timer:    float = 0.0

# ---------------------------------------------------------------------------
# Built-ins
# ---------------------------------------------------------------------------
func _process(delta: float) -> void:
	if not _is_spawning or GameManager.current_state != GameManager.GameState.PLAYING:
		return

	_obstacle_timer -= delta
	_enemy_timer    -= delta

	if _obstacle_timer <= 0.0:
		_obstacle_timer = spawn_interval
		if randf() < obstacle_probability:
			_spawn_obstacle()

	if _enemy_timer <= 0.0:
		_enemy_timer = enemy_interval
		if randf() < enemy_probability:
			_spawn_enemy()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
func start_spawning() -> void:
	_is_spawning    = true
	_obstacle_timer = spawn_interval
	_enemy_timer    = enemy_interval
	obstacle_probability = LevelManager.get_obstacle_probability()


func stop_spawning() -> void:
	_is_spawning = false


func clear_all_obstacles() -> void:
	for obs in _active_obstacles:
		if is_instance_valid(obs):
			obs.call("deactivate")
	_active_obstacles.clear()


func is_track_blocked(track_index: int) -> bool:
	for obs in _active_obstacles:
		if is_instance_valid(obs) and obs.is_blocking_track(track_index):
			return true
	return false


# ---------------------------------------------------------------------------
# Internal
# ---------------------------------------------------------------------------
func _spawn_obstacle() -> void:
	if obstacle_scene == null:
		return

	var level_data: Dictionary = LevelManager.get_current_level()
	var track_count: int = level_data.get("trackCount", 10)
	var track_idx: int   = randi() % track_count

	var spacing: float  = 1.0
	var x_offset: float = (track_count - 1) * spacing * 0.5
	var x_pos: float    = float(track_idx) * spacing - x_offset
	var pos      := Vector3(x_pos, 0.5, 5.0)

	var obs := obstacle_scene.instantiate() as Node3D
	add_child(obs)
	obs.call("activate", track_idx, pos, obstacle_duration)
	_active_obstacles.append(obs)

	print("Spawned obstacle on track %d" % track_idx)


func _spawn_enemy() -> void:
	if enemy_scene == null:
		return
	var pos := Vector3(randf_range(-5.0, 5.0), 1.0, 10.0)
	var enemy := enemy_scene.instantiate() as Node3D
	add_child(enemy)
	enemy.global_position = pos
	print("Spawned enemy drone.")
