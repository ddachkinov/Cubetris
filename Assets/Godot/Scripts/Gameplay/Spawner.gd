extends Node3D

## Spawner — attached to the spawn-area Node3D.
## Handles cube creation, left/right track movement, and launching.
## Supports both keyboard (desktop) and touch/swipe (mobile) input.

# ---------------------------------------------------------------------------
# Exports (editable in the Godot Inspector)
# ---------------------------------------------------------------------------
@export var cube_scene: PackedScene          ## Assign CubePrefab.tscn
@export var track_count: int = 10
@export var track_spacing: float = 1.0
@export var spawn_height: float = 2.0
@export var spawn_z: float = -10.0
@export var launch_force: float = 15.0
@export var track_switch_speed: float = 10.0
@export var spawn_rate: float = 2.0
@export var special_cube_chance: float = 0.0

@export var cube_colors: Array[Color] = [
	Color.RED,
	Color.BLUE,
	Color.GREEN,
	Color.YELLOW,
	Color.MAGENTA,
]

# ---------------------------------------------------------------------------
# Internal state
# ---------------------------------------------------------------------------
var current_track: int = 0
var current_cube: Node3D = null      # The cube the player is aiming
var next_cube_color: int = 0         # Index into cube_colors
var _is_spawning: bool = false
var _spawn_timer: float = 0.0

# ---------------------------------------------------------------------------
# Built-ins
# ---------------------------------------------------------------------------
func _ready() -> void:
	# Register with GameManager so it can call stop/start
	GameManager.spawner = self
	current_track   = track_count / 2
	next_cube_color = _random_color_index()

	# Connect touch signals (safe on desktop — TouchInputManager still loads,
	# signals just never fire when there's no touchscreen)
	TouchInputManager.swiped_left.connect(_on_swipe_left)
	TouchInputManager.swiped_right.connect(_on_swipe_right)
	TouchInputManager.tapped.connect(_on_tap)


func _process(delta: float) -> void:
	if not _is_spawning or GameManager.current_state != GameManager.GameState.PLAYING:
		return

	_handle_input()
	_update_cube_position(delta)

	# Spawn timer
	_spawn_timer -= delta
	if _spawn_timer <= 0.0 and current_cube == null:
		_spawn_cube()
		_spawn_timer = _effective_spawn_rate()


# ---------------------------------------------------------------------------
# Input — keyboard (desktop) + touch signals (mobile)
# ---------------------------------------------------------------------------
func _handle_input() -> void:
	# Keyboard / gamepad
	if Input.is_action_just_pressed("move_left"):
		_move_track(-1)
	elif Input.is_action_just_pressed("move_right"):
		_move_track(1)

	if Input.is_action_just_pressed("launch") and current_cube != null:
		_launch_cube()


# Touch signal callbacks -------------------------------------------------------
func _on_swipe_left()  -> void: _move_track(-1)
func _on_swipe_right() -> void: _move_track(1)
func _on_tap()         -> void:
	if current_cube != null:
		_launch_cube()


func _move_track(direction: int) -> void:
	current_track = clampi(current_track + direction, 0, track_count - 1)


# ---------------------------------------------------------------------------
# Cube lifecycle
# ---------------------------------------------------------------------------
func _spawn_cube() -> void:
	var cube_node: Node3D = ObjectPool.get_cube()
	if cube_node == null:
		push_error("ObjectPool returned null cube!")
		return

	cube_node.global_position = _get_track_position(current_track)
	cube_node.rotation = Vector3.ZERO

	var ctrl: CubeController = cube_node as CubeController
	if ctrl:
		ctrl.initialize(next_cube_color, cube_colors[next_cube_color])
		ctrl.set_kinematic(true)

	current_cube = cube_node
	next_cube_color = _random_color_index()

	# Notify UI
	if GameManager.ui_manager:
		GameManager.ui_manager.update_next_cube_preview(
			cube_colors[next_cube_color]
		)


func _launch_cube() -> void:
	if current_cube == null:
		return

	var ctrl := current_cube as CubeController
	if ctrl:
		ctrl.set_kinematic(false)
		ctrl.on_launched()
		# Apply forward velocity directly
		var rb := current_cube as RigidBody3D
		if rb:
			rb.linear_velocity = Vector3(0, 0, launch_force)

	current_cube = null
	# Next cube spawns via timer


func _update_cube_position(delta: float) -> void:
	if current_cube == null:
		return
	var target := _get_track_position(current_track)
	current_cube.global_position = current_cube.global_position.lerp(
		target, delta * track_switch_speed
	)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
func _get_track_position(track_index: int) -> Vector3:
	var x_offset := (track_count - 1) * track_spacing * 0.5
	var x_pos    := track_index * track_spacing - x_offset
	return Vector3(x_pos, spawn_height, spawn_z)


func _random_color_index() -> int:
	if randf() < special_cube_chance:
		return 5   # Special
	return randi() % 5


func _effective_spawn_rate() -> float:
	var override := GameManager.spawn_rate_override
	return override if override > 0.0 else spawn_rate


# ---------------------------------------------------------------------------
# Public API (called by GameManager / LevelManager)
# ---------------------------------------------------------------------------
func start_spawning() -> void:
	_is_spawning  = true
	_spawn_timer  = 0.0   # Spawn immediately on first tick


func stop_spawning() -> void:
	_is_spawning = false


func reset_spawner() -> void:
	stop_spawning()
	if current_cube != null:
		ObjectPool.return_cube(current_cube)
		current_cube = null
	current_track   = track_count / 2
	next_cube_color = _random_color_index()


func set_track_count(count: int) -> void:
	track_count   = maxi(4, count)
	current_track = clampi(current_track, 0, track_count - 1)


func set_spawn_rate(rate: float) -> void:
	spawn_rate = maxf(0.5, rate)


func set_special_cube_chance(chance: float) -> void:
	special_cube_chance = clampf(chance, 0.0, 1.0)


# ---------------------------------------------------------------------------
# Editor gizmos (Godot uses _draw for 2D; for 3D we override _draw_gizmo
# via EditorPlugin — here we use a simple in-game debug draw instead)
# ---------------------------------------------------------------------------
func _draw_debug() -> void:
	if not GameManager.show_debug:
		return
	for i in track_count:
		var pos := _get_track_position(i)
		# In-game: just print; replace with DebugDraw3D plugin if desired
		if i == current_track:
			print("► Track %d  pos=%s" % [i, pos])
