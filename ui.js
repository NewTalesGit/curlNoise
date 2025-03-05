const settings = {
    spatialFrequency: 2.0,
    temporalFrequency: 0.1,
    octavesCount: 3,
    flowVelocity: 0.0,
    noiseResolution: 512,
    display: "Texture",
    getDisplay() {  if(this.display=="Debug - Curl Noise") return 1; else return 0; },

    radius: 0.01,
    density: 1.0,
    viscosity: 0.0,
    lifespan: 10.0,
    mousePos: [0.0, 0.0]
  };
  
  function initGUI(handleResolutionChange, switchDisplay) {
    const gui = new window.lil.GUI();
  
    const curlFolder = gui.addFolder('Curl Noise');
    curlFolder.add(settings, 'spatialFrequency', 0.0, 10.0, 0.01).name('Spatial Freq.');
    curlFolder.add(settings, 'temporalFrequency', 0.0, 2.0, 0.01).name('Temporal Freq.');
    curlFolder.add(settings, 'octavesCount', 1, 5, 1).name('Octaves count');
    curlFolder.add(settings, 'flowVelocity', 0.0, 1.0, 0.1).name('flow velocity');
    curlFolder.add(settings, 'noiseResolution', [64, 128, 256, 512, 1024]).name('Resolution').onChange((newRes) => {
        handleResolutionChange(newRes);
    });
    curlFolder.add(settings, 'display', ["Texture", "Debug - Curl Noise"]).name('Display').onChange((newDisplay) => {
        let displayCode = 0;
        if(newDisplay === "Texture") { displayCode = 0; }
        else if(newDisplay === "Debug - Curl Noise" ) { displayCode = 1; }
    });

    const dyeFolder = gui.addFolder('Dye');
    dyeFolder.add(settings, 'radius', 0.0, 1.0, 0.01).name('Radius');
    dyeFolder.add(settings, 'density', 0.0, 1.0, 0.1).name('Density');
    dyeFolder.add(settings, 'viscosity', 0.0, 1.0, 0.01).name('Viscosity');
    dyeFolder.add(settings, 'lifespan', 0.0, 500.0, 1.0).name('Lifespan (s)');

    return gui;
  }
  