shader_type sky;

// Gradient sky shader - creates smooth blue to white gradient
// Based on view direction (EYEDIR.y)

uniform vec4 top_color : source_color = vec4(0.0, 0.3, 0.8, 1.0);      // Deep blue at zenith
uniform vec4 horizon_color : source_color = vec4(0.6, 0.85, 1.0, 1.0); // Cyan at horizon
uniform vec4 bottom_color : source_color = vec4(0.9, 0.95, 1.0, 1.0);  // Near-white below horizon
uniform float horizon_falloff : hint_range(0.1, 5.0) = 2.0;

void sky() {
	// EYEDIR.y ranges from -1 (looking down) to +1 (looking up)
	float normalized_y = EYEDIR.y; // -1 to 1

	// Split into upper hemisphere (sky) and lower hemisphere (ground)
	if (normalized_y > 0.0) {
		// Upper hemisphere: blend from horizon to top
		float t = pow(normalized_y, horizon_falloff);
		COLOR = mix(horizon_color.rgb, top_color.rgb, t);
	} else {
		// Lower hemisphere: blend from horizon to bottom
		float t = pow(abs(normalized_y), horizon_falloff);
		COLOR = mix(horizon_color.rgb, bottom_color.rgb, t);
	}
}
