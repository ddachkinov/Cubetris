extends Node

## GameManager — Autoload singleton.
## Controls overall game state, lifecycle, score, and coordinates all systems.

# ---------------------------------------------------------------------------
# Signals (Godot equivalent of C# events)
# ---------------------------------------------------------------------------
signal score_changed(new_score: int)
signal lives_changed(new_lives: int)
signal state_changed(new_state: GameState)
signal game_over
signal level_complete

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
enum GameState { MENU, PLAYING, PAUSED, LEVEL_COMPLETE, GAME_OVER }

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
var current_state: GameState = GameState.MENU
var current_score: int = 0
var lives: int = 3
var game_time: float = 0.0

# ---------------------------------------------------------------------------
# Debug toggles (editable from the Godot Remote Inspector at runtime)
# ---------------------------------------------------------------------------
var show_debug: bool = true
var instant_wall_move: bool = false
var spawn_rate_override: float = -1.0   # -1 = use level default

# ---------------------------------------------------------------------------
# Node references — set by scene after autoloads are ready
# ---------------------------------------------------------------------------
var spawner: Node3D = null
var wall_controller: Node3D = null
var ui_manager: CanvasLayer = null

# ---------------------------------------------------------------------------
# Built-ins
# ---------------------------------------------------------------------------
func _ready() -> void:
	# Nothing to auto-find here; scene nodes call register_*() on themselves.
	pass


func _process(delta: float) -> void:
	if current_state != GameState.PLAYING:
		return

	game_time += delta

	# Check level completion every frame via LevelManager
	if LevelManager.check_level_complete(current_score, game_time):
		complete_level()

	# Debug shortcuts
	if Input.is_action_just_pressed("restart"):
		restart_level()
	if Input.is_action_just_pressed("pause"):
		toggle_pause()

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
func start_game() -> void:
	current_score = 0
	game_time    = 0.0
	lives        = 3

	LevelManager.load_level(0)  # Load first level
	_change_state(GameState.PLAYING)

	if spawner:
		spawner.start_spawning()
	if wall_controller:
		wall_controller.start_pushing()

	score_changed.emit(current_score)
	lives_changed.emit(lives)
	print("Game started!")


func add_score(points: int) -> void:
	current_score += points
	score_changed.emit(current_score)


func lose_life() -> void:
	lives -= 1
	lives_changed.emit(lives)
	if lives <= 0:
		trigger_game_over()


func trigger_game_over() -> void:
	_change_state(GameState.GAME_OVER)
	if spawner:       spawner.stop_spawning()
	if wall_controller: wall_controller.stop_pushing()
	game_over.emit()
	print("Game Over! Score: %d" % current_score)


func complete_level() -> void:
	_change_state(GameState.LEVEL_COMPLETE)
	if spawner:       spawner.stop_spawning()
	if wall_controller: wall_controller.stop_pushing()
	level_complete.emit()
	print("Level Complete! Score: %d" % current_score)


func load_next_level() -> void:
	LevelManager.load_next_level()
	restart_level()


func restart_level() -> void:
	current_score = 0
	game_time     = 0.0

	MatchDetector.clear_grid()
	if spawner:         spawner.reset_spawner()
	if wall_controller: wall_controller.reset_wall()

	start_game()


func toggle_pause() -> void:
	if current_state == GameState.PLAYING:
		_change_state(GameState.PAUSED)
		get_tree().paused = true
	elif current_state == GameState.PAUSED:
		_change_state(GameState.PLAYING)
		get_tree().paused = false

# ---------------------------------------------------------------------------
# Internal
# ---------------------------------------------------------------------------
func _change_state(new_state: GameState) -> void:
	if current_state == new_state:
		return
	current_state = new_state
	state_changed.emit(new_state)
	print("State → %s" % GameState.keys()[new_state])
