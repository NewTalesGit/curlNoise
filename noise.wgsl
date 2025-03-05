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
    lifespan: f32
}

@group(0) @binding(0) var<uniform> params: Uniforms; 
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;


@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let uv = vec2<f32>(global_id.xy) / params.computeSize.x;
    let time        = params.time;
    let frequency   = params.spatialFrequency;
    let octavesCount = params.octavesCount;
    let flowVelocity = params.flowVelocity; 

    var noise = vec3<f32>(0.0, 0.0, 0.0);
    var scale = 0.0;

    // Example: incorporate 'time' as the Z component of your noise coordinate.
    // That means we pass a single vec3<f32> into bitangentNoise3D.
    for (var i = 0; i < i32(octavesCount); i++) {
        let octaveOffset = f32(i) + 1.17;
        let p = vec3<f32>(
            octaveOffset * frequency * uv.x,
            octaveOffset * frequency * uv.y,
            time
        );
        noise = noise + bitangentNoise3D(p) / f32(i + 1);
        scale = scale + (4.0 / f32(i + 1));
    }

    // Simple normalization
    noise = (noise + scale) / (2.0 * scale);

    // include base velocity
    noise = flowVelocity * vec3(1.0, 0.5, 0.0) + (1 - flowVelocity) * noise;

    // Write out XY for demonstration; alpha set to 1.0
    textureStore(outputTexture, global_id.xy, vec4<f32>(noise.xy, 0.0, 1.0));
}


//
//      Ported to WGSL from https://atyuwen.github.io/posts/bitangent-noise/
//      by ChatGPT so...
//      
//      bitangent noise differs a bit from classical curl noise as... it is the same
//      but computed more efficiently (nearly twice as fast as standard curl) :-)
//
//


// Permuted congruential generator (PCG) hashing function
fn pcg3d16(p: vec3<u32>) -> vec2<u32> {
    var v = p * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    return v.xy;
}

fn pcg4d16(p: vec4<u32>) -> vec2<u32> {
    var v = p * 1664525u + 1013904223u;
    v.x += v.y * v.w;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v.w += v.y * v.z;
    v.x += v.y * v.w;
    v.y += v.z * v.x;
    return v.xy;
}

fn gradient3d(hash: u32) -> vec3<f32> {
    let h = hash & 15u;
    var grad = vec3<f32>(0.0, 0.0, 0.0);
    
    // Replace ternary with if-based selection
    if ((h & 1u) != 0u) {
        grad.x = 1.0;
    } else {
        grad.x = -1.0;
    }
    
    if ((h & 2u) != 0u) {
        grad.y = 1.0;
    } else {
        grad.y = -1.0;
    }
    
    if ((h & 4u) != 0u) {
        grad.z = 1.0;
    } else {
        grad.z = -1.0;
    }
    
    return normalize(grad);
}

// Compute 4D gradient from hash value
fn gradient4d(hash: u32) -> vec4<f32> {
    let g = vec4<f32>(
        f32(hash & 0x80000) / 0x40000.0,
        f32(hash & 0x40000) / 0x20000.0,
        f32(hash & 0x20000) / 0x10000.0,
        f32(hash & 0x10000) / 0x8000.0
    ) - vec4<f32>(1.0);
    return g;
}

// Optimized 3D Bitangent Noise
fn bitangentNoise3D(p: vec3<f32>) -> vec3<f32> {
    let C = vec2<f32>(1.0 / 6.0, 1.0 / 3.0);
    let D = vec4<f32>(0.0, 0.5, 1.0, 2.0);

    // First corner
    let i = floor(p + dot(p, C.yyy));
    let x0 = p - i + dot(i, C.xxx);

    // Other corners
    let g = step(x0.yzx, x0.xyz);
    let l = vec3<f32>(1.0) - g;
    let i1 = min(g, l.zxy);
    let i2 = max(g, l.zxy);

    let x1 = x0 - i1 + C.xxx;
    let x2 = x0 - i2 + C.yyy;
    let x3 = x0 - D.yyy;

    let i_int = vec3<u32>(i + vec3<f32>(32768.5));
    let hash0 = pcg3d16(i_int);
    let hash1 = pcg3d16(i_int + vec3<u32>(i1));
    let hash2 = pcg3d16(i_int + vec3<u32>(i2));
    let hash3 = pcg3d16(i_int + vec3<u32>(1));

    let p00 = gradient3d(hash0.x);
    let p01 = gradient3d(hash0.y);
    let p10 = gradient3d(hash1.x);
    let p11 = gradient3d(hash1.y);
    let p20 = gradient3d(hash2.x);
    let p21 = gradient3d(hash2.y);
    let p30 = gradient3d(hash3.x);
    let p31 = gradient3d(hash3.y);

    let m = saturate(vec4<f32>(0.5) - vec4<f32>(
        dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)
    ));

    let m2 = m * m;
    let m4 = m2 * m2;
    let temp = m2 * m * vec4<f32>(
        dot(p00, x0), dot(p10, x1), dot(p20, x2), dot(p30, x3)
    );

    var gradient0 = -8.0 * (temp.x * x0 + temp.y * x1 + temp.z * x2 + temp.w * x3);
    gradient0 += m4.x * p00 + m4.y * p10 + m4.z * p20 + m4.w * p30;

    let temp2 = m2 * m * vec4<f32>(
        dot(p01, x0), dot(p11, x1), dot(p21, x2), dot(p31, x3)
    );

    var gradient1 = -8.0 * (temp2.x * x0 + temp2.y * x1 + temp2.z * x2 + temp2.w * x3);
    gradient1 += m4.x * p01 + m4.y * p11 + m4.z * p21 + m4.w * p31;

    return cross(gradient0, gradient1) * 3918.76;
}