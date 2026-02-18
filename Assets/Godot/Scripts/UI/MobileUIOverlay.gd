extends CanvasLayer

## MobileUIOverlay — on-screen control buttons for touch devices.
##
## Layout (landscape):
##   ┌──────────────────────────────────────────┐
##   │  [◀ LEFT]   TRACK INDICATOR   [RIGHT ▶]  │  ← bottom 20 % of screen
##   │         [         LAUNCH         ]        │
##   └──────────────────────────────────────────┘
##
## The overlay hides itself on desktop builds so it doesn't clutter
## keyboard play. It is force-shown when a touchscreen is detected.
##
## Wire the three Button.pressed signals to the three _on_* methods,
## OR assign this script to a CanvasLayer and let _ready() build the
## buttons procedurally (zero-setup path).

# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------
@export var button_color:   Color = Color(1, 1, 1, 0.25)
@export var button_radius:  float = 16.0          ## Corner radius (px)
@export var auto_hide_on_desktop: bool = true

## If you build the UI in the Godot editor, assign these.
## If left null, _ready() creates simple procedural buttons.
@export var left_button:   Button
@export var right_button:  Button
@export var launch_button: Button

## Track indicator labels (optional)
@export var track_indicator: Label

# ---------------------------------------------------------------------------
# Internal
# ---------------------------------------------------------------------------
var _built_procedurally := false

# ---------------------------------------------------------------------------
# Built-ins
# ---------------------------------------------------------------------------
func _ready() -> void:
	# Hide on desktop unless explicitly overridden
	if auto_hide_on_desktop and not TouchInputManager.is_mobile():
		hide()
		return

	if left_button == null or right_button == null or launch_button == null:
		_build_procedural_ui()
		_built_procedurally = true
	else:
		_connect_signals()

	# Keep overlay on top of game world, under pause menus
	layer = 10


# ---------------------------------------------------------------------------
# Procedural UI builder — zero Inspector setup required
# ---------------------------------------------------------------------------
func _build_procedural_ui() -> void:
	var vp      := get_viewport().get_visible_rect().size
	var margin  := 20.0
	var btn_h   := 80.0
	var launch_h := 70.0

	# ── Row: LEFT  |  TRACK INDICATOR  |  RIGHT ────────────────────────────
	var row_y := vp.y - btn_h - launch_h - margin * 2

	left_button  = _make_button("◀", Vector2(margin, row_y),
		Vector2(120, btn_h))
	right_button = _make_button("▶", Vector2(vp.x - 120 - margin, row_y),
		Vector2(120, btn_h))

	# Track indicator (centered)
	track_indicator = Label.new()
	track_indicator.text              = "Track 5"
	track_indicator.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	track_indicator.vertical_alignment   = VERTICAL_ALIGNMENT_CENTER
	track_indicator.position          = Vector2(0, row_y)
	track_indicator.size              = Vector2(vp.x, btn_h)
	track_indicator.add_theme_font_size_override("font_size", 28)
	add_child(track_indicator)

	# ── Launch button ────────────────────────────────────────────────────────
	var launch_y := vp.y - launch_h - margin
	launch_button = _make_button("LAUNCH  🚀",
		Vector2(margin * 4, launch_y),
		Vector2(vp.x - margin * 8, launch_h))

	_connect_signals()
	_style_button(left_button,   Color(0.4, 0.6, 1.0, 0.7))
	_style_button(right_button,  Color(0.4, 0.6, 1.0, 0.7))
	_style_button(launch_button, Color(0.2, 0.9, 0.4, 0.8))


func _make_button(label: String, pos: Vector2, sz: Vector2) -> Button:
	var btn      := Button.new()
	btn.text     = label
	btn.position = pos
	btn.size     = sz
	btn.add_theme_font_size_override("font_size", 32)
	add_child(btn)
	return btn


func _style_button(btn: Button, color: Color) -> void:
	var style          := StyleBoxFlat.new()
	style.bg_color     = color
	style.corner_radius_top_left     = int(button_radius)
	style.corner_radius_top_right    = int(button_radius)
	style.corner_radius_bottom_left  = int(button_radius)
	style.corner_radius_bottom_right = int(button_radius)
	btn.add_theme_stylebox_override("normal", style)

	var hover           := style.duplicate() as StyleBoxFlat
	hover.bg_color      = color.lightened(0.2)
	btn.add_theme_stylebox_override("hover",   hover)

	var pressed_style   := style.duplicate() as StyleBoxFlat
	pressed_style.bg_color = color.darkened(0.2)
	btn.add_theme_stylebox_override("pressed", pressed_style)


# ---------------------------------------------------------------------------
# Signal wiring
# ---------------------------------------------------------------------------
func _connect_signals() -> void:
	if left_button:
		left_button.pressed.connect(_on_left_pressed)
	if right_button:
		right_button.pressed.connect(_on_right_pressed)
	if launch_button:
		launch_button.button_down.connect(_on_launch_pressed)


# ---------------------------------------------------------------------------
# Button handlers — emit same signals as TouchInputManager so Spawner
# doesn't need to know which input source fired
# ---------------------------------------------------------------------------
func _on_left_pressed()   -> void: TouchInputManager.swiped_left.emit()
func _on_right_pressed()  -> void: TouchInputManager.swiped_right.emit()
func _on_launch_pressed() -> void: TouchInputManager.tapped.emit()


# ---------------------------------------------------------------------------
# Called by Spawner each frame to keep track indicator in sync
# ---------------------------------------------------------------------------
func update_track_display(track_index: int, total_tracks: int) -> void:
	if track_indicator:
		track_indicator.text = "Track %d / %d" % [track_index + 1, total_tracks]
