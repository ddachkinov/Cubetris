extends Node

## TouchInputManager — Autoload singleton.
##
## Detects swipe (left/right track change) and tap (launch) gestures
## and emits signals consumed by Spawner.gd.
##
## Gesture rules:
##   Swipe left  — horizontal drag >  swipe_threshold px to the left
##   Swipe right — horizontal drag >  swipe_threshold px to the right
##   Tap         — touch released with total travel < tap_max_travel px
##                 AND held < tap_max_duration seconds
##                 AND no horizontal swipe was already triggered

# ---------------------------------------------------------------------------
# Signals
# ---------------------------------------------------------------------------
signal swiped_left
signal swiped_right
signal tapped

# ---------------------------------------------------------------------------
# Tuning (adjust in Inspector via Project Settings → Autoload)
# ---------------------------------------------------------------------------
@export var swipe_threshold:  float = 60.0   ## px needed to count as swipe
@export var tap_max_travel:   float = 20.0   ## px; more = accidental launch
@export var tap_max_duration: float = 0.35   ## seconds

# ---------------------------------------------------------------------------
# Internal state per active touch
# ---------------------------------------------------------------------------
var _touches: Dictionary = {}  ## finger_index → TouchData

class TouchData:
	var start_pos:  Vector2
	var current_pos: Vector2
	var start_time: float
	var swipe_fired: bool  ## prevent multiple swipes per drag

# ---------------------------------------------------------------------------
# Built-ins
# ---------------------------------------------------------------------------
func _ready() -> void:
	# Must be enabled for _input to receive screen-touch events
	pass   # Touch is always enabled in Godot 4 on mobile


func _input(event: InputEvent) -> void:
	# Only process when game is playing
	if GameManager.current_state != GameManager.GameState.PLAYING:
		return

	if event is InputEventScreenTouch:
		_handle_touch(event)
	elif event is InputEventScreenDrag:
		_handle_drag(event)


# ---------------------------------------------------------------------------
# Touch handlers
# ---------------------------------------------------------------------------
func _handle_touch(event: InputEventScreenTouch) -> void:
	if event.pressed:
		# Finger down — start tracking
		var td          := TouchData.new()
		td.start_pos    = event.position
		td.current_pos  = event.position
		td.start_time   = Time.get_ticks_msec() / 1000.0
		td.swipe_fired  = false
		_touches[event.index] = td

	else:
		# Finger up — decide tap or ignore
		if not _touches.has(event.index):
			return

		var td: TouchData = _touches[event.index]
		var held_time := Time.get_ticks_msec() / 1000.0 - td.start_time
		var travel    := td.start_pos.distance_to(event.position)

		# Tap = short, small movement, no swipe triggered
		if not td.swipe_fired \
		and travel    < tap_max_travel \
		and held_time < tap_max_duration:
			tapped.emit()

		_touches.erase(event.index)


func _handle_drag(event: InputEventScreenDrag) -> void:
	if not _touches.has(event.index):
		return

	var td: TouchData = _touches[event.index]
	td.current_pos = event.position

	if td.swipe_fired:
		return  # Already triggered a swipe this gesture

	var delta_x := event.position.x - td.start_pos.x

	if delta_x < -swipe_threshold:
		td.swipe_fired = true
		swiped_left.emit()
		# Reset start so player can chain swipes in one long drag
		td.start_pos = event.position

	elif delta_x > swipe_threshold:
		td.swipe_fired = true
		swiped_right.emit()
		td.start_pos = event.position


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------
func is_mobile() -> bool:
	return OS.has_feature("mobile") \
		or OS.has_feature("android") \
		or OS.has_feature("ios")
