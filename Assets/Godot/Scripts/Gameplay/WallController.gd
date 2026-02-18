extends Node3D

## WallController — attached to the Wall MeshInstance3D / StaticBody3D.
## Moves the wall forward (−Z) over time and triggers game-over
## when it reaches the spawn area.

# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------
@export var wall_speed_start: float = 0.02
@export var wall_speed_ramp: float  = 0.0
@export var game_over_z: float      = -10.0
@export var warning_distance: float = 5.0

@export var normal_color:  Color = Color(0.5, 0.5, 0.5)
@export var warning_color: Color = Color(1.0, 0.1, 0.1)

# ---------------------------------------------------------------------------
# Internal
# ---------------------------------------------------------------------------
var _current_speed: float = 0.02
var _is_pushing: bool     = false
var _elapsed: float       = 0.0
var _initial_position: Vector3

@onready var mesh_instance: MeshInstance3D = $MeshInstance3D
var _wall_material: StandardMaterial3D

# ---------------------------------------------------------------------------
# Built-ins
# ---------------------------------------------------------------------------
func _ready() -> void:
	GameManager.wall_controller = self
	_initial_position = global_position
	_current_speed    = wall_speed_start

	# Create a unique material for this wall so color changes don't affect others
	_wall_material = StandardMaterial3D.new()
	_wall_material.albedo_color = normal_color
	if mesh_instance:
		mesh_instance.set_surface_override_material(0, _wall_material)


func _physics_process(delta: float) -> void:
	if not _is_pushing or GameManager.current_state != GameManager.GameState.PLAYING:
		return

	var speed := _current_speed * (10.0 if GameManager.instant_wall_move else 1.0)

	# Move toward player (−Z)
	global_position.z -= speed * delta

	# Speed ramp
	if wall_speed_ramp > 0.0:
		_elapsed       += delta
		_current_speed += wall_speed_ramp * delta

	_check_game_over()
	_update_visual_feedback()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
func start_pushing() -> void:
	_is_pushing = true
	_elapsed    = 0.0
	print("Wall pushing | speed=%.4f ramp=%.6f" % [_current_speed, wall_speed_ramp])


func stop_pushing() -> void:
	_is_pushing = false


func reset_wall() -> void:
	global_position = _initial_position
	_is_pushing     = false
	_elapsed        = 0.0
	_current_speed  = wall_speed_start
	if _wall_material:
		_wall_material.albedo_color = normal_color


func set_wall_speed(start_speed: float, ramp: float) -> void:
	wall_speed_start = start_speed
	wall_speed_ramp  = ramp
	_current_speed   = start_speed


# ---------------------------------------------------------------------------
# Internal
# ---------------------------------------------------------------------------
func _check_game_over() -> void:
	if global_position.z <= game_over_z:
		stop_pushing()
		GameManager.trigger_game_over()
		push_warning("Wall reached spawn area — Game Over!")


func _update_visual_feedback() -> void:
	if _wall_material == null:
		return
	var dist := absf(global_position.z - game_over_z)
	if dist <= warning_distance:
		var t   := 1.0 - (dist / warning_distance)
		_wall_material.albedo_color = normal_color.lerp(warning_color, t)
	else:
		_wall_material.albedo_color = normal_color
