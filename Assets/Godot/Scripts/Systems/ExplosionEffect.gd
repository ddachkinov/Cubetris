extends Node

## ExplosionEffect — Autoload singleton.
## Spawns voxel particles and plays audio on cube explosions.

# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------
@export var sparkle_scene: PackedScene   ## Optional particle scene
@export var explosion_sound: AudioStream

@export var voxels_per_explosion: int  = 20
@export var voxel_scale: float         = 0.12
@export var voxel_lifetime: float      = 2.0
@export var fade_start_time: float     = 1.0

@export var explosion_force: float     = 5.0
@export var explosion_radius: float    = 0.5
@export var force_variation: float     = 0.3

@export var max_active_voxels: int     = 200
@export var use_gpu_fallback: bool     = true

# ---------------------------------------------------------------------------
# Internal
# ---------------------------------------------------------------------------
var _active_voxels: Array[Node3D] = []
var _audio_player: AudioStreamPlayer3D

# ---------------------------------------------------------------------------
# Built-ins
# ---------------------------------------------------------------------------
func _ready() -> void:
	_audio_player = AudioStreamPlayer3D.new()
	add_child(_audio_player)
	if explosion_sound:
		_audio_player.stream = explosion_sound

	# Load particle scene if not assigned
	if sparkle_scene == null:
		sparkle_scene = load("res://Scenes/Effects/ExplosionParticles.tscn")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
func create_explosion(world_pos: Vector3, color: Color) -> void:
	if _active_voxels.size() >= max_active_voxels and use_gpu_fallback:
		_create_gpu_explosion(world_pos, color)
		return

	for i in voxels_per_explosion:
		_spawn_voxel(world_pos, color)

	_spawn_sparkle(world_pos, color)
	_play_sound(world_pos)


func clear_all_explosions() -> void:
	for voxel in _active_voxels.duplicate():
		if is_instance_valid(voxel):
			voxel.call("force_destroy")
	_active_voxels.clear()


# ---------------------------------------------------------------------------
# Internal
# ---------------------------------------------------------------------------
func _spawn_voxel(center: Vector3, color: Color) -> void:
	var voxel: Node3D = ObjectPool.get_voxel()
	if voxel == null:
		return

	# Random offset inside explosion radius
	var offset := Vector3(
		randf_range(-explosion_radius, explosion_radius),
		randf_range(-explosion_radius, explosion_radius),
		randf_range(-explosion_radius, explosion_radius)
	)
	voxel.global_position = center + offset
	voxel.rotation        = Vector3(randf() * TAU, randf() * TAU, randf() * TAU)
	voxel.scale           = Vector3.ONE * voxel_scale

	# Initialize VoxelController
	if voxel.has_method("initialize"):
		voxel.initialize(color, voxel_lifetime, fade_start_time)

	# Apply random impulse
	var rb := voxel as RigidBody3D
	if rb:
		var dir := (voxel.global_position - center).normalized()
		dir += Vector3(randf_range(-1,1), randf_range(-1,1), randf_range(-1,1)) * force_variation
		var magnitude := explosion_force * randf_range(0.7, 1.3)
		rb.apply_central_impulse(dir * magnitude)
		rb.apply_torque_impulse(
			Vector3(randf_range(-1,1), randf_range(-1,1), randf_range(-1,1)) * explosion_force * 0.5
		)

	_active_voxels.append(voxel)

	# Connect destruction signal
	if voxel.has_signal("voxel_destroyed"):
		voxel.voxel_destroyed.connect(_on_voxel_destroyed.bind(voxel), CONNECT_ONE_SHOT)


func _on_voxel_destroyed(voxel: Node3D) -> void:
	_active_voxels.erase(voxel)


func _spawn_sparkle(pos: Vector3, color: Color) -> void:
	if sparkle_scene == null:
		return
	var sparkle := sparkle_scene.instantiate()
	get_tree().current_scene.add_child(sparkle)
	sparkle.global_position = pos

	# Tint particle color if GPUParticles3D
	var gfx := sparkle.get_node_or_null("GPUParticles3D")
	if gfx:
		var mat := gfx.process_material as ParticleProcessMaterial
		if mat:
			mat = mat.duplicate()
			mat.color = color
			gfx.process_material = mat

	# Auto-remove after 3 seconds
	var timer := get_tree().create_timer(3.0)
	timer.timeout.connect(sparkle.queue_free)


func _create_gpu_explosion(pos: Vector3, color: Color) -> void:
	# Lightweight fallback: just sparkle + sound
	_spawn_sparkle(pos, color)
	_play_sound(pos)
	print("GPU particle fallback at %s" % pos)


func _play_sound(pos: Vector3) -> void:
	if _audio_player == null or explosion_sound == null:
		return
	_audio_player.global_position = pos
	_audio_player.play()


# Getters
func active_voxel_count() -> int: return _active_voxels.size()
