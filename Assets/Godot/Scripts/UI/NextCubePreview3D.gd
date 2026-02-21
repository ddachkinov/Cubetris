extends SubViewport

## NextCubePreview3D — Renders a 3D cube in the UI
## Attached to the SubViewport node that displays the next cube

# ---------------------------------------------------------------------------
# Node references
# ---------------------------------------------------------------------------
@onready var cube_mesh: MeshInstance3D = $PreviewScene/CubeMesh

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
var rotation_speed: float = 2.0  # radians per second
var current_color: Color = Color.WHITE

# ---------------------------------------------------------------------------
# Built-ins
# ---------------------------------------------------------------------------
func _ready() -> void:
	# Set transparent background
	transparent_bg = true

	# Initialize with white color
	set_cube_color(Color.WHITE)


func _process(delta: float) -> void:
	# Continuously rotate the cube in 3D space
	if cube_mesh:
		cube_mesh.rotate_y(delta * rotation_speed)
		cube_mesh.rotate_x(delta * rotation_speed * 0.5)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
func set_cube_color(color: Color) -> void:
	"""Update the cube material color"""
	current_color = color

	if not cube_mesh:
		return

	# Create glossy material matching in-game cubes
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color

	# Glossy finish
	mat.metallic = 0.0
	mat.roughness = 0.25
	mat.metallic_specular = 0.7

	# Rim lighting
	mat.rim_enabled = true
	mat.rim = 0.6
	mat.rim_tint = 0.8

	# Slight emission glow
	mat.emission_enabled = true
	mat.emission = color
	mat.emission_energy_multiplier = 0.1

	cube_mesh.set_surface_override_material(0, mat)
