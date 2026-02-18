extends CanvasLayer

## UIManager — attached to a CanvasLayer node in the main scene.
## Manages HUD, menus and state-driven panel visibility.

# ---------------------------------------------------------------------------
# Panel references — assign in the Inspector
# ---------------------------------------------------------------------------
@export var hud_panel:            Control
@export var main_menu_panel:      Control
@export var pause_menu_panel:     Control
@export var game_over_panel:      Control
@export var level_complete_panel: Control

# ---------------------------------------------------------------------------
# HUD elements
# ---------------------------------------------------------------------------
@export var score_label:       Label
@export var lives_label:       Label
@export var level_label:       Label
@export var target_label:      Label
@export var next_cube_preview: ColorRect   ## Tinted to show upcoming cube color

# ---------------------------------------------------------------------------
# Result screen elements
# ---------------------------------------------------------------------------
@export var final_score_label:         Label
@export var level_complete_score_label: Label

# ---------------------------------------------------------------------------
# Built-ins
# ---------------------------------------------------------------------------
func _ready() -> void:
	GameManager.ui_manager = self

	# Connect GameManager signals
	GameManager.score_changed.connect(_on_score_changed)
	GameManager.lives_changed.connect(_on_lives_changed)
	GameManager.state_changed.connect(_on_state_changed)
	GameManager.game_over.connect(_on_game_over)
	GameManager.level_complete.connect(_on_level_complete)

	# Connect LevelManager to update level label
	LevelManager.level_loaded.connect(_on_level_loaded)

	show_main_menu()


func _exit_tree() -> void:
	# Signals are auto-disconnected by Godot when node is freed,
	# but explicit cleanup avoids edge cases with Autoloads.
	if GameManager.score_changed.is_connected(_on_score_changed):
		GameManager.score_changed.disconnect(_on_score_changed)
	if GameManager.lives_changed.is_connected(_on_lives_changed):
		GameManager.lives_changed.disconnect(_on_lives_changed)


# ---------------------------------------------------------------------------
# HUD update methods
# ---------------------------------------------------------------------------
func update_score(score: int) -> void:
	if score_label:
		score_label.text = "Score: %d" % score


func update_lives(lives: int) -> void:
	if lives_label:
		lives_label.text = "Lives: %d" % lives


func update_next_cube_preview(color: Color) -> void:
	if next_cube_preview:
		next_cube_preview.color = color


func _on_level_loaded(level_data: Dictionary) -> void:
	if level_label:
		level_label.text = "Level: %d / %d" % [
			level_data.get("level", 1), LevelManager.get_total_levels()
		]
	if target_label:
		target_label.text = "Target: %d" % level_data.get("targetPoints", 0)


# ---------------------------------------------------------------------------
# Signal handlers
# ---------------------------------------------------------------------------
func _on_score_changed(new_score: int) -> void:
	update_score(new_score)


func _on_lives_changed(new_lives: int) -> void:
	update_lives(new_lives)


func _on_state_changed(new_state: GameManager.GameState) -> void:
	match new_state:
		GameManager.GameState.MENU:          show_main_menu()
		GameManager.GameState.PLAYING:       _show_hud()
		GameManager.GameState.PAUSED:        show_pause_menu(true)


func _on_game_over() -> void:
	show_game_over(GameManager.current_score)


func _on_level_complete() -> void:
	show_level_complete(GameManager.current_score)


# ---------------------------------------------------------------------------
# Panel management
# ---------------------------------------------------------------------------
func show_main_menu() -> void:
	_set_panel(main_menu_panel,      true)
	_set_panel(hud_panel,            false)
	_set_panel(pause_menu_panel,     false)
	_set_panel(game_over_panel,      false)
	_set_panel(level_complete_panel, false)


func _show_hud() -> void:
	_set_panel(main_menu_panel,      false)
	_set_panel(hud_panel,            true)
	_set_panel(pause_menu_panel,     false)
	_set_panel(game_over_panel,      false)
	_set_panel(level_complete_panel, false)


func show_pause_menu(visible: bool) -> void:
	_set_panel(pause_menu_panel, visible)
	_set_panel(hud_panel,        not visible)


func show_game_over(score: int) -> void:
	_set_panel(game_over_panel, true)
	_set_panel(hud_panel,       false)
	if final_score_label:
		final_score_label.text = "Final Score: %d" % score


func show_level_complete(score: int) -> void:
	_set_panel(level_complete_panel, true)
	_set_panel(hud_panel,           false)
	if level_complete_score_label:
		level_complete_score_label.text = "Score: %d" % score


func _set_panel(panel: Control, visible: bool) -> void:
	if panel:
		panel.visible = visible


# ---------------------------------------------------------------------------
# Button callbacks — wire up in the Godot Inspector (Node → Signals)
# ---------------------------------------------------------------------------
func on_start_game_pressed()  -> void: GameManager.start_game()
func on_resume_pressed()      -> void: GameManager.toggle_pause()
func on_restart_pressed()     -> void: GameManager.restart_level()
func on_next_level_pressed()  -> void: GameManager.load_next_level()
func on_quit_pressed()        -> void: get_tree().quit()
