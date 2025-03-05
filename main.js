/***************************
 *  Global Variables & GUI
 ***************************/
let device, context;
let noisePipeline, noiseBindGroup;
let renderPipeline, renderBindGroup;
let advectionPipeline, advectionBindGroups;
let passThroughPipeline, passThroughBindGroups;
let uniformBuffer, canvasSizeBuffer, computeSizeBuffer;
let fragmentShaderCode;
let prevTime = performance.now() * 0.001;

// Textures
let noiseTexture;               // Buffer A (noise/velocity field)
let paintTextures = [];         // Buffer B1 and B2 for ping-pong
let currentPaintIndex = 0;      // Tracks which paint buffer is current (B1 or B2)

let computeTextureWidth;
let computeTextureHeight;


/**
 * Called when user changes "Noise Res." in the GUI.
 * We must rebuild the pipeline(s) and bind groups with the new resolution.
 */
function handleResolutionChange(newRes) {
    // If we haven't even created the pipelines yet, just ignore for now:
    if (!noisePipeline || !renderPipeline) return;

    computeTextureWidth  = newRes;
    computeTextureHeight = newRes;

    createRenderPipeline();
    recreateTextureResources();
}

function initMouseHandlers() {
    const canvas = document.getElementById('webgpu-canvas');
    
    // Handle click events
    canvas.addEventListener('click', (event) => {
        // Get the click position relative to the canvas
        const rect = canvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;
        
        // Get canvas and texture dimensions
        const canvasWidth = canvas.clientWidth;
        const canvasHeight = canvas.clientHeight;
        
        // Calculate the scale factor used in the fragment shader
        // This should match your fragment shader's scaling logic
        const texSize = { width: computeTextureWidth, height: computeTextureHeight};
        const canvasSize = { width: canvasWidth, height: canvasHeight };
        
        // Calculate scaling factor (same as in your fragment shader)
        const scale = Math.max(canvasSize.width / texSize.width, canvasSize.height / texSize.height);
        
        // Calculate the size of the scaled texture on the canvas
        const scaledTextureWidth = texSize.width * scale;
        const scaledTextureHeight = texSize.height * scale;
        
        // Adjust click coordinates to account for the offset
        const adjustedClickX = clickX;
        const adjustedClickY = clickY;
        
        // Check if the click is within the texture bounds
        if (adjustedClickX >= 0 && adjustedClickX < scaledTextureWidth && adjustedClickY >= 0 && adjustedClickY < scaledTextureHeight) {
            
            // Convert to texture coordinates (0 to texture width/height)
            const textureX = Math.floor((adjustedClickX / scaledTextureWidth) * texSize.width);
            const textureY = Math.floor((adjustedClickY / scaledTextureHeight) * texSize.height);
            
            // Convert to normalized coordinates (0-1)
            const normalizedX = textureX / texSize.width;
            const normalizedY = textureY / texSize.height;
            
            settings.mousePos = [normalizedX, normalizedY];
            
        } else {}
    });
}

/**
 * Recreates all textures and the bind groups.
 */
function recreateTextureResources() {
    // Destroy old textures (optional, but good practice)
    if (noiseTexture) {
        noiseTexture.destroy?.();
    }
    if (paintTextures.length > 0) {
        paintTextures.forEach(texture => texture.destroy?.());
    }

    // Create buffer A (noise texture)
    noiseTexture = device.createTexture({
        size: [computeTextureWidth, computeTextureHeight],
        format: 'rgba8unorm',
        usage:
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING,
    });
  
    // Create buffers B1 and B2 (paint textures for ping-pong)
    paintTextures = [
        device.createTexture({
        size: [computeTextureWidth, computeTextureHeight],
        format: 'rgba8unorm',
        usage:
            GPUTextureUsage.COPY_SRC |
            GPUTextureUsage.STORAGE_BINDING |
            GPUTextureUsage.TEXTURE_BINDING,
        }),
        device.createTexture({
        size: [computeTextureWidth, computeTextureHeight],
        format: 'rgba8unorm',
        usage:
            GPUTextureUsage.COPY_SRC |
            GPUTextureUsage.STORAGE_BINDING |
            GPUTextureUsage.TEXTURE_BINDING,
        })
    ];
  
    // Reset the texture index
    currentPaintIndex = 0;
    
    // Recreate the noise bind group
    noiseBindGroup = device.createBindGroup({
        layout: noisePipeline.getBindGroupLayout(0),
        entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: noiseTexture.createView() },
        ],
    });

    // Create advection bind groups (two for ping-pong)
    advectionBindGroups = [
        // Group 0: reads from A and B1, writes to B2
        device.createBindGroup({
        layout: advectionPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: noiseTexture.createView() },
            { binding: 2, resource: paintTextures[0].createView() },
            { binding: 3, resource: paintTextures[1].createView() }
        ],
        }),
        // Group 1: reads from A and B2, writes to B1
        device.createBindGroup({
        layout: advectionPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: noiseTexture.createView() },
            { binding: 2, resource: paintTextures[1].createView() },
            { binding: 3, resource: paintTextures[0].createView() }
        ],
        }),
    ];

    // Create pass through bind groups (two for ping-pong)
    passThroughBindGroups = [
        // Group 0: reads from A and B1, writes to B2
        device.createBindGroup({
        layout: passThroughPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: noiseTexture.createView() },
            { binding: 2, resource: paintTextures[0].createView() },
            { binding: 3, resource: paintTextures[1].createView() }
        ],
        }),
        // Group 1: reads from A and B2, writes to B1
        device.createBindGroup({
        layout: passThroughPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: noiseTexture.createView() },
            { binding: 2, resource: paintTextures[1].createView() },
            { binding: 3, resource: paintTextures[0].createView() }
        ],
        }),
    ];

    // Recreate the render bind group (reading from current paint texture)
    renderBindGroup = device.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: paintTextures[currentPaintIndex].createView() },
            { binding: 1, resource: { buffer: canvasSizeBuffer } },
            { binding: 2, resource: { buffer: computeSizeBuffer } },
        ],
    });
}

/***************************
 *  WebGPU Initialization
 ***************************/
async function initWebGPU() {

    if (!navigator.gpu) {
        throw new Error('WebGPU not supported in this browser.');
    }

    const adapter = await navigator.gpu.requestAdapter();
    device = await adapter.requestDevice();

    const canvas = document.getElementById('webgpu-canvas');
    context = canvas.getContext('webgpu');
    resizeCanvas();

    initMouseHandlers();

    uniformBuffer = device.createBuffer({
        size: 14*4, // time (float32) + frequency (float32) + ...
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    canvasSizeBuffer = device.createBuffer({
        size: 8, // vec2<f32>
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    computeSizeBuffer = device.createBuffer({
        size: 32, // vec4<f32>
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create the noise compute pipeline
    const noiseShaderCode = await fetch('noise.wgsl').then((r) => r.text());
    noisePipeline = device.createComputePipeline({
        layout: 'auto',
        compute: {
        module: device.createShaderModule({ code: noiseShaderCode }),
        entryPoint: 'main',
        },
    });

    // Create the advection and pass through compute pipeline
    const advectionShaderCode = await fetch('advection.wgsl').then((r) => r.text());

    advectionPipeline = device.createComputePipeline({
        layout: 'auto',
        compute: {
        module: device.createShaderModule({ code: advectionShaderCode }),
        entryPoint: 'main',
        },
    });

    const passThroughShaderCode = await fetch('passThrough.wgsl').then((r) => r.text());

    passThroughPipeline = device.createComputePipeline({
        layout: 'auto',
        compute: {
        module: device.createShaderModule({ code: passThroughShaderCode }),
        entryPoint: 'main',
        },
    });

    fragmentShaderCode = await fetch('fragmentUpscaler.wgsl').then((r) => r.text());

    // Create the render pipeline (the initial resolution from settings)
    computeTextureWidth  = settings.noiseResolution;
    computeTextureHeight = settings.noiseResolution;
    createRenderPipeline();

    recreateTextureResources();
    initGUI(handleResolutionChange);
    requestAnimationFrame(animate);
}

/**
 * Creates our render pipeline. We embed `computeTextureWidth` and 
 * `computeTextureHeight` into the fragment shader code so it can scale the texture.
 */
function createRenderPipeline() {
    // Vertex: full-screen quad
    const vertexShaderCode = `
        @vertex
        fn main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
        let pos = array<vec2<f32>, 4>(
            vec2(-1.0, -1.0),
            vec2(-1.0,  1.0),
            vec2( 1.0, -1.0),
            vec2( 1.0,  1.0)
        );
        return vec4<f32>(pos[index], 0.0, 1.0);
        }
    `;

    // Build pipeline with the default (auto) layout
    renderPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
        module: device.createShaderModule({ code: vertexShaderCode }),
        entryPoint: 'main',
        },
        fragment: {
        module: device.createShaderModule({ code: fragmentShaderCode }),
        entryPoint: 'main',
        targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }],
        },
        primitive: { topology: 'triangle-strip' },
    });
}

/***************************
 *   Animation + Render
 ***************************/
function animate() {
    checkCanvasSize();
    renderFrame();
    requestAnimationFrame(animate);
}

function renderFrame() {
    updateUniforms();

    const commandEncoder = device.createCommandEncoder();

    // -- Compute pass for noise (write to buffer A) --
    const noisePass = commandEncoder.beginComputePass();
    noisePass.setPipeline(noisePipeline);
    noisePass.setBindGroup(0, noiseBindGroup);
    noisePass.dispatchWorkgroups(computeTextureWidth / 8, computeTextureHeight / 8);
    noisePass.end();
    
    let nextPipeline;
    let nextBindGroup;
    if(settings.getDisplay() == 1) { nextPipeline = passThroughPipeline; nextBindGroup = passThroughBindGroups; }
    else { nextPipeline = advectionPipeline; nextBindGroup = advectionBindGroups; }

    // -- Advection pass (using buffer A + current paint buffer to write to other paint buffer) --
    const nextPass = commandEncoder.beginComputePass();
    nextPass.setPipeline(nextPipeline);
    nextPass.setBindGroup(0, nextBindGroup[currentPaintIndex]);
    nextPass.dispatchWorkgroups(computeTextureWidth / 8, computeTextureHeight / 8);
    nextPass.end();
    
    // -- Swap paint buffer indices --
    currentPaintIndex = 1 - currentPaintIndex;
    
    // -- Update render bind group to read from the new current paint buffer --
    renderBindGroup = device.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: paintTextures[currentPaintIndex].createView() },
            { binding: 1, resource: { buffer: canvasSizeBuffer } },
            { binding: 2, resource: { buffer: computeSizeBuffer } },
        ],
    });

    // -- Render pass --
    const textureView = context.getCurrentTexture().createView();
    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [
            { view: textureView, loadOp: 'clear', storeOp: 'store' },
        ],
    });
    renderPass.setPipeline(renderPipeline);
    renderPass.setBindGroup(0, renderBindGroup);
    renderPass.draw(4);
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
}

function updateUniforms() {
    // Canvas size & compute size
    const canvas = document.getElementById('webgpu-canvas');
    const canvasSizeData = new Float32Array([canvas.width, canvas.height]);
    device.queue.writeBuffer(canvasSizeBuffer, 0, canvasSizeData);
    device.queue.writeBuffer(computeSizeBuffer, 0, new Float32Array([computeTextureWidth, computeTextureHeight]));

    // Time & freq
    const time = performance.now() * 0.001;
    const uniformData = new Float32Array([
        settings.temporalFrequency * time,
        settings.spatialFrequency,
        settings.noiseResolution,
        settings.noiseResolution,
        settings.octavesCount,
        settings.flowVelocity,
        settings.mousePos[0],
        settings.mousePos[1],
        settings.radius,
        settings.density,
        settings.viscosity,
        settings.lifespan,
        settings.colorful
    ]);
    prevTime = time;
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);
    settings.mousePos = [-1.0, -1.0]; // reset => click is handled once and only once
}

function checkCanvasSize() {
    const canvas = document.getElementById('webgpu-canvas');
    const desiredWidth  = Math.floor(window.innerWidth  * window.devicePixelRatio);
    const desiredHeight = Math.floor(window.innerHeight * window.devicePixelRatio);

    if (canvas.width !== desiredWidth || canvas.height !== desiredHeight) {
        resizeCanvas();
    }
}

function resizeCanvas() {
    const canvas = document.getElementById('webgpu-canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.floor(window.innerWidth  * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);

    context.configure({
        device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        size: [canvas.width, canvas.height],
    });
}

// Kick things off
initWebGPU().catch((err) => {
    console.error('Error initializing WebGPU:', err);
});