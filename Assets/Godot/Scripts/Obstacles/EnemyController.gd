extends CharacterBody3D

## EnemyController — drone enemy that moves toward the spawn area.
## Destroys cubes on contact; causes life loss if it reaches spawn area.

# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------
@export var move_speed: float       = 3.0
@export var lifetime: float         = 10.0
@export var zigzag_amplitude: float = 2.0
@export var zigzag_frequency: float = 1.0
@export var enemy_color: Color      = Color(1.0, 0.3, 0.3)

# ---------------------------------------------------------------------------
# Internal
# ---------------------------------------------------------------------------
var _spawn_time: float = 0.0
var _initial_x: float  = 0.0

@onready var mesh_instance: MeshInstance3D = $MeshInstance3D

# ---------------------------------------------------------------------------
# Built-ins
# ---------------------------------------------------------------------------
func _ready() -> void:
	_spawn_time = Time.get_ticks_msec() / 1000.0
	_initial_x  = global_position.x

	if mesh_instance:
		var mat := StandardMaterial3D.new()
		mat.albedo_color = enemy_color
		mesh_instance.set_surface_override_material(0, mat)

	# Auto-destroy after lifetime
	await get_tree().create_timer(lifetime).timeout
	if is_instance_valid(self):
		queue_free()


func _physics_process(delta: float) -> void:
	if GameManager.current_state != GameManager.GameState.PLAYING:
		return

	var age     := Time.get_ticks_msec() / 1000.0 - _spawn_time
	var zigzag  := sin(age * zigzag_frequency) * zigzag_amplitude

	# Move toward player (-Z) + zigzag
	velocity = Vector3(
		_initial_x + zigzag - global_position.x,
		0.0,
		-move_speed
	)
	move_and_slide()

	# Rotate for visual effect
	rotate_y(deg_to_rad(100.0 * delta))

	# Check if reached spawn area
	if global_position.z <= -9.0:
		GameManager.lose_life()
		queue_free()


func _on_body_entered(body: Node3D) -> void:
	var cube := body as CubeController
	if cube:
		cube.explode()
		print("Enemy destroyed a cube!")
