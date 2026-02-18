extends RigidBody3D

## VoxelController — attached to every explosion voxel RigidBody3D.
## Handles lifetime, color, fade-out (alpha + scale), and pool return.

# ---------------------------------------------------------------------------
# Signals
# ---------------------------------------------------------------------------
signal voxel_destroyed(voxel: Node3D)

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
var _color: Color       = Color.WHITE
var _lifetime: float    = 2.0
var _fade_start: float  = 1.0
var _age: float         = 0.0
var _initial_scale: Vector3
var _initialized: bool  = false

@onready var mesh_instance: MeshInstance3D = $MeshInstance3D
var _material: StandardMaterial3D

# ---------------------------------------------------------------------------
# Built-ins
# ---------------------------------------------------------------------------
func _ready() -> void:
	mass         = 0.1
	linear_damp  = 0.5
	angular_damp = 0.5

	_initial_scale = scale

	# Create a unique material per voxel for per-instance transparency
	_material = StandardMaterial3D.new()
	_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	if mesh_instance:
		mesh_instance.set_surface_override_material(0, _material)


func _process(delta: float) -> void:
	if not _initialized:
		return

	_age += delta

	if _age >= _fade_start:
		_update_fade()

	if _age >= _lifetime:
		_destroy_voxel()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
func initialize(color: Color, lifetime: float, fade_start: float) -> void:
	_color      = color
	_lifetime   = lifetime
	_fade_start = fade_start
	_age        = 0.0
	_initialized = true

	scale = _initial_scale
	if mesh_instance:
		mesh_instance.visible = true

	if _material:
		_material.albedo_color = color

	sleeping = false


func reset_voxel() -> void:
	_initialized = false
	_age         = 0.0
	linear_velocity  = Vector3.ZERO
	angular_velocity = Vector3.ZERO
	scale = _initial_scale
	if mesh_instance:
		mesh_instance.visible = false


func force_destroy() -> void:
	_destroy_voxel()


# ---------------------------------------------------------------------------
# Internal
# ---------------------------------------------------------------------------
func _update_fade() -> void:
	var progress := (_age - _fade_start) / maxf(_lifetime - _fade_start, 0.001)
	progress = clampf(progress, 0.0, 1.0)

	var alpha := 1.0 - progress
	if _material:
		var c       := _color
		c.a          = alpha
		_material.albedo_color = c

	# Scale fade
	scale = _initial_scale * alpha


func _destroy_voxel() -> void:
	_initialized = false
	voxel_destroyed.emit(self)
	ObjectPool.return_voxel(self)
