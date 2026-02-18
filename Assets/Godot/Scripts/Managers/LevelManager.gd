extends Node

## LevelManager — Autoload singleton.
## Loads levels.json from res://Assets/Godot/Resources/Configs/levels.json,
## stores level data, and applies parameters to game systems each level.

# ---------------------------------------------------------------------------
# Signals
# ---------------------------------------------------------------------------
signal level_loaded(level_data: Dictionary)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
const CONFIG_PATH := "res://Assets/Godot/Resources/Configs/levels.json"

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
var all_levels: Array[Dictionary] = []
var current_level_index: int = 1
var current_level: Dictionary = {}

# ---------------------------------------------------------------------------
# Built-ins
# ---------------------------------------------------------------------------
func _ready() -> void:
	_load_level_configurations()


# ---------------------------------------------------------------------------
# Private
# ---------------------------------------------------------------------------
func _load_level_configurations() -> void:
	if not FileAccess.file_exists(CONFIG_PATH):
		push_error("levels.json not found at: " + CONFIG_PATH)
		_create_default_levels()
		return

	var file := FileAccess.open(CONFIG_PATH, FileAccess.READ)
	var json_text := file.get_as_text()
	file.close()

	var parsed = JSON.parse_string(json_text)
	if parsed == null:
		push_error("Failed to parse levels.json")
		_create_default_levels()
		return

	all_levels = parsed
	print("Loaded %d levels from config." % all_levels.size())


func _create_default_levels() -> void:
	## Fallback: 5 hand-coded levels if JSON is missing.
	for i in range(1, 6):
		all_levels.append({
			"level":               i,
			"trackCount":          mini(6 + i, 10),
			"wallSpeedStart":      0.01 + i * 0.01,
			"wallSpeedRamp":       i * 0.0001,
			"targetPoints":        i * 100,
			"targetTime":          0,
			"obstacleProbability": minf(i * 0.01, 0.1),
			"specialCubeChance":   minf(i * 0.01, 0.05),
			"spawnRate":           maxf(2.0 - i * 0.1, 1.0),
		})
	push_warning("Using default level configurations (5 levels).")


func _apply_level_parameters() -> void:
	if current_level.is_empty():
		return

	# Apply to Spawner
	var spawner = GameManager.spawner
	if spawner:
		spawner.set_track_count(current_level.get("trackCount", 10))
		spawner.set_spawn_rate(current_level.get("spawnRate", 2.0))
		spawner.set_special_cube_chance(current_level.get("specialCubeChance", 0.0))

	# Apply to WallController
	var wall = GameManager.wall_controller
	if wall:
		wall.set_wall_speed(
			current_level.get("wallSpeedStart", 0.02),
			current_level.get("wallSpeedRamp",  0.0)
		)

	print("Applied level %d parameters." % current_level.get("level", 0))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
func load_level(index: int) -> void:
	if all_levels.is_empty():
		_load_level_configurations()

	index = clampi(index, 1, all_levels.size())
	current_level_index = index
	current_level = all_levels[index - 1]

	_apply_level_parameters()
	level_loaded.emit(current_level)

	print("Loaded Level %d | tracks=%d | wallSpeed=%.3f | target=%d" % [
		current_level.get("level",         0),
		current_level.get("trackCount",    10),
		current_level.get("wallSpeedStart",0.02),
		current_level.get("targetPoints",  100),
	])


func load_next_level() -> void:
	load_level(mini(current_level_index + 1, all_levels.size()))


func check_level_complete(score: int, time_elapsed: float) -> bool:
	if current_level.is_empty():
		return false

	var target_pts  : int   = current_level.get("targetPoints", 0)
	var target_time : float = current_level.get("targetTime",   0.0)

	var score_reached := target_pts  > 0 and score        >= target_pts
	var time_reached  := target_time > 0 and time_elapsed >= target_time
	return score_reached or time_reached


func get_obstacle_probability() -> float:
	return current_level.get("obstacleProbability", 0.0)


# Getters
func get_current_level() -> Dictionary: return current_level
func get_total_levels()  -> int:        return all_levels.size()
