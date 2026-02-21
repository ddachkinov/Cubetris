shader_type sky;

// Gradient sky shader - creates smooth blue to white gradient
// Based on view direction (EYEDIR.y)

// Research-based "Perfect Sky" palette: #0082F0 → #62cff4 → #FEFEFF
uniform vec4 top_color : source_color = vec4(0.03, 0.51, 0.94, 1.0);   // #0082F0 deep sky blue
uniform vec4 horizon_color : source_color = vec4(0.38, 0.81, 0.96, 1.0); // #62cff4 bright cyan
uniform vec4 bottom_color : source_color = vec4(0.98, 0.99, 1.0, 1.0);  // #FEFEFF bright white
uniform float horizon_falloff : hint_range(0.1, 5.0) = 1.2;

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
