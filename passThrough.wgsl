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
@group(0) @binding(1) var noiseTexture: texture_2d<f32>; // Buffer A
@group(0) @binding(2) var srcTexture: texture_2d<f32>;   // Buffer B1
@group(0) @binding(3) var destTexture: texture_storage_2d<rgba8unorm, write>; // Buffer B2

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    // Get the pixel we're processing
    let coords = vec2<i32>(id.xy);

    // dummy code
    let t = uniforms.time;
    let x = textureLoad(srcTexture, coords, 0);
      
    // For now, just copy the noise texture to the destination
    // Later, this can be replaced with actual advection logic
    let color = textureLoad(noiseTexture, coords, 0);
      
    // Write the color to the destination
    textureStore(destTexture, coords, color);
}