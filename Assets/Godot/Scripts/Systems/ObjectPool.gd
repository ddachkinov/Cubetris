extends Node

## ObjectPool — Autoload singleton.
## Pre-allocates and recycles CubeController and VoxelController instances.

# ---------------------------------------------------------------------------
# Exports — set in the Godot Project Settings → Autoload inspector
# ---------------------------------------------------------------------------
@export var cube_scene:  PackedScene
@export var voxel_scene: PackedScene

@export var initial_cube_pool_size:  int = 50
@export var initial_voxel_pool_size: int = 100
@export var max_cube_pool_size:      int = 200
@export var max_voxel_pool_size:     int = 500

# ---------------------------------------------------------------------------
# Pools
# ---------------------------------------------------------------------------
var _cube_pool:  Array[Node3D] = []
var _voxel_pool: Array[Node3D] = []

var _active_cubes:  Array[Node3D] = []
var _active_voxels: Array[Node3D] = []

var _cube_container:  Node3D
var _voxel_container: Node3D

# ---------------------------------------------------------------------------
# Built-ins
# ---------------------------------------------------------------------------
func _ready() -> void:
	_cube_container  = Node3D.new()
	_cube_container.name = "CubePool"
	add_child(_cube_container)

	_voxel_container = Node3D.new()
	_voxel_container.name = "VoxelPool"
	add_child(_voxel_container)

	_init_pool(_cube_pool,  cube_scene,  initial_cube_pool_size,  _cube_container)
	_init_pool(_voxel_pool, voxel_scene, initial_voxel_pool_size, _voxel_container)
	print("Pool ready | cubes=%d voxels=%d" % [_cube_pool.size(), _voxel_pool.size()])


# ---------------------------------------------------------------------------
# Cube pool
# ---------------------------------------------------------------------------
func get_cube() -> Node3D:
	return _get_from_pool(_cube_pool, _active_cubes, cube_scene,
		max_cube_pool_size, _cube_container)


func return_cube(cube: Node3D) -> void:
	_return_to_pool(cube, _cube_pool, _active_cubes, _cube_container)
	var ctrl := cube as CubeController
	if ctrl:
		ctrl.reset_cube()


# ---------------------------------------------------------------------------
# Voxel pool
# ---------------------------------------------------------------------------
func get_voxel() -> Node3D:
	return _get_from_pool(_voxel_pool, _active_voxels, voxel_scene,
		max_voxel_pool_size, _voxel_container)


func return_voxel(voxel: Node3D) -> void:
	_return_to_pool(voxel, _voxel_pool, _active_voxels, _voxel_container)
	var ctrl := voxel.get_script()
	if voxel.has_method("reset_voxel"):
		voxel.reset_voxel()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
func _init_pool(pool: Array, scene: PackedScene,
		count: int, container: Node3D) -> void:
	if scene == null:
		push_warning("ObjectPool: scene not assigned!")
		return
	for i in count:
		var node := scene.instantiate() as Node3D
		container.add_child(node)
		node.visible = false
		pool.append(node)


func _get_from_pool(pool: Array, active: Array,
		scene: PackedScene, max_size: int, container: Node3D) -> Node3D:
	var node: Node3D
	if pool.size() > 0:
		node = pool.pop_back()
	elif active.size() < max_size:
		if scene == null:
			push_error("ObjectPool: scene is null!")
			return null
		node = scene.instantiate() as Node3D
		container.add_child(node)
	else:
		push_warning("ObjectPool at max capacity!")
		return null

	node.visible = true
	active.append(node)
	return node


func _return_to_pool(node: Node3D, pool: Array,
		active: Array, container: Node3D) -> void:
	if node == null:
		return
	active.erase(node)
	node.visible = false
	node.reparent(container)
	pool.append(node)


# ---------------------------------------------------------------------------
# Bulk management
# ---------------------------------------------------------------------------
func return_all_to_pool() -> void:
	for cube  in _active_cubes.duplicate():  return_cube(cube)
	for voxel in _active_voxels.duplicate(): return_voxel(voxel)


# Stats
func active_cube_count()  -> int: return _active_cubes.size()
func active_voxel_count() -> int: return _active_voxels.size()
func pooled_cube_count()  -> int: return _cube_pool.size()
func pooled_voxel_count() -> int: return _voxel_pool.size()
