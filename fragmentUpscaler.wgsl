@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var<uniform> canvasSize: vec2<f32>;
@group(0) @binding(2) var<uniform> computeSize: vec2<f32>;

// Bilinear texture sampling function
fn sampleBilinear(tex: texture_2d<f32>, uv: vec2<f32>) -> vec4<f32> {
    // Get texture dimensions
    let texSize = vec2<f32>(textureDimensions(tex));
        
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

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let textureSize = vec2<f32>(computeSize.x, computeSize.y);
    let scale = max(canvasSize.x / textureSize.x, canvasSize.y / textureSize.y);
        
    // Calculate UV coordinates with proper scaling
    let uv = fragCoord.xy / scale;
        
    // Use bilinear sampling instead of nearest-neighbor (textureLoad)
    let color = sampleBilinear(inputTexture, uv / textureSize);
    return color;
}