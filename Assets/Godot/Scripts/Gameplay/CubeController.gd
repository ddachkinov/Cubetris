extends RigidBody3D
class_name CubeController

## CubeController — attached to every cube RigidBody3D.
## Manages color, physics state, grid registration, and explosion.

# ---------------------------------------------------------------------------
# Signals
# ---------------------------------------------------------------------------
signal cube_at_rest(cube: CubeController)

# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------
@export var rest_velocity_threshold: float = 0.1
@export var rest_check_delay: float = 0.5

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
var color_index: int = 0
var cube_color: Color = Color.WHITE
var is_launched: bool = false
var is_traveling: bool = false  # Rail-based movement phase
var is_at_rest: bool = false
var is_registered: bool = false
var grid_position: Vector2i = Vector2i.ZERO

var _launch_time: float = 0.0
var _travel_speed: float = 20.0  # Units per second on rail
var _locked_x: float = 0.0       # X position locked to track
var _locked_y: float = 0.0       # Y position locked during travel
var _target_z: float = 9.0       # Fixed landing Z position (wall is at 10)

# ---------------------------------------------------------------------------
# Node references
# ---------------------------------------------------------------------------
@onready var mesh_instance: MeshInstance3D = $MeshInstance3D

# ---------------------------------------------------------------------------
# Built-ins
# ---------------------------------------------------------------------------
func _ready() -> void:
	# Continuous CCD equivalent — use contacts_reported + contact_monitor
	contact_monitor = true
	max_contacts_reported = 4
	continuous_cd = true


func _physics_process(delta: float) -> void:
	if is_traveling:
		_travel_on_rail(delta)
	elif is_launched and not is_at_rest:
		if Time.get_ticks_msec() / 1000.0 > _launch_time + rest_check_delay:
			_check_if_at_rest()


# ---------------------------------------------------------------------------
# Rail-based travel
# ---------------------------------------------------------------------------
func _travel_on_rail(delta: float) -> void:
	# Move toward fixed target Z position (single-layer gameplay)
	var next_z: float = global_position.z + _travel_speed * delta

	# Check if we've reached or passed the target
	if next_z >= _target_z:
		# Snap to exact landing position
		global_position = Vector3(_locked_x, _locked_y, _target_z)
		_stop_traveling()
	else:
		# Keep moving on rail, locked to track X/Y
		global_position = Vector3(_locked_x, _locked_y, next_z)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
func initialize(p_color_index: int, p_color: Color) -> void:
	color_index = p_color_index
	cube_color  = p_color
	is_launched    = false
	is_at_rest     = false
	is_registered  = false

	_apply_color(cube_color)


func set_kinematic(kinematic: bool) -> void:
	freeze = kinematic
	if kinematic:
		linear_velocity  = Vector3.ZERO
		angular_velocity = Vector3.ZERO


func on_launched() -> void:
	is_launched  = true
	is_traveling = true
	is_at_rest   = false
	_launch_time = Time.get_ticks_msec() / 1000.0

	# Lock X and Y to current track position
	_locked_x = global_position.x
	_locked_y = global_position.y

	# Stay frozen (kinematic) during rail travel
	freeze = true


func _stop_traveling() -> void:
	is_traveling = false
	freeze = true  # Stay kinematic - no physics wobble
	_set_at_rest()  # Immediately snap to grid and register


func explode() -> void:
	_unregister_from_grid()
	ExplosionEffect.create_explosion(global_position, cube_color)
	ObjectPool.return_cube(self)


func reset_cube() -> void:
	is_launched   = false
	is_traveling  = false
	is_at_rest    = false
	is_registered = false
	color_index   = 0
	cube_color    = Color.WHITE
	freeze        = true
	linear_velocity  = Vector3.ZERO
	angular_velocity = Vector3.ZERO
	rotation = Vector3.ZERO


# ---------------------------------------------------------------------------
# Rest detection
# ---------------------------------------------------------------------------
func _check_if_at_rest() -> void:
	if linear_velocity.length() < rest_velocity_threshold \
	and angular_velocity.length() < rest_velocity_threshold:
		_set_at_rest()


func _set_at_rest() -> void:
	if is_at_rest:
		return
	is_at_rest = true
	freeze = true  # Ensure kinematic state

	_snap_to_grid()
	_register_in_grid()

	print("Cube landed | color=%d | grid=%s" % [color_index, grid_position])


# ---------------------------------------------------------------------------
# Grid
# ---------------------------------------------------------------------------
func _snap_to_grid() -> void:
	# Single-layer gameplay - all cubes at fixed Y and Z
	var snapped := Vector3(
		roundf(global_position.x),
		0.5,        # Fixed Y - on top of ground
		_target_z   # Fixed Z - at the wall
	)
	global_position = snapped
	grid_position   = MatchDetector.world_to_grid(snapped)


func _register_in_grid() -> void:
	if is_registered:
		return
	MatchDetector.register_cube(self, grid_position)
	is_registered = true

	# Check matches after a short delay so physics settles
	await get_tree().create_timer(0.2).timeout
	if is_instance_valid(self):
		MatchDetector.check_matches_at(grid_position)


func _unregister_from_grid() -> void:
	if not is_registered:
		return
	MatchDetector.unregister_cube(grid_position)
	is_registered = false


# ---------------------------------------------------------------------------
# Visual
# ---------------------------------------------------------------------------
func _apply_color(color: Color) -> void:
	if mesh_instance == null:
		return
	# Use a unique surface override so we don't mutate shared materials
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mesh_instance.set_surface_override_material(0, mat)
