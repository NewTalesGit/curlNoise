struct Uniforms {
    time: f32,
    spatialFrequency: f32,
    computeSize: vec2<f32>,
    octavesCount: f32,
    flowVelocity: f32,
    mousePos: vec2<f32>,
    radius: f32,
    density: f32,
    viscosity: f32,
    lifespan: f32,
    colorful: f32
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var noiseTexture: texture_2d<f32>; // Buffer A (velocity field)
@group(0) @binding(2) var srcTexture: texture_2d<f32>;   // Buffer B1 (current dye state)
@group(0) @binding(3) var destTexture: texture_storage_2d<rgba8unorm, write>; // Buffer B2 (next dye state)

// Sample texture with bilinear filtering
fn sampleBilinear(tex: texture_2d<f32>, uv: vec2<f32>) -> vec4<f32> {
    let texSize = uniforms.computeSize;
    
    // Calculate the position in texture space
    let pos = uv * texSize;
    
    // Get the four nearest texels
    let texPos = vec2<i32>(pos);
    let texPosX1 = min(texPos.x + 1, i32(texSize.x) - 1);
    let texPosY1 = min(texPos.y + 1, i32(texSize.y) - 1);
    
    // Calculate the fractional part for interpolation
    let f = pos - vec2<f32>(texPos);
    
    // Sample the four nearest texels
    let c00 = textureLoad(tex, vec2<i32>(texPos.x, texPos.y), 0);
    let c10 = textureLoad(tex, vec2<i32>(texPosX1, texPos.y), 0);
    let c01 = textureLoad(tex, vec2<i32>(texPos.x, texPosY1), 0);
    let c11 = textureLoad(tex, vec2<i32>(texPosX1, texPosY1), 0);
    
    // Bilinear interpolation
    let c0 = mix(c00, c10, f.x);
    let c1 = mix(c01, c11, f.x);
    return mix(c0, c1, f.y);
}

fn spreadDye(coords: vec2<i32>) -> vec4<f32> {
    let fcoords = vec2<f32>(f32(coords.x)/uniforms.computeSize.x, f32(coords.y)/uniforms.computeSize.y);
    let dist = length(fcoords - uniforms.mousePos);
    
    if(dist < uniforms.radius) {
        // Create a smooth falloff from center
        let intensity = 1.0 - (dist / uniforms.radius);
        let smoothIntensity = intensity * intensity; // Square for smoother falloff
        
        // Add angle-based color variation
        let angle = atan2(fcoords.y - uniforms.mousePos.y, fcoords.x - uniforms.mousePos.x);
        
        // Create more varied color patterns using different frequency oscillations
        if(uniforms.colorful == 1) {
            return vec4(
                // Red channel: angle-based variation + time-based oscillation
                0.6 + 0.4 * sin(6.0 * angle + uniforms.time * 1.5),
                
                // Green channel: distance-based rings + time oscillation
                0.5 + 0.5 * sin(15.0 * dist + uniforms.time),
                
                // Blue channel: spiral pattern using angle and distance
                0.5 + 0.5 * sin(8.0 * (angle + dist * 3.0) + uniforms.time * 0.7),
                
                // Alpha: maintain smooth intensity with density control
                smoothIntensity * uniforms.density
            );
        } else { return vec4(1.0, 1.0, 1.0, 1.0); }
    }
    
    return vec4(0.0, 0.0, 0.0, 0.0);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    // Get the pixel we're processing
    let coords = vec2<i32>(id.xy);
    let uv = vec2<f32>(f32(coords.x), f32(coords.y)) / uniforms.computeSize;
    
    // Get the velocity from the noise texture
    let velocity = textureLoad(noiseTexture, coords, 0).xy;
    let scaledVelocity = (velocity - 0.5) * 2.0;
    
    // Scale velocity by viscosity (lower viscosity = faster movement)
    //let dt = 1.0 / 60.0; // Assume 60fps, adjust if needed
    //let advectionStrength = dt / uniforms.viscosity;
    let advectionStrength = 0.001/(uniforms.viscosity+0.0001);

    // Calculate previous position by moving backwards along velocity
    let prevUV = uv - scaledVelocity * advectionStrength;
    
    // Sample the source texture at the previous position using bilinear filtering
    var color: vec4<f32>;
    
    // Check if the previous position is within bounds
    if (prevUV.x >= 0.0 && prevUV.x < 1.0 && prevUV.y >= 0.0 && prevUV.y < 1.0) {
        // Sample with bilinear filtering for smooth advection
        color = sampleBilinear(srcTexture, prevUV);
    } else {
        // Out of bounds, use current position
        color = textureLoad(srcTexture, coords, 0);
    }
    
    // Apply decay/dissipation based on lifespan
    color *= (1.0 - (1.0 / max(1.0, uniforms.lifespan)));
    
    // If mouse was clicked => add some dye
    if(uniforms.mousePos.x > 0.0 && uniforms.mousePos.y > 0.0) {
        let spot = spreadDye(coords);
        if(spot.w > 0.0) { 
            // Blend new dye with existing
            color = mix(color, spot, spot.w);
        }
    }
    
    // Write the color to the destination
    textureStore(destTexture, coords, color);
    //textureStore(destTexture, coords, vec4(velocity.x, velocity.y, 0.0, 1.0));
}