extends Node3D

## ObstacleController — blocks a specific track for a duration.

# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------
@export var block_duration: float = 5.0
@export var warning_time:   float = 1.0

@export var normal_color:  Color = Color(0.5, 0.5, 0.5)
@export var warning_color: Color = Color(1.0, 1.0, 0.0)
@export var block_color:   Color = Color(1.0, 0.1, 0.1)

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
var blocked_track: int  = 0
var is_active: bool     = false

@onready var mesh_instance: MeshInstance3D = $MeshInstance3D
var _material: StandardMaterial3D

# ---------------------------------------------------------------------------
# Built-ins
# ---------------------------------------------------------------------------
func _ready() -> void:
	_material = StandardMaterial3D.new()
	if mesh_instance:
		mesh_instance.set_surface_override_material(0, _material)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
func activate(track_index: int, world_pos: Vector3, duration: float) -> void:
	blocked_track  = track_index
	block_duration = duration
	global_position = world_pos
	is_active      = true

	_set_color(warning_color)
	_run_block_sequence()
	print("Obstacle active on track %d for %.1fs" % [track_index, duration])


func deactivate() -> void:
	is_active = false

	var tween := create_tween()
	tween.tween_property(self, "scale", Vector3.ZERO, 0.3)
	tween.tween_callback(queue_free)


func is_blocking_track(track_index: int) -> bool:
	return is_active and blocked_track == track_index


# ---------------------------------------------------------------------------
# Internal
# ---------------------------------------------------------------------------
func _run_block_sequence() -> void:
	# Warning phase
	await get_tree().create_timer(warning_time).timeout
	if not is_active: return

	_set_color(block_color)

	# Block phase
	await get_tree().create_timer(block_duration - warning_time).timeout
	if not is_active: return

	deactivate()


func _set_color(color: Color) -> void:
	if _material:
		_material.albedo_color = color
