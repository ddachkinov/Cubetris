extends Node

## MobilePerformanceManager — Autoload singleton.
##
## Detects the device tier at startup and applies appropriate quality
## settings so the game runs well on everything from an iPhone 8 to a
## flagship Android phone.
##
## Tier detection is heuristic (RAM + GPU renderer string).
## Designers can override the tier from the Godot Remote Inspector.

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
enum DeviceTier { LOW, MEDIUM, HIGH }

# ---------------------------------------------------------------------------
# Per-tier quality presets
# ---------------------------------------------------------------------------
const PRESETS := {
	DeviceTier.LOW: {
		"voxels_per_explosion":  6,
		"max_active_voxels":     50,
		"shadow_enabled":        false,
		"msaa":                  Viewport.MSAA_DISABLED,
		"target_fps":            30,
		"pool_cubes":            30,
		"pool_voxels":           60,
	},
	DeviceTier.MEDIUM: {
		"voxels_per_explosion":  12,
		"max_active_voxels":     120,
		"shadow_enabled":        true,
		"msaa":                  Viewport.MSAA_2X,
		"target_fps":            60,
		"pool_cubes":            50,
		"pool_voxels":           100,
	},
	DeviceTier.HIGH: {
		"voxels_per_explosion":  20,
		"max_active_voxels":     200,
		"shadow_enabled":        true,
		"msaa":                  Viewport.MSAA_4X,
		"target_fps":            60,
		"pool_cubes":            50,
		"pool_voxels":           100,
	},
}

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
var current_tier: DeviceTier = DeviceTier.MEDIUM
var _preset: Dictionary = {}

# ---------------------------------------------------------------------------
# Built-ins
# ---------------------------------------------------------------------------
func _ready() -> void:
	# Desktop always gets HIGH — only throttle on mobile
	if not _is_mobile():
		current_tier = DeviceTier.HIGH
	else:
		current_tier = _detect_tier()

	_apply_preset(current_tier)

	print("MobilePerformanceManager | platform=%s | tier=%s" % [
		_platform_name(), DeviceTier.keys()[current_tier]
	])


# ---------------------------------------------------------------------------
# Tier detection
# ---------------------------------------------------------------------------
func _detect_tier() -> DeviceTier:
	var ram_mb   := OS.get_memory_info().get("physical", 0) / (1024 * 1024)
	var renderer := RenderingServer.get_video_adapter_name().to_lower()

	# Low: very old chipsets or very low RAM
	if ram_mb < 2048 or "mali-4" in renderer or "adreno 3" in renderer:
		return DeviceTier.LOW

	# High: modern chipsets
	if ram_mb >= 6144 \
	or "apple gpu" in renderer \
	or "adreno 7" in renderer \
	or "adreno 6" in renderer \
	or "mali-g7" in renderer \
	or "mali-g9" in renderer:
		return DeviceTier.HIGH

	return DeviceTier.MEDIUM


# ---------------------------------------------------------------------------
# Apply preset to all systems
# ---------------------------------------------------------------------------
func _apply_preset(tier: DeviceTier) -> void:
	_preset = PRESETS[tier]

	# Frame rate cap
	Engine.max_fps = _preset["target_fps"]

	# Viewport MSAA
	get_viewport().msaa_3d = _preset["msaa"]

	# Shadows on/off via the DirectionalLight3D in the scene
	# (done lazily when scene is ready)
	_apply_shadows_when_ready()

	# Patch ExplosionEffect if it's already loaded
	if ExplosionEffect:
		ExplosionEffect.voxels_per_explosion = _preset["voxels_per_explosion"]
		ExplosionEffect.max_active_voxels    = _preset["max_active_voxels"]


func _apply_shadows_when_ready() -> void:
	# Wait one frame so the main scene is fully instanced
	await get_tree().process_frame
	var lights := get_tree().get_nodes_in_group("directional_lights")
	for light in lights:
		if light is DirectionalLight3D:
			light.shadow_enabled = _preset["shadow_enabled"]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
func force_tier(tier: DeviceTier) -> void:
	## Override from the Remote Inspector during profiling sessions.
	current_tier = tier
	_apply_preset(tier)
	print("Forced tier → %s" % DeviceTier.keys()[tier])


func get_pool_sizes() -> Dictionary:
	return {
		"cubes":  _preset.get("pool_cubes",  50),
		"voxels": _preset.get("pool_voxels", 100),
	}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
func _is_mobile() -> bool:
	return OS.has_feature("mobile") \
		or OS.has_feature("android") \
		or OS.has_feature("ios")


func _platform_name() -> String:
	if OS.has_feature("ios"):     return "iOS"
	if OS.has_feature("android"): return "Android"
	if OS.has_feature("windows"): return "Windows"
	if OS.has_feature("macos"):   return "macOS"
	if OS.has_feature("linuxbsd"):return "Linux"
	return "Unknown"
