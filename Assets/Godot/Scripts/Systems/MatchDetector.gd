extends Node

## MatchDetector — Autoload singleton.
## Grid-based match detection using iterative flood-fill.
## Grid key: Vector2i(track_index, height_index).

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
const MIN_MATCH_SIZE   := 3
const BASE_POINTS      := 10
const CLUSTER_MULT     := 1.5
const MATCH_CHECK_DELAY := 0.3

# ---------------------------------------------------------------------------
# Grid storage
# ---------------------------------------------------------------------------
## Maps Vector2i → CubeController
var _grid: Dictionary = {}

# ---------------------------------------------------------------------------
# Public API — Registration
# ---------------------------------------------------------------------------
func register_cube(cube: CubeController, grid_pos: Vector2i) -> void:
	if _grid.has(grid_pos):
		push_warning("Grid position %s already occupied." % grid_pos)
	_grid[grid_pos] = cube
	print("Registered cube @ %s color=%d" % [grid_pos, cube.color_index])


func unregister_cube(grid_pos: Vector2i) -> void:
	_grid.erase(grid_pos)


func clear_grid() -> void:
	for cube in _grid.values():
		if is_instance_valid(cube):
			ObjectPool.return_cube(cube)
	_grid.clear()
	print("Grid cleared.")


# ---------------------------------------------------------------------------
# Public API — Match checking
# ---------------------------------------------------------------------------
func check_matches_at(grid_pos: Vector2i) -> void:
	if not _grid.has(grid_pos):
		return

	var start_cube: CubeController = _grid[grid_pos]
	if start_cube == null:
		return

	var cluster := _flood_fill(grid_pos, start_cube.color_index)
	if cluster.size() >= MIN_MATCH_SIZE:
		await _process_match(cluster)


# ---------------------------------------------------------------------------
# Flood-fill (iterative to avoid stack overflows on large boards)
# ---------------------------------------------------------------------------
func _flood_fill(start: Vector2i, target_color: int) -> Array[CubeController]:
	var cluster: Array[CubeController] = []
	var visited: Dictionary = {}          # Vector2i → true
	var queue:   Array[Vector2i] = [start]

	while queue.size() > 0:
		var pos: Vector2i = queue.pop_front()

		if visited.has(pos):
			continue
		visited[pos] = true

		if not _grid.has(pos):
			continue

		var cube: CubeController = _grid[pos]
		if cube == null or cube.color_index != target_color:
			continue

		cluster.append(cube)

		# Add 4-directional neighbours
		queue.append(pos + Vector2i( 1,  0))
		queue.append(pos + Vector2i(-1,  0))
		queue.append(pos + Vector2i( 0,  1))
		queue.append(pos + Vector2i( 0, -1))

	return cluster


# ---------------------------------------------------------------------------
# Process a confirmed match
# ---------------------------------------------------------------------------
func _process_match(cluster: Array[CubeController]) -> void:
	var size  := cluster.size()
	var color := cluster[0].color_index

	# Score = base * size * multiplier^(size - min)
	var pts := int(BASE_POINTS * size * pow(CLUSTER_MULT, size - MIN_MATCH_SIZE))
	GameManager.add_score(pts)

	print("Match! color=%d size=%d pts=%d" % [color, size, pts])

	# Explode all cubes
	for cube in cluster:
		if is_instance_valid(cube):
			cube.explode()

	# Wait then check chain reactions
	await Engine.get_main_loop().create_timer(MATCH_CHECK_DELAY).timeout
	_check_chain_reactions()


func _check_chain_reactions() -> void:
	var positions := _grid.keys()   # snapshot
	for pos in positions:
		if _grid.has(pos):
			check_matches_at(pos)


# ---------------------------------------------------------------------------
# Coordinate helpers
# ---------------------------------------------------------------------------
func world_to_grid(world_pos: Vector3) -> Vector2i:
	return Vector2i(roundi(world_pos.x), roundi(world_pos.y))


func grid_to_world(grid_pos: Vector2i) -> Vector3:
	return Vector3(float(grid_pos.x), float(grid_pos.y), 0.0)


func get_cube_at(grid_pos: Vector2i) -> CubeController:
	return _grid.get(grid_pos, null)


func get_grid_count() -> int:
	return _grid.size()
