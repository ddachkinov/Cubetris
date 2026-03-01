extends Node3D

## ─── Constants ───────────────────────────────────────────────────────────────
const GRID_COLS := 7
const GRID_ROWS := 12
const CUBE_SIZE := 1.0
const SHOOT_SPEED := 15.0
const WALL_INTERVAL_START := 12.0
const WALL_INTERVAL_MIN := 2.0
const CLEARS_PER_LEVEL := 10
const ROW_CLEAR_BONUS := 200

const CUBE_COLORS: Array[Color] = [
	Color("ff4444"),  # red
	Color("44bb44"),  # green
	Color("4488ff"),  # blue
	Color("ffcc00"),  # yellow
	Color("ff66ff"),  # magenta
]

# Special cube types (indices beyond normal colors)
const RAINBOW_INDEX := 5
const BOMB_INDEX := 6

## ─── State ───────────────────────────────────────────────────────────────────
var grid: Array = []          # grid[col][row] = { mesh, color_index } or null
var level := 1
var total_cleared := 0
var score := 0
var high_score := 0
var game_over := false
var paused := false
var current_col: int
var current_color_index: int
var next_color_index: int
var wall_timer := 0.0
var rainbow_time := 0.0

# Shooting
var shooting_cube_data: Dictionary = {}   # { mesh, col, target_row, color_index }
var shooting_active := false
var shooting_velocity := 0.0

# Juice
var shake_timer := 0.0
var shake_intensity := 0.0
var freeze_timer := 0.0
var spawn_scale_pop := 0.0

# Particles
var particles: Array = []

# Score popups
var score_popups: Array = []

# Audio cooldowns (matches web version throttling)
var last_explosion_time := 0.0
const EXPLOSION_COOLDOWN := 0.04
var last_bounce_time := 0.0
const BOUNCE_COOLDOWN := 0.025

# Touch
var touch_start_pos: Vector2 = Vector2.ZERO
var touch_start_col := 0
var touch_dragged := false
var touch_active := false
const DRAG_COL_PX := 40.0

## ─── Node references (created in _ready) ─────────────────────────────────────
var game_group: Node3D
var grid_container: Node3D
var spawn_cube: MeshInstance3D
var column_highlight: MeshInstance3D
var ghost_cube: MeshInstance3D
var ghost_mat: StandardMaterial3D
var camera: Camera3D
var world_env: WorldEnvironment

# Shared resources
var cube_box_mesh: BoxMesh
var cube_materials: Array[StandardMaterial3D] = []

# UI nodes
var ui_layer: CanvasLayer
var score_label: Label
var best_label: Label
var level_label: Label
var next_color_rect: ColorRect
var wall_warning_label: Label
var level_up_label: Label
var row_clear_label: Label
var game_over_panel: PanelContainer
var final_score_label: Label
var final_best_label: Label
var new_best_label: Label
var restart_button: Button
var pause_panel: PanelContainer
var resume_button: Button
var pause_restart_button: Button
var pause_button: Button
var tutorial_panel: PanelContainer
var tutorial_button: Button

# Camera base
var camera_base_y := 2.5
var camera_base_z := -6.0
var camera_target_x := 0.0
const CAMERA_LERP_SPEED := 8.0

# Animation timers for UI popups
var level_up_timer := 0.0
var row_clear_timer := 0.0

## ─── Audio ───────────────────────────────────────────────────────────────────
# Godot uses AudioStreamPlayer nodes. We synthesize simple sounds via
# AudioStreamWAV generated at runtime (matches the web version's approach).

var audio_explosion: AudioStreamPlayer
var audio_combo: AudioStreamPlayer
var audio_level_up: AudioStreamPlayer
var audio_bomb: AudioStreamPlayer
var audio_row_clear: AudioStreamPlayer
var audio_tick: AudioStreamPlayer
var audio_bounce: AudioStreamPlayer

## ─── Lifecycle ───────────────────────────────────────────────────────────────

func _ready() -> void:
	_load_high_score()
	_create_shared_resources()
	_setup_environment()
	_setup_camera()
	_setup_lights()
	_setup_scene_nodes()
	_create_grid_visual()
	_create_corridor()
	_setup_audio()
	_setup_ui()
	_init_grid()
	_new_game()

func _process(delta: float) -> void:
	var dt := minf(delta, 0.05)

	# UI popup fade timers
	if level_up_timer > 0.0:
		level_up_timer -= dt
		if level_up_timer <= 0.0:
			level_up_label.visible = false

	if row_clear_timer > 0.0:
		row_clear_timer -= dt
		if row_clear_timer <= 0.0:
			row_clear_label.visible = false

	# Score popups float upward and fade
	_update_score_popups(dt)

	if paused:
		return

	# Hit-freeze
	if freeze_timer > 0.0:
		freeze_timer -= dt
		dt = 0.0

	if not game_over:
		_update_shooting(dt)
		_update_particles(dt)
		_update_special_visuals(dt)
		_update_ghost()

		# Wall timer
		wall_timer += dt
		var interval := _get_wall_interval()
		var time_left := interval - wall_timer
		wall_warning_label.visible = time_left <= 3.0 and time_left > 0.0
		if wall_timer >= interval:
			wall_timer = 0.0
			wall_warning_label.visible = false
			_advance_wall()
	else:
		_update_particles(dt)

	# Spawn cube scale pop
	if spawn_scale_pop > 0.0:
		spawn_scale_pop = maxf(0.0, spawn_scale_pop - dt * 8.0)
		var s := 1.0 + spawn_scale_pop * 0.25
		spawn_cube.scale = Vector3(s, s, s)
	else:
		spawn_cube.scale = Vector3.ONE

	# Ghost pulse (Color is value type — must reassign whole color)
	if ghost_cube.visible:
		var gc := ghost_mat.albedo_color
		gc.a = 0.18 + sin(Time.get_ticks_msec() * 0.005) * 0.1
		ghost_mat.albedo_color = gc

	# Smooth camera tracking
	var lerp_factor := 1.0 - exp(-CAMERA_LERP_SPEED * dt)
	camera.position.x += (camera_target_x - camera.position.x) * lerp_factor

	# Screen shake
	if shake_timer > 0.0:
		shake_timer -= dt
		var decay := maxf(shake_timer, 0.0) / 0.3
		camera.position.y = camera_base_y + (randf() - 0.5) * shake_intensity * decay * 2.0
		camera.position.z = camera_base_z + (randf() - 0.5) * shake_intensity * decay * 2.0
		if shake_timer <= 0.0:
			shake_intensity = 0.0
			camera.position.y = camera_base_y
			camera.position.z = camera_base_z

	var field_depth := GRID_ROWS * CUBE_SIZE
	camera.look_at(Vector3(camera.position.x, 0.0, field_depth * 0.4))

func _unhandled_input(event: InputEvent) -> void:
	# Keyboard — use event.is_action() (not Input.is_action_just_pressed)
	if event is InputEventKey and event.pressed and not event.echo:
		if event.is_action("pause"):
			_toggle_pause()
			return
		if game_over or paused:
			return
		if event.is_action("move_left"):
			_move_column(1)  # Inverted to match web version's camera perspective
			_play_tick()
		elif event.is_action("move_right"):
			_move_column(-1)
			_play_tick()
		elif event.is_action("shoot"):
			_shoot()
		elif event.is_action("quick_drop"):
			_quick_drop()

	# Touch input
	if event is InputEventScreenTouch:
		if event.pressed:
			if game_over or paused:
				return
			touch_start_pos = event.position
			touch_start_col = current_col
			touch_dragged = false
			touch_active = true
		else:
			if not touch_active:
				return
			var dy := event.position.y - touch_start_pos.y
			var dx := event.position.x - touch_start_pos.x
			if not touch_dragged and absf(dy) < 30.0 and absf(dx) < 30.0:
				_shoot()
			elif not touch_dragged and dy < -30.0:
				_shoot()
			touch_active = false
			touch_dragged = false

	if event is InputEventScreenDrag and touch_active:
		if game_over or paused:
			return
		var dx := event.position.x - touch_start_pos.x
		var col_shift := roundi(-dx / DRAG_COL_PX)
		var new_col := clampi(touch_start_col + col_shift, 0, GRID_COLS - 1)
		if new_col != current_col:
			touch_dragged = true
			current_col = new_col
			_update_spawn_cube()
			_update_column_highlight()
			_update_ghost()
			spawn_scale_pop = 1.0
			_play_tick()
			Input.vibrate_handheld(12)

## ─── Shared resources ────────────────────────────────────────────────────────

func _create_shared_resources() -> void:
	cube_box_mesh = BoxMesh.new()
	cube_box_mesh.size = Vector3(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE)

	for color in CUBE_COLORS:
		var mat := StandardMaterial3D.new()
		mat.albedo_color = color
		mat.emission_enabled = true
		mat.emission = color
		mat.emission_energy_multiplier = 0.2
		cube_materials.append(mat)

	# Rainbow material
	var rainbow_mat := StandardMaterial3D.new()
	rainbow_mat.albedo_color = Color.WHITE
	rainbow_mat.emission_enabled = true
	rainbow_mat.emission = Color(0.2, 0.2, 0.2)
	rainbow_mat.emission_energy_multiplier = 1.0
	cube_materials.append(rainbow_mat)

	# Bomb material
	var bomb_mat := StandardMaterial3D.new()
	bomb_mat.albedo_color = Color("ff6600")
	bomb_mat.emission_enabled = true
	bomb_mat.emission = Color("331100")
	bomb_mat.emission_energy_multiplier = 1.0
	cube_materials.append(bomb_mat)

## ─── Scene setup ─────────────────────────────────────────────────────────────

func _setup_environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("0a0a1a")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("8888cc")
	env.ambient_light_energy = 0.4
	world_env = WorldEnvironment.new()
	world_env.environment = env
	add_child(world_env)

func _setup_camera() -> void:
	var grid_width := GRID_COLS * CUBE_SIZE
	var center_x := grid_width / 2.0 - CUBE_SIZE / 2.0
	camera = Camera3D.new()
	camera.fov = 60.0
	camera.position = Vector3(center_x, camera_base_y, camera_base_z)
	camera_target_x = center_x
	add_child(camera)
	camera.make_current()

func _setup_lights() -> void:
	var grid_width := GRID_COLS * CUBE_SIZE
	var center_x := grid_width / 2.0 - CUBE_SIZE / 2.0
	var field_depth := GRID_ROWS * CUBE_SIZE

	var dir_light := DirectionalLight3D.new()
	dir_light.position = Vector3(center_x, 8.0, -2.0)
	dir_light.look_at(Vector3(center_x, 0.0, field_depth / 2.0))
	dir_light.light_energy = 1.0
	dir_light.shadow_enabled = true
	add_child(dir_light)

	var back_light := OmniLight3D.new()
	back_light.position = Vector3(center_x, 2.0, field_depth + 2.0)
	back_light.light_energy = 0.6
	back_light.omni_range = 35.0
	back_light.light_color = Color("4466ff")
	add_child(back_light)

func _setup_scene_nodes() -> void:
	game_group = Node3D.new()
	game_group.name = "GameGroup"
	add_child(game_group)

	grid_container = Node3D.new()
	grid_container.name = "GridContainer"
	game_group.add_child(grid_container)

	# Spawn cube (preview at shooting position)
	spawn_cube = MeshInstance3D.new()
	spawn_cube.mesh = cube_box_mesh
	spawn_cube.material_override = cube_materials[0].duplicate()
	spawn_cube.position = Vector3(0.0, 0.0, -1.0)
	game_group.add_child(spawn_cube)

	# Column highlight strip
	var highlight_mesh := PlaneMesh.new()
	var field_depth := GRID_ROWS * CUBE_SIZE
	highlight_mesh.size = Vector2(CUBE_SIZE, field_depth + 4.0)
	column_highlight = MeshInstance3D.new()
	column_highlight.mesh = highlight_mesh
	var highlight_mat := StandardMaterial3D.new()
	highlight_mat.albedo_color = Color(1.0, 1.0, 1.0, 0.03)
	highlight_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	highlight_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	column_highlight.material_override = highlight_mat
	column_highlight.position.y = -CUBE_SIZE / 2.0 + 0.02
	column_highlight.position.z = field_depth / 2.0
	# PlaneMesh in Godot faces +Y by default, so rotation needed to lie flat is already correct
	game_group.add_child(column_highlight)

	# Ghost cube (wireframe-style preview at landing position, 0.98 scale like web)
	var ghost_box := BoxMesh.new()
	ghost_box.size = Vector3(CUBE_SIZE * 0.98, CUBE_SIZE * 0.98, CUBE_SIZE * 0.98)
	ghost_cube = MeshInstance3D.new()
	ghost_cube.mesh = ghost_box
	ghost_mat = StandardMaterial3D.new()
	ghost_mat.albedo_color = Color(1.0, 1.0, 1.0, 0.25)
	ghost_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ghost_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ghost_mat.no_depth_test = true
	ghost_cube.material_override = ghost_mat
	ghost_cube.visible = false
	game_group.add_child(ghost_cube)

func _create_grid_visual() -> void:
	var field_depth := GRID_ROWS * CUBE_SIZE
	var floor_y := -CUBE_SIZE / 2.0 + 0.01
	var core_left := -CUBE_SIZE / 2.0
	var core_right := GRID_COLS * CUBE_SIZE - CUBE_SIZE / 2.0
	var extra_cols := 6
	var extra_rows := 3
	var far_z := field_depth + extra_rows * CUBE_SIZE + 1.0

	var core_color := Color("5566aa")
	var fade_color := Color("334466")

	# Vertical grid lines
	for i in range(1, extra_cols + 1):
		_add_grid_line(Vector3(core_left - i * CUBE_SIZE, floor_y, -2.0),
					   Vector3(core_left - i * CUBE_SIZE, floor_y, far_z), fade_color)
	for c in range(GRID_COLS + 1):
		var x := c * CUBE_SIZE - CUBE_SIZE / 2.0
		_add_grid_line(Vector3(x, floor_y, -2.0), Vector3(x, floor_y, far_z), core_color)
	for i in range(1, extra_cols + 1):
		_add_grid_line(Vector3(core_right + i * CUBE_SIZE, floor_y, -2.0),
					   Vector3(core_right + i * CUBE_SIZE, floor_y, far_z), fade_color)

	# Horizontal grid lines
	var total_rows := GRID_ROWS + extra_rows
	var ext_left := core_left - extra_cols * CUBE_SIZE
	var ext_right := core_right + extra_cols * CUBE_SIZE
	for r in range(total_rows + 1):
		var z := r * CUBE_SIZE - CUBE_SIZE / 2.0
		var color := core_color if r <= GRID_ROWS else fade_color
		_add_grid_line(Vector3(ext_left, floor_y, z), Vector3(ext_right, floor_y, z), color)

	# Red danger line at the back
	var wall_z := (GRID_ROWS - 1) * CUBE_SIZE + CUBE_SIZE / 2.0
	_add_grid_line(Vector3(core_left, floor_y, wall_z), Vector3(core_right, floor_y, wall_z), Color("ff2222"))

func _add_grid_line(from: Vector3, to: Vector3, color: Color) -> void:
	var mesh_inst := MeshInstance3D.new()
	var im := ImmediateMesh.new()
	im.surface_begin(Mesh.PRIMITIVE_LINES)
	im.surface_set_color(color)
	im.surface_add_vertex(from)
	im.surface_set_color(color)
	im.surface_add_vertex(to)
	im.surface_end()
	mesh_inst.mesh = im
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.vertex_color_use_as_albedo = true
	mesh_inst.material_override = mat
	game_group.add_child(mesh_inst)

func _create_corridor() -> void:
	var field_depth := GRID_ROWS * CUBE_SIZE
	var grid_width := GRID_COLS * CUBE_SIZE
	var center_x := grid_width / 2.0 - CUBE_SIZE / 2.0
	var floor_y := -CUBE_SIZE / 2.0

	# Ground plane — match web: (gridWidth + EXTRA_COLS*2 + 4) × (FIELD_DEPTH + EXTRA_ROWS + 8)
	var extra_cols := 6
	var extra_rows := 3
	var ground := MeshInstance3D.new()
	var ground_mesh := PlaneMesh.new()
	ground_mesh.size = Vector2(grid_width + extra_cols * 2.0 * CUBE_SIZE + 4.0,
							   field_depth + extra_rows * CUBE_SIZE + 8.0)
	ground.mesh = ground_mesh
	var ground_mat := StandardMaterial3D.new()
	ground_mat.albedo_color = Color("111122")
	ground.material_override = ground_mat
	ground.position = Vector3(center_x, floor_y,
							  (field_depth + extra_rows * CUBE_SIZE) / 2.0 - 1.0)
	game_group.add_child(ground)

	# Side wall lines (vertical posts + top rail)
	var wall_height := CUBE_SIZE * 2.0
	var core_left := -CUBE_SIZE / 2.0
	var core_right := grid_width - CUBE_SIZE / 2.0
	var wall_color := Color("5566aa")

	for x_pos in [core_left, core_right]:
		for r in range(0, GRID_ROWS + 1, 2):
			var z := float(r) * CUBE_SIZE
			_add_grid_line(Vector3(x_pos, floor_y, z),
						   Vector3(x_pos, floor_y + wall_height, z), wall_color)
		_add_grid_line(Vector3(x_pos, floor_y + wall_height, -2.0),
					   Vector3(x_pos, floor_y + wall_height, field_depth + 1.0), wall_color)

## ─── Audio (synthesized WAV at runtime) ──────────────────────────────────────

func _setup_audio() -> void:
	audio_explosion = _create_audio_player()
	audio_combo = _create_audio_player()
	audio_level_up = _create_audio_player()
	audio_bomb = _create_audio_player()
	audio_row_clear = _create_audio_player()
	audio_tick = _create_audio_player()
	audio_bounce = _create_audio_player()

func _create_audio_player() -> AudioStreamPlayer:
	var player := AudioStreamPlayer.new()
	player.bus = "Master"
	add_child(player)
	return player

func _generate_noise_wav(duration: float, sample_rate: int = 22050) -> AudioStreamWAV:
	var wav := AudioStreamWAV.new()
	wav.mix_rate = sample_rate
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.stereo = false
	var num_samples := int(duration * sample_rate)
	var data := PackedByteArray()
	data.resize(num_samples * 2)
	for i in range(num_samples):
		var t := float(i) / float(num_samples)
		var envelope := exp(-t * 6.0)
		var sample := (randf() * 2.0 - 1.0) * envelope * 0.4
		var s16 := clampi(int(sample * 32767.0), -32768, 32767)
		data[i * 2] = s16 & 0xFF
		data[i * 2 + 1] = (s16 >> 8) & 0xFF
	wav.data = data
	return wav

func _generate_tone_wav(freq: float, duration: float, wave_type: String = "sine",
						sample_rate: int = 22050) -> AudioStreamWAV:
	var wav := AudioStreamWAV.new()
	wav.mix_rate = sample_rate
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.stereo = false
	var num_samples := int(duration * sample_rate)
	var data := PackedByteArray()
	data.resize(num_samples * 2)
	for i in range(num_samples):
		var t := float(i) / float(sample_rate)
		var envelope := exp(-t / duration * 4.0)
		var sample := 0.0
		if wave_type == "sine":
			sample = sin(TAU * freq * t)
		elif wave_type == "triangle":
			sample = 2.0 * absf(2.0 * (freq * t - floorf(freq * t + 0.5))) - 1.0
		sample *= envelope * 0.3
		var s16 := clampi(int(sample * 32767.0), -32768, 32767)
		data[i * 2] = s16 & 0xFF
		data[i * 2 + 1] = (s16 >> 8) & 0xFF
	wav.data = data
	return wav

func _play_explosion() -> void:
	var now := Time.get_ticks_msec() / 1000.0
	if now - last_explosion_time < EXPLOSION_COOLDOWN:
		return
	last_explosion_time = now
	audio_explosion.stream = _generate_noise_wav(0.25)
	audio_explosion.volume_db = -8.0
	audio_explosion.play()

func _play_bounce(velocity: float) -> void:
	var now := Time.get_ticks_msec() / 1000.0
	if now - last_bounce_time < BOUNCE_COOLDOWN:
		return
	last_bounce_time = now
	var vol := minf(0.18, absf(velocity) * 0.03)
	if vol < 0.005:
		return
	var freq := 3000.0 + randf() * 2000.0 + absf(velocity) * 200.0
	audio_bounce.stream = _generate_tone_wav(freq, 0.035, "sine")
	audio_bounce.volume_db = linear_to_db(vol)
	audio_bounce.play()

func _play_combo(chain: int) -> void:
	var base_note := 523.0
	var freq := base_note * pow(2.0, float(chain - 1) * 2.0 / 12.0)
	audio_combo.stream = _generate_tone_wav(freq, 0.15, "triangle")
	audio_combo.volume_db = -6.0
	audio_combo.play()

func _play_level_up() -> void:
	audio_level_up.stream = _generate_tone_wav(784.0, 0.3, "triangle")
	audio_level_up.volume_db = -6.0
	audio_level_up.play()

func _play_bomb() -> void:
	audio_bomb.stream = _generate_noise_wav(0.4)
	audio_bomb.volume_db = -4.0
	audio_bomb.play()

func _play_row_clear() -> void:
	audio_row_clear.stream = _generate_tone_wav(1000.0, 0.3, "sine")
	audio_row_clear.volume_db = -8.0
	audio_row_clear.play()

func _play_tick() -> void:
	audio_tick.stream = _generate_tone_wav(1200.0, 0.03, "sine")
	audio_tick.volume_db = -14.0
	audio_tick.play()

## ─── UI setup (all programmatic) ─────────────────────────────────────────────

func _setup_ui() -> void:
	ui_layer = CanvasLayer.new()
	ui_layer.layer = 10
	add_child(ui_layer)

	# ── Top HUD bar ──
	var top_bar := HBoxContainer.new()
	top_bar.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top_bar.offset_bottom = 60.0
	top_bar.add_theme_constant_override("separation", 20)
	ui_layer.add_child(top_bar)

	var top_bg := ColorRect.new()
	top_bg.color = Color(0, 0, 0, 0.5)
	top_bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	top_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top_bar.add_child(top_bg)

	# Spacer for alignment
	var spacer1 := Control.new()
	spacer1.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top_bar.add_child(spacer1)

	score_label = _make_label("SCORE: 0", 20)
	top_bar.add_child(score_label)

	best_label = _make_label("BEST: 0", 20)
	top_bar.add_child(best_label)

	level_label = _make_label("Level 1", 20)
	top_bar.add_child(level_label)

	# Next cube preview
	var next_container := HBoxContainer.new()
	next_container.add_theme_constant_override("separation", 6)
	top_bar.add_child(next_container)

	var next_label := _make_label("NEXT:", 18)
	next_container.add_child(next_label)

	next_color_rect = ColorRect.new()
	next_color_rect.custom_minimum_size = Vector2(24, 24)
	next_color_rect.color = Color("ff4444")
	next_container.add_child(next_color_rect)

	# Pause button
	pause_button = Button.new()
	pause_button.text = "II"
	pause_button.custom_minimum_size = Vector2(40, 40)
	pause_button.pressed.connect(_toggle_pause)
	top_bar.add_child(pause_button)

	var spacer2 := Control.new()
	spacer2.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top_bar.add_child(spacer2)

	# ── Wall warning ──
	wall_warning_label = _make_label("WALL APPROACHING!", 28)
	wall_warning_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	wall_warning_label.offset_top = 70.0
	wall_warning_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	wall_warning_label.add_theme_color_override("font_color", Color("ff4444"))
	wall_warning_label.visible = false
	ui_layer.add_child(wall_warning_label)

	# ── Level up banner ──
	level_up_label = _make_label("", 40)
	level_up_label.set_anchors_preset(Control.PRESET_CENTER)
	level_up_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	level_up_label.add_theme_color_override("font_color", Color("44ffcc"))
	level_up_label.visible = false
	ui_layer.add_child(level_up_label)

	# ── Row clear banner ──
	row_clear_label = _make_label("", 32)
	row_clear_label.set_anchors_preset(Control.PRESET_CENTER)
	row_clear_label.offset_top = 50.0
	row_clear_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	row_clear_label.add_theme_color_override("font_color", Color("ffcc00"))
	row_clear_label.visible = false
	ui_layer.add_child(row_clear_label)

	# ── Controls hint (bottom) ──
	var controls_label := _make_label("A/D move | SPACE shoot | W/S quick drop | ESC pause", 14)
	controls_label.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	controls_label.offset_top = -30.0
	controls_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	controls_label.add_theme_color_override("font_color", Color(1, 1, 1, 0.4))
	ui_layer.add_child(controls_label)

	# ── Game Over panel ──
	_setup_game_over_ui()

	# ── Pause panel ──
	_setup_pause_ui()

	# ── Tutorial panel ──
	_setup_tutorial_ui()

func _setup_game_over_ui() -> void:
	game_over_panel = PanelContainer.new()
	game_over_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	game_over_panel.visible = false
	ui_layer.add_child(game_over_panel)

	var bg := ColorRect.new()
	bg.color = Color(0, 0, 0, 0.75)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	game_over_panel.add_child(bg)

	var vbox := VBoxContainer.new()
	vbox.set_anchors_preset(Control.PRESET_CENTER)
	vbox.offset_left = -120.0
	vbox.offset_right = 120.0
	vbox.offset_top = -100.0
	vbox.offset_bottom = 100.0
	vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	vbox.add_theme_constant_override("separation", 12)
	game_over_panel.add_child(vbox)

	var title := _make_label("GAME OVER", 36)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_color_override("font_color", Color("ff4444"))
	vbox.add_child(title)

	final_score_label = _make_label("Score: 0", 24)
	final_score_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vbox.add_child(final_score_label)

	final_best_label = _make_label("Best: 0", 20)
	final_best_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vbox.add_child(final_best_label)

	new_best_label = _make_label("NEW BEST!", 28)
	new_best_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	new_best_label.add_theme_color_override("font_color", Color("ffcc00"))
	new_best_label.visible = false
	vbox.add_child(new_best_label)

	restart_button = Button.new()
	restart_button.text = "PLAY AGAIN"
	restart_button.custom_minimum_size = Vector2(200, 50)
	restart_button.pressed.connect(_restart_game)
	vbox.add_child(restart_button)

func _setup_pause_ui() -> void:
	pause_panel = PanelContainer.new()
	pause_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	pause_panel.visible = false
	ui_layer.add_child(pause_panel)

	var bg := ColorRect.new()
	bg.color = Color(0, 0, 0, 0.7)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pause_panel.add_child(bg)

	var vbox := VBoxContainer.new()
	vbox.set_anchors_preset(Control.PRESET_CENTER)
	vbox.offset_left = -100.0
	vbox.offset_right = 100.0
	vbox.offset_top = -60.0
	vbox.offset_bottom = 60.0
	vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	vbox.add_theme_constant_override("separation", 12)
	pause_panel.add_child(vbox)

	var title := _make_label("PAUSED", 36)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vbox.add_child(title)

	resume_button = Button.new()
	resume_button.text = "RESUME"
	resume_button.custom_minimum_size = Vector2(180, 45)
	resume_button.pressed.connect(_toggle_pause)
	vbox.add_child(resume_button)

	pause_restart_button = Button.new()
	pause_restart_button.text = "RESTART"
	pause_restart_button.custom_minimum_size = Vector2(180, 45)
	pause_restart_button.pressed.connect(func():
		paused = false
		pause_panel.visible = false
		_restart_game()
	)
	vbox.add_child(pause_restart_button)

func _setup_tutorial_ui() -> void:
	tutorial_panel = PanelContainer.new()
	tutorial_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	tutorial_panel.visible = not _has_seen_tutorial()
	ui_layer.add_child(tutorial_panel)

	var bg := ColorRect.new()
	bg.color = Color(0, 0, 0, 0.85)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tutorial_panel.add_child(bg)

	var vbox := VBoxContainer.new()
	vbox.set_anchors_preset(Control.PRESET_CENTER)
	vbox.offset_left = -200.0
	vbox.offset_right = 200.0
	vbox.offset_top = -200.0
	vbox.offset_bottom = 200.0
	vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	vbox.add_theme_constant_override("separation", 16)
	tutorial_panel.add_child(vbox)

	var title := _make_label("CUBETRIS", 40)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_color_override("font_color", Color("4488ff"))
	vbox.add_child(title)

	var rules: Array[String] = [
		"Shoot colored cubes down the corridor",
		"Match 3+ same-color cubes to clear them",
		"Chain combos for bonus points!",
		"Clear entire rows for big bonuses",
		"Walls advance from the back — don't let them reach you!",
		"",
		"A/← Move left   D/→ Move right",
		"SPACE Shoot   W/S Quick drop",
		"ESC Pause",
		"",
		"Touch: Swipe to aim, Tap to shoot",
	]
	for line in rules:
		var lbl := _make_label(line, 16)
		lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		lbl.autowrap_mode = TextServer.AUTOWRAP_WORD
		vbox.add_child(lbl)

	tutorial_button = Button.new()
	tutorial_button.text = "GOT IT!"
	tutorial_button.custom_minimum_size = Vector2(180, 50)
	tutorial_button.pressed.connect(func():
		tutorial_panel.visible = false
		_mark_tutorial_seen()
	)
	vbox.add_child(tutorial_button)

func _make_label(text: String, size: int) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	return label

## ─── Persistence (high score + tutorial flag) ────────────────────────────────

const SAVE_PATH := "user://cubetris_save.cfg"

func _load_high_score() -> void:
	var config := ConfigFile.new()
	if config.load(SAVE_PATH) == OK:
		high_score = config.get_value("game", "high_score", 0)

func _save_high_score() -> void:
	var config := ConfigFile.new()
	config.load(SAVE_PATH)  # load existing to preserve other keys
	config.set_value("game", "high_score", high_score)
	config.save(SAVE_PATH)

func _has_seen_tutorial() -> bool:
	var config := ConfigFile.new()
	if config.load(SAVE_PATH) == OK:
		return config.get_value("game", "tutorial_seen", false)
	return false

func _mark_tutorial_seen() -> void:
	var config := ConfigFile.new()
	config.load(SAVE_PATH)
	config.set_value("game", "tutorial_seen", true)
	config.save(SAVE_PATH)

## ─── Grid operations ─────────────────────────────────────────────────────────

func _init_grid() -> void:
	grid.clear()
	for c in range(GRID_COLS):
		var col_arr: Array = []
		col_arr.resize(GRID_ROWS)
		for r in range(GRID_ROWS):
			col_arr[r] = null
		grid.append(col_arr)

func _col_to_x(col: int) -> float:
	return float(col) * CUBE_SIZE

func _row_to_z(row: int) -> float:
	return float(row) * CUBE_SIZE

func _landing_row(col: int) -> int:
	for r in range(GRID_ROWS):
		if grid[col][r] != null:
			return r - 1
	return GRID_ROWS - 1

func _place_cube(col: int, row: int, color_index: int) -> void:
	if row < 0 or row >= GRID_ROWS:
		return
	var mesh := _create_cube_mesh(color_index)
	mesh.position = Vector3(_col_to_x(col), 0.0, _row_to_z(row))
	grid_container.add_child(mesh)
	grid[col][row] = { "mesh": mesh, "color_index": color_index }

func _remove_cube(col: int, row: int) -> void:
	var cell = grid[col][row]
	if cell == null:
		return
	var mesh: MeshInstance3D = cell["mesh"]
	grid_container.remove_child(mesh)
	mesh.queue_free()
	grid[col][row] = null

func _create_cube_mesh(color_index: int) -> MeshInstance3D:
	var mesh_inst := MeshInstance3D.new()
	mesh_inst.mesh = cube_box_mesh
	mesh_inst.material_override = cube_materials[color_index].duplicate()
	return mesh_inst

## ─── Helpers ─────────────────────────────────────────────────────────────────

## Godot only has HSV; Three.js setHSL uses HSL. Convert HSL→RGB directly.
static func _color_from_hsl(h: float, s: float, l: float) -> Color:
	var c := (1.0 - absf(2.0 * l - 1.0)) * s
	var x := c * (1.0 - absf(fmod(h * 6.0, 2.0) - 1.0))
	var m := l - c / 2.0
	var r := 0.0; var g := 0.0; var b := 0.0
	var sector := int(h * 6.0) % 6
	match sector:
		0: r = c; g = x; b = 0.0
		1: r = x; g = c; b = 0.0
		2: r = 0.0; g = c; b = x
		3: r = 0.0; g = x; b = c
		4: r = x; g = 0.0; b = c
		5: r = c; g = 0.0; b = x
	return Color(r + m, g + m, b + m)

func _get_active_color_count() -> int:
	if level >= 4:
		return 5
	if level >= 2:
		return 4
	return 3

func _get_wall_interval() -> float:
	return maxf(WALL_INTERVAL_MIN, WALL_INTERVAL_START - float(level - 1) * 0.8)

func _random_color_index() -> int:
	if level >= 6 and randf() < 0.04:
		return BOMB_INDEX
	if level >= 4 and randf() < 0.05:
		return RAINBOW_INDEX
	return randi_range(0, _get_active_color_count() - 1)

func _random_wall_color_index() -> int:
	return randi_range(0, _get_active_color_count() - 1)

## ─── Column / ghost / spawn updates ─────────────────────────────────────────

func _move_column(dir: int) -> void:
	current_col = clampi(current_col + dir, 0, GRID_COLS - 1)
	_update_spawn_cube()
	_update_column_highlight()
	_update_ghost()

func _update_column_highlight() -> void:
	column_highlight.position.x = _col_to_x(current_col)

func _update_spawn_cube() -> void:
	spawn_cube.position.x = _col_to_x(current_col)
	var mat: StandardMaterial3D = spawn_cube.material_override
	if current_color_index == RAINBOW_INDEX:
		mat.albedo_color = Color.WHITE
		mat.emission = Color(0.2, 0.2, 0.2)
	elif current_color_index == BOMB_INDEX:
		mat.albedo_color = Color("ff6600")
		mat.emission = Color("221100")
	else:
		mat.albedo_color = CUBE_COLORS[current_color_index]
		mat.emission = Color.BLACK
	camera_target_x = _col_to_x(current_col)

func _update_ghost() -> void:
	if game_over or paused or shooting_active:
		ghost_cube.visible = false
		return
	var row := _landing_row(current_col)
	if row < 0:
		ghost_cube.visible = false
		return
	ghost_cube.position = Vector3(_col_to_x(current_col), 0.0, _row_to_z(row))
	if current_color_index == RAINBOW_INDEX:
		ghost_mat.albedo_color = Color(1.0, 1.0, 1.0, 0.25)
	elif current_color_index == BOMB_INDEX:
		ghost_mat.albedo_color = Color(1.0, 0.53, 0.0, 0.25)
	else:
		var c := CUBE_COLORS[current_color_index]
		ghost_mat.albedo_color = Color(c.r, c.g, c.b, 0.25)
	ghost_cube.visible = true

func _update_next_preview() -> void:
	if next_color_index == RAINBOW_INDEX:
		# Animate rainbow in _process — set a flag color to detect
		next_color_rect.color = Color.MAGENTA  # placeholder, animated per-frame
	elif next_color_index == BOMB_INDEX:
		next_color_rect.color = Color("ff6600")
	else:
		next_color_rect.color = CUBE_COLORS[next_color_index]

## ─── Shooting ────────────────────────────────────────────────────────────────

func _shoot() -> void:
	if game_over or paused or shooting_active:
		return
	var row := _landing_row(current_col)
	if row < 0:
		return

	var mesh := _create_cube_mesh(current_color_index)
	mesh.position = Vector3(_col_to_x(current_col), 0.0, spawn_cube.position.z)
	game_group.add_child(mesh)

	shooting_cube_data = {
		"mesh": mesh,
		"col": current_col,
		"target_row": row,
		"color_index": current_color_index,
	}
	shooting_active = true
	shooting_velocity = SHOOT_SPEED

	current_color_index = next_color_index
	next_color_index = _random_color_index()
	_update_spawn_cube()
	_update_next_preview()

func _quick_drop() -> void:
	if game_over or paused or shooting_active:
		return
	var row := _landing_row(current_col)
	if row < 0:
		return

	_place_cube(current_col, row, current_color_index)

	var result := _resolve_matches()
	if result["total_cleared"] > 0:
		_add_score(result["total_cleared"], result["chain_step"], result["total_row_clears"])

	current_color_index = next_color_index
	next_color_index = _random_color_index()
	_update_spawn_cube()
	_update_next_preview()
	_check_game_over()

func _update_shooting(dt: float) -> void:
	if not shooting_active:
		return

	var col: int = shooting_cube_data["col"]
	var fresh_row := _landing_row(col)
	if fresh_row < 0:
		var mesh: MeshInstance3D = shooting_cube_data["mesh"]
		game_group.remove_child(mesh)
		mesh.queue_free()
		shooting_active = false
		_check_game_over()
		return

	shooting_cube_data["target_row"] = fresh_row
	var target_z := _row_to_z(fresh_row)
	var mesh: MeshInstance3D = shooting_cube_data["mesh"]
	mesh.position.z += shooting_velocity * dt

	if mesh.position.z >= target_z:
		mesh.position.z = target_z
		game_group.remove_child(mesh)
		mesh.queue_free()

		_place_cube(col, fresh_row, shooting_cube_data["color_index"])

		var result := _resolve_matches()
		if result["total_cleared"] > 0:
			_add_score(result["total_cleared"], result["chain_step"], result["total_row_clears"])

		shooting_active = false
		_check_game_over()

## ─── Match resolution ────────────────────────────────────────────────────────

func _find_match_group(col: int, row: int) -> Array:
	var cell = grid[col][row]
	if cell == null:
		return []
	var ci: int = cell["color_index"]
	if ci == BOMB_INDEX or ci == RAINBOW_INDEX:
		return []

	var visited := {}
	var group: Array = []

	var stack: Array = [[col, row]]
	while stack.size() > 0:
		var pos: Array = stack.pop_back()
		var c: int = pos[0]
		var r: int = pos[1]
		var key := "%d,%d" % [c, r]
		if visited.has(key):
			continue
		if c < 0 or c >= GRID_COLS or r < 0 or r >= GRID_ROWS:
			continue
		var cell2 = grid[c][r]
		if cell2 == null:
			continue
		if cell2["color_index"] != ci:
			continue
		visited[key] = true
		group.append([c, r])
		stack.append([c - 1, r])
		stack.append([c + 1, r])
		stack.append([c, r - 1])
		stack.append([c, r + 1])

	return group

func _resolve_matches() -> Dictionary:
	var total_cleared := 0
	var chain_step := 0
	var total_row_clears := 0
	var any_bombs := false
	var changed := true

	while changed:
		changed = false
		var to_remove := {}

		# Rainbow activation: cross-clear (itself + 4 neighbors)
		for c in range(GRID_COLS):
			for r in range(GRID_ROWS):
				var cell = grid[c][r]
				if cell != null and cell["color_index"] == RAINBOW_INDEX:
					to_remove["%d,%d" % [c, r]] = true
					for neighbor in [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]]:
						var nc: int = neighbor[0]
						var nr: int = neighbor[1]
						if nc >= 0 and nc < GRID_COLS and nr >= 0 and nr < GRID_ROWS and grid[nc][nr] != null:
							to_remove["%d,%d" % [nc, nr]] = true

		# Color matches (3+)
		for c in range(GRID_COLS):
			for r in range(GRID_ROWS):
				if grid[c][r] == null:
					continue
				var group := _find_match_group(c, r)
				if group.size() >= 3:
					for pos in group:
						to_remove["%d,%d" % [pos[0], pos[1]]] = true

		# Bomb chain detonation
		if to_remove.size() > 0:
			for _iter in range(10):
				var bomb_keys: Array = []
				for c in range(GRID_COLS):
					for r in range(GRID_ROWS):
						var cell = grid[c][r]
						if cell == null or cell["color_index"] != BOMB_INDEX:
							continue
						if to_remove.has("%d,%d" % [c, r]):
							continue
						var triggered := false
						for neighbor in [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]]:
							if to_remove.has("%d,%d" % [neighbor[0], neighbor[1]]):
								triggered = true
								break
						if triggered:
							bomb_keys.append([c, r])
				if bomb_keys.size() == 0:
					break
				any_bombs = true
				for bk in bomb_keys:
					var bc: int = bk[0]
					var br: int = bk[1]
					for dc in range(-1, 2):
						for dr in range(-1, 2):
							var nc := bc + dc
							var nr := br + dr
							if nc >= 0 and nc < GRID_COLS and nr >= 0 and nr < GRID_ROWS and grid[nc][nr] != null:
								to_remove["%d,%d" % [nc, nr]] = true

		if to_remove.size() > 0:
			changed = true
			chain_step += 1

			# Check full row clears
			for r in range(GRID_ROWS):
				var all_cols := true
				for c in range(GRID_COLS):
					if not to_remove.has("%d,%d" % [c, r]):
						all_cols = false
						break
				if all_cols:
					total_row_clears += 1

			# Process removals
			var sum_x := 0.0
			var sum_z := 0.0
			var count := 0
			for key in to_remove.keys():
				var parts := key.split(",")
				var c := int(parts[0])
				var r := int(parts[1])
				var cell = grid[c][r]
				if cell != null:
					sum_x += _col_to_x(c)
					sum_z += _row_to_z(r)
					count += 1
					_spawn_particles(c, r, cell["color_index"])
					_remove_cube(c, r)
					total_cleared += 1

			# Score popup at average position of cleared cubes
			if count > 0:
				var points := count * 10 * chain_step
				var is_combo := chain_step > 1
				var popup_text := "+%d x%d" % [points, chain_step] if is_combo else "+%d" % points
				_spawn_score_popup(sum_x / count, sum_z / count, popup_text, is_combo)
				if is_combo:
					_play_combo(chain_step)

			_apply_gravity()

	# Post-resolve effects
	if any_bombs:
		_play_bomb()

	if total_row_clears > 0:
		_show_row_clear_banner(total_row_clears)
		_trigger_shake(0.25, 0.35)
		_trigger_freeze(0.1)

	if total_cleared > 0:
		if total_cleared >= 5 or chain_step > 1:
			_trigger_freeze(0.08)
			_trigger_shake(0.12 + chain_step * 0.06, 0.2 + chain_step * 0.05)
		else:
			_trigger_shake(0.06, 0.12)

	return {
		"total_cleared": total_cleared,
		"chain_step": chain_step,
		"total_row_clears": total_row_clears,
	}

## ─── Gravity ─────────────────────────────────────────────────────────────────

func _apply_gravity() -> void:
	for c in range(GRID_COLS):
		var write_row := GRID_ROWS - 1
		for r in range(GRID_ROWS - 1, -1, -1):
			if grid[c][r] != null:
				if r != write_row:
					grid[c][write_row] = grid[c][r]
					grid[c][r] = null
					var mesh: MeshInstance3D = grid[c][write_row]["mesh"]
					mesh.position.z = _row_to_z(write_row)
				write_row -= 1

## ─── Particles ───────────────────────────────────────────────────────────────

func _spawn_particles(col: int, row: int, color_index: int) -> void:
	_play_explosion()
	var cx := _col_to_x(col)
	var cz := _row_to_z(row)
	var count := 8 if color_index == BOMB_INDEX else 14

	for i in range(count):
		var p_color: Color
		if color_index == RAINBOW_INDEX:
			p_color = CUBE_COLORS[randi_range(0, CUBE_COLORS.size() - 1)]
		elif color_index == BOMB_INDEX:
			p_color = Color("ff6600") if randf() < 0.5 else Color("ffcc00")
		else:
			p_color = CUBE_COLORS[color_index]

		var size := 0.08 + randf() * 0.14
		var box := BoxMesh.new()
		box.size = Vector3(size, size, size)
		var mesh_inst := MeshInstance3D.new()
		mesh_inst.mesh = box
		var mat := StandardMaterial3D.new()
		mat.albedo_color = p_color
		mesh_inst.material_override = mat
		mesh_inst.position = Vector3(cx, 0.0, cz)
		game_group.add_child(mesh_inst)

		var angle := TAU * float(i) / float(count) + randf() * 0.3
		var spd := (3.5 + randf() * 4.0) if color_index == BOMB_INDEX else (2.5 + randf() * 3.5)
		var vy_base := 3.0 if color_index == BOMB_INDEX else 2.0

		particles.append({
			"mesh": mesh_inst,
			"vx": cos(angle) * spd,
			"vy": absf(sin(angle)) * spd * 0.8 + vy_base,
			"vz": sin(angle) * spd * 0.5,
			"life": 1.2 + randf() * 0.6,
			"floor_y": -CUBE_SIZE / 2.0 + size / 2.0,
			"bounce_damping": 0.4 + randf() * 0.2,
			"spin_speed": (randf() - 0.5) * 12.0,
		})

func _update_particles(dt: float) -> void:
	var i := particles.size() - 1
	while i >= 0:
		var p: Dictionary = particles[i]
		var mesh: MeshInstance3D = p["mesh"]
		mesh.position.x += p["vx"] * dt
		mesh.position.y += p["vy"] * dt
		mesh.position.z += p["vz"] * dt
		p["vy"] -= 12.0 * dt

		if mesh.position.y <= p["floor_y"] and p["vy"] < 0.0:
			_play_bounce(p["vy"])
			mesh.position.y = p["floor_y"]
			p["vy"] = -p["vy"] * p["bounce_damping"]
			p["vx"] *= 0.8
			p["vz"] *= 0.8

		mesh.rotation.x += p["spin_speed"] * dt
		mesh.rotation.z += p["spin_speed"] * 0.7 * dt

		p["life"] -= dt
		var fade_start := 0.4
		var s := p["life"] / fade_start if p["life"] < fade_start else 1.0
		s = maxf(0.0, s)
		mesh.scale = Vector3(s, s, s)

		if p["life"] <= 0.0:
			game_group.remove_child(mesh)
			mesh.queue_free()
			particles.remove_at(i)
		i -= 1

## ─── Score popups ────────────────────────────────────────────────────────────

func _spawn_score_popup(world_x: float, world_z: float, text: String, is_combo: bool) -> void:
	# Project 3D position to screen space
	var world_pos := Vector3(world_x, 1.0, world_z)
	if not camera.is_position_behind(world_pos):
		var screen_pos := camera.unproject_position(world_pos)
		var label := Label.new()
		label.text = text
		label.add_theme_font_size_override("font_size", 22 if is_combo else 18)
		label.add_theme_color_override("font_color", Color("ffcc00") if is_combo else Color.WHITE)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.position = screen_pos - Vector2(40, 10)
		ui_layer.add_child(label)
		score_popups.append({ "label": label, "life": 1.0 })

func _update_score_popups(dt: float) -> void:
	var i := score_popups.size() - 1
	while i >= 0:
		var p: Dictionary = score_popups[i]
		var label: Label = p["label"]
		p["life"] -= dt
		# Float upward
		label.position.y -= 60.0 * dt
		# Fade out
		var alpha := clampf(p["life"] / 0.4, 0.0, 1.0)
		label.modulate.a = alpha
		if p["life"] <= 0.0:
			ui_layer.remove_child(label)
			label.queue_free()
			score_popups.remove_at(i)
		i -= 1

## ─── Special cube visuals ────────────────────────────────────────────────────

func _update_special_visuals(dt: float) -> void:
	rainbow_time += dt

	for c in range(GRID_COLS):
		for r in range(GRID_ROWS):
			var cell = grid[c][r]
			if cell == null:
				continue
			var mesh: MeshInstance3D = cell["mesh"]
			var mat: StandardMaterial3D = mesh.material_override
			var ci: int = cell["color_index"]

			if ci == RAINBOW_INDEX:
				var hue := fmod(rainbow_time * 0.5 + c * 0.1 + r * 0.05, 1.0)
				mat.albedo_color = _color_from_hsl(hue, 0.7, 0.7)
				mat.emission = _color_from_hsl(hue, 1.0, 0.15)

			if ci == BOMB_INDEX:
				var pulse := sin(rainbow_time * 4.0) * 0.5 + 0.5
				mat.emission = Color(0.3 * pulse, 0.15 * pulse, 0.0)

	# Spawn cube special animations
	var spawn_mat: StandardMaterial3D = spawn_cube.material_override
	if current_color_index == RAINBOW_INDEX:
		var hue := fmod(rainbow_time * 0.5, 1.0)
		spawn_mat.albedo_color = _color_from_hsl(hue, 0.7, 0.7)
		spawn_mat.emission = _color_from_hsl(hue, 1.0, 0.15)
	elif current_color_index == BOMB_INDEX:
		var pulse := sin(rainbow_time * 4.0) * 0.5 + 0.5
		spawn_mat.emission = Color(0.3 * pulse, 0.15 * pulse, 0.0)

	# Next preview rainbow cycling
	if next_color_index == RAINBOW_INDEX:
		var hue := fmod(rainbow_time * 0.8, 1.0)
		next_color_rect.color = _color_from_hsl(hue, 0.9, 0.6)

## ─── Wall advancement ────────────────────────────────────────────────────────

func _advance_wall() -> void:
	# Check if front row occupied → game over
	for c in range(GRID_COLS):
		if grid[c][0] != null:
			_trigger_game_over()
			return

	# Shift everything forward (toward row 0)
	for c in range(GRID_COLS):
		for r in range(GRID_ROWS - 1):
			grid[c][r] = grid[c][r + 1]
			if grid[c][r] != null:
				var mesh: MeshInstance3D = grid[c][r]["mesh"]
				mesh.position.z = _row_to_z(r)
		grid[c][GRID_ROWS - 1] = null

	# Add new wall row at the back
	for c in range(GRID_COLS):
		_place_cube(c, GRID_ROWS - 1, _random_wall_color_index())

	var result := _resolve_matches()
	if result["total_cleared"] > 0:
		_add_score(result["total_cleared"], result["chain_step"], result["total_row_clears"])

	_check_game_over()

## ─── Juice ───────────────────────────────────────────────────────────────────

func _trigger_shake(intensity: float, duration: float) -> void:
	shake_intensity = maxf(shake_intensity, intensity)
	shake_timer = maxf(shake_timer, duration)

func _trigger_freeze(duration: float) -> void:
	freeze_timer = maxf(freeze_timer, duration)

func _show_row_clear_banner(count: int) -> void:
	var text := "%dx ROW CLEAR! +%d" % [count, count * ROW_CLEAR_BONUS] if count > 1 else "ROW CLEAR! +%d" % ROW_CLEAR_BONUS
	row_clear_label.text = text
	row_clear_label.visible = true
	row_clear_timer = 1.0
	_play_row_clear()

## ─── Scoring ─────────────────────────────────────────────────────────────────

func _add_score(cleared: int, chain: int, row_clears: int) -> void:
	var points := cleared * 10 * maxi(1, chain)
	var row_bonus := row_clears * ROW_CLEAR_BONUS
	score += points + row_bonus
	score_label.text = "SCORE: %d" % score
	_check_level_up(cleared)

func _check_level_up(cleared_this_action: int) -> void:
	total_cleared += cleared_this_action
	var new_level := total_cleared / CLEARS_PER_LEVEL + 1
	if new_level > level:
		level = new_level
		level_label.text = "Level %d" % level

		# Background color shifts per level (matches web version)
		var hue := fmod(0.65 + (level - 1) * 0.04, 1.0)
		var sat := 0.3 + minf(level * 0.05, 0.4)
		var lum := 0.06 + minf(level * 0.005, 0.04)
		world_env.environment.background_color = _color_from_hsl(hue, sat, lum)

		level_up_label.text = "LEVEL %d" % level
		level_up_label.visible = true
		level_up_timer = 1.4
		_play_level_up()
		_trigger_shake(0.15, 0.3)

## ─── Game flow ───────────────────────────────────────────────────────────────

func _check_game_over() -> void:
	for c in range(GRID_COLS):
		if grid[c][0] != null:
			_trigger_game_over()
			return

func _trigger_game_over() -> void:
	game_over = true
	final_score_label.text = "Score: %d" % score

	var is_new_best := score > high_score
	if is_new_best:
		high_score = score
		_save_high_score()
		best_label.text = "BEST: %d" % high_score

	final_best_label.text = "Best: %d" % high_score
	new_best_label.visible = is_new_best
	game_over_panel.visible = true

func _new_game() -> void:
	current_col = GRID_COLS / 2
	current_color_index = _random_color_index()
	next_color_index = _random_color_index()
	_update_spawn_cube()
	_update_column_highlight()
	_update_next_preview()
	_update_ghost()

	var grid_width := GRID_COLS * CUBE_SIZE
	camera_target_x = _col_to_x(current_col)
	camera.position.x = camera_target_x

	best_label.text = "BEST: %d" % high_score

func _restart_game() -> void:
	# Clear grid
	for c in range(GRID_COLS):
		for r in range(GRID_ROWS):
			if grid[c][r] != null:
				var mesh: MeshInstance3D = grid[c][r]["mesh"]
				grid_container.remove_child(mesh)
				mesh.queue_free()
				grid[c][r] = null

	# Clear particles
	for p in particles:
		var mesh: MeshInstance3D = p["mesh"]
		game_group.remove_child(mesh)
		mesh.queue_free()
	particles.clear()

	# Clear score popups
	for p in score_popups:
		var label: Label = p["label"]
		ui_layer.remove_child(label)
		label.queue_free()
	score_popups.clear()

	# Clear shooting cube
	if shooting_active:
		var mesh: MeshInstance3D = shooting_cube_data["mesh"]
		game_group.remove_child(mesh)
		mesh.queue_free()
		shooting_active = false

	# Reset state
	score = 0
	score_label.text = "SCORE: 0"
	game_over = false
	paused = false
	wall_timer = 0.0
	shake_timer = 0.0
	shake_intensity = 0.0
	freeze_timer = 0.0
	level = 1
	total_cleared = 0
	level_label.text = "Level 1"
	world_env.environment.background_color = Color("0a0a1a")

	wall_warning_label.visible = false
	game_over_panel.visible = false
	pause_panel.visible = false

	_init_grid()
	_new_game()

func _toggle_pause() -> void:
	if game_over:
		return
	paused = not paused
	pause_panel.visible = paused
