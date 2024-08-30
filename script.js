/**
* Mouse transition Version
*/
import { WebGLUtility } from "/lib/webgl.js";
import { Mat4 } from "/lib/math.js";
import { WebGLGeometry } from "/lib/geometry.js";
import { Pane } from "/lib/tweakpane-4.0.3.min.js";


window.addEventListener(
    "DOMContentLoaded",
    async () => {
        const app = new App();
        app.init();
        app.setupPane();
        await app.load();
        app.setupGeometry();
        app.start();
    },
    false
);


class App {
    canvas
    gl
    program
    attributeLocation
    attributeStride
    uniformLocation
    planeGeometry
    planeVBO
    planeIBO
    startTime
    camera
    isRendering

    textures = []
    activeTexture = null
    nextTexture = null
    isAnimating = false
    progress = 0

    pendingTexture = null  // 新しく追加: 待機中のテクスチャ

    // Transition parameters
    // A. Stripe
    count = 30.0
    smoothness = 0.8
    animationStartTime = 0
    animationDuration = 1.8

    // B. Perlin
    seed = 5.0
    scale = 16.0

    isStripeTransition;


    constructor() {
        this.mouseEvent = this.mouseEvent.bind(this)
        this.render = this.render.bind(this)
        this.isInitialized = false
        this.isMouseHover = null
    }


    /**
     * Init
     */
    init() {
        // 1. Get a html element & create a webgl canvas
        this.canvas = document.getElementById("bg-canvas")
        this.gl = WebGLUtility.createWebGLContext(this.canvas)

        // 2. Resize
        this.resizeCanvas()
        window.addEventListener("resize", this.debouncedResize.bind(this), false)

        // 3. Enable depth test
        this.gl.enable(this.gl.DEPTH_TEST)

        // 4. Add mouse event
        this.mouseEvent()

        // 5. Default transition is stripe
        this.isStripeTransition = true
    }


    /**
     * Load assets
     * @return {Promise}
     */
    async load() {
        return new Promise(async (resolve, reject) => {
            const gl = this.gl

            if (gl == null) {
                reject(new Error("WebGL context not initialized"))
            } else {
                // 1. Load shader files
                const VSSource = await WebGLUtility.loadFile("/main.vert")
                const FSSource = await WebGLUtility.loadFile("/main.frag")

                // 2. Create shader objects & create program object
                const vertexShader = WebGLUtility.createShaderObject(gl, VSSource, gl.VERTEX_SHADER)
                const fragmentShader = WebGLUtility.createShaderObject(gl, FSSource, gl.FRAGMENT_SHADER)
                this.program = WebGLUtility.createProgramObject(gl, vertexShader, fragmentShader)

                // 3. Load textures
                this.textures = [
                    { path: "/assets/img1.jpg", name: "texture0" },
                    // { path: "/assets/img2.jpg", name: "texture1" },
                    { path: "/assets/img3.jpg", name: "texture1" },
                    { path: "/assets/sample.jpg", name: "texture2" }, // debug
                    { path: "/assets/img4.jpg", name: "texture3" },
                ]


                for (let i = 0; i < this.textures.length; i++) {
                    const { path, name } = this.textures[i]
                    const image = await WebGLUtility.loadImage(path)
                    this[name] = WebGLUtility.createTexture(gl, image, i)

                    // Get each textures' resolution
                    this[`${name}Resolution`] = { width: image.width, height: image.height }
                    this.textures[i].texture = this[name]
                }

                this.activeTexture = this.textures[0];
                this.nextTexture = this.textures[0];

                this.setupLocation()
                this.updateUniforms()
                this.isInitialized = true

                resolve()
            }
        })
    }


    /**
     * Mosue event
     */
    mouseEvent() {
        const allImages = [...document.querySelectorAll(".item img")];

        allImages.forEach((image, index) => {
            image.addEventListener("mouseover", (e) => {
                let path = e.target.getAttribute('src');
                const hoveredImage = path.split('/').pop();

                console.log("Active texture:", this.activeTexture.path);
                console.log("Hovered image:", hoveredImage);

                // Set the hoveredTexture
                const hoveredTexture = this.textures.find(tex => tex.path.includes(hoveredImage));

                if (hoveredTexture && hoveredTexture !== this.activeTexture) {
                    if (this.isAnimating) {
                        // トランジション中の場合は、待機中のテクスチャとして設定
                        this.pendingTexture = hoveredTexture;
                    } else {
                        // トランジション中でない場合は、通常通り次のテクスチャとして設定
                        this.nextTexture = hoveredTexture;
                        this.isAnimating = true;
                        this.animationStartTime = performance.now() / 1000;
                        this.progress = 0;
                    }
                }

                this.isMouseHover = true;
            });


            image.addEventListener('mouseleave', () => {
                this.isMouseHover = false;
            });
        });
    }


    /**
     * Setup for Geometry
     */
    setupGeometry() {
        // 1. Create a plane geometry
        const size = 2.0 // wrap -1 to 1
        const color = [1.0, 1.0, 1.0, 1.0]
        this.planeGeometry = WebGLGeometry.plane(size, size, color)

        // 2. Create VBO
        this.planeVBO = [
            WebGLUtility.createVBO(this.gl, this.planeGeometry.position),
            WebGLUtility.createVBO(this.gl, this.planeGeometry.normal),
            WebGLUtility.createVBO(this.gl, this.planeGeometry.color),
            WebGLUtility.createVBO(this.gl, this.planeGeometry.texCoord),
        ]

        // 3. Create IBO
        this.planeIBO = WebGLUtility.createIBO(this.gl, this.planeGeometry.index)
    }


    /**
     * Set up for location(connection VBO and attributes in shader)
     */
    setupLocation() {
        const gl = this.gl

        this.attributeLocation = [
            gl.getAttribLocation(this.program, "position"),
            gl.getAttribLocation(this.program, "normal"),
            gl.getAttribLocation(this.program, "color"),
            gl.getAttribLocation(this.program, "texCoord"),
        ]

        this.attributeStride = [3, 3, 4, 2]

        this.uniformLocation = {
            resolution: gl.getUniformLocation(this.program, "resolution"),
            texResolution: gl.getUniformLocation(this.program, "texResolution"),
            mvpMatrix: gl.getUniformLocation(this.program, "mvpMatrix"),
            normalMatrix: gl.getUniformLocation(this.program, "normalMatrix"),
            texture1: gl.getUniformLocation(this.program, "texture1"),
            texture2: gl.getUniformLocation(this.program, "texture2"),
            progress: gl.getUniformLocation(this.program, "progress"),
            count: gl.getUniformLocation(this.program, "count"), // A. stripe
            smoothness: gl.getUniformLocation(this.program, "smoothness"), // A. stripe
            seed: gl.getUniformLocation(this.program, "seed"), // B. Perlin
            scale: gl.getUniformLocation(this.program, "scale"), // B. Perlin
            isStripeTransition: gl.getUniformLocation(this.program, "isStripeTransition"), // Switch transition effect
        }
    }


    start() {
        const gl = this.gl

        // Activate and bind all four textures
        for (let i = 0; i < this.textures.length; i++) {
            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, this.textures[i].texture);
        }

        this.startTime = Date.now()
        this.isRendering = true
        this.render()
    }

    stop() {
        this.isRendering = false;
    }


    setupRendering() {
        const gl = this.gl
        gl.viewport(0, 0, this.canvas.width, this.canvas.height)

        gl.clearColor(0.3, 0.3, 0.3, 1.0)
        gl.clearDepth(1.0)
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    }


    /**
    * Resize
    */
    resizeCanvas() {
        const gl = this.gl

        const displayWidth = Math.floor(this.canvas.clientWidth * window.devicePixelRatio)
        const displayHeight = Math.floor(this.canvas.clientHeight * window.devicePixelRatio)

        if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
            this.canvas.width = displayWidth
            this.canvas.height = displayHeight
        }

        gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    }


    debouncedResize() {
        clearTimeout(this.resizeTimeout)
        this.resizeTimeout = setTimeout(() => {
            this.resizeCanvas()
            this.updateUniforms()
        }, 100)
    }


    /**
     * Update uniforms
     */
    updateUniforms() {
        const gl = this.gl

        if (this.program && this.uniformLocation) {
            gl.useProgram(this.program)

            // Update resolution value(canvas size)
            gl.uniform2f(this.uniformLocation.resolution, this.canvas.width, this.canvas.height)

            // Update all textures' size
            for (let i = 0; i < this.textures.length; i++) {
                const texResolution = this[`${this.textures[i].name}Resolution`]
                gl.uniform2f(this.uniformLocation.texResolution, texResolution.width, texResolution.height)
            }
        }
    }


    /**
     * Setup for Debug
     */
    setupPane() {
        const gl = this.gl
        const pane = new Pane()
        const parameter = {
            smoothness: this.smoothness,
            count: this.count,
            animationDuration: this.animationDuration,
            wrapping: gl.CLAMP_TO_EDGE,
            seed: this.seed,
            scale: this.scale,
            isStripeTransition: this.isStripeTransition
        }

        pane.addBinding(parameter, "smoothness", { min: 0, max: 1, step: 0.01 }).on("change", (v) => {
            this.smoothness = v.value
        })

        pane.addBinding(parameter, "seed", { min: 0, max: 20.0, step: 0.1 }).on("change", (v) => {
            this.seed = v.value
        })

        pane.addBinding(parameter, "scale", { min: 0, max: 50, step: 0.1 }).on("change", (v) => {
            this.scale = v.value // 値が小さい：noise1つ1つが大きい、値が大きい：noiseが小さい
        })

        pane.addBinding(parameter, "count", { min: 1, max: 50, step: 1 }).on("change", (v) => {
            this.count = v.value
        })

        pane.addBinding(parameter, "animationDuration", { min: 0.1, max: 10, step: 0.1 }).on("change", (v) => {
            this.animationDuration = v.value
        })

        pane.addBinding(parameter, "isStripeTransition").on("change", (v) => {
            this.isStripeTransition = v.value;
        });

        pane.addBinding(parameter, 'wrapping', {
            options: {
                CLAMP_TO_EDGE: gl.CLAMP_TO_EDGE,
                REPEAT: gl.REPEAT,
                MIRRORED_REPEAT: gl.MIRRORED_REPEAT,
            },
        }).on('change', (v) => {
            this.setTextureWrapping(v.value)
        })

    }


    setTextureWrapping(wrapping) {
        const gl = this.gl

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapping)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapping)
    }


    /**
     * Render
     */
    render() {
        const gl = this.gl

        // if isRendering is true, call raf
        if (this.isRendering) {
            requestAnimationFrame(this.render)
        }

        // 2. Setup for rendering
        this.setupRendering()

        // 単位行列を使用
        const p = Mat4.identity();

        // ビュー行列も単位行列を使用（カメラの変換なし）
        // 単位行列を使用することで、頂点座標をそのまま使用
        const v = Mat4.identity();
        const mvp = Mat4.multiply(p, v);
        const normalMatrix = Mat4.identity()


        /**
         * Animation
         */
        const currentTime = performance.now() / 1000
        const elapsedTime = currentTime - this.animationStartTime
        if (this.isAnimating) {
            this.progress = Math.min(elapsedTime / this.animationDuration, 1.0)
        }

        gl.useProgram(this.program)

        gl.uniformMatrix4fv(this.uniformLocation.mvpMatrix, false, mvp)
        gl.uniformMatrix4fv(this.uniformLocation.normalMatrix, false, normalMatrix)
        gl.uniform2i(this.uniformLocation.resolution, this.canvas.width, this.canvas.height)


        // Get the active texture's width & height
        if (this.activeTexture) {
            const currentTextureResolution = this[`${this.activeTexture.name}Resolution`]

            gl.uniform2i(this.uniformLocation.texResolution, currentTextureResolution.width, currentTextureResolution.height)
        }

        const activeTextureIndex = this.textures.indexOf(this.activeTexture)
        const nextTextureIndex = this.textures.indexOf(this.nextTexture)

        gl.uniform1i(this.uniformLocation.texture1, activeTextureIndex)
        gl.uniform1i(this.uniformLocation.texture2, nextTextureIndex)


        /**
         * Transition parameters
         */
        // Setup for transition type
        gl.uniform1i(this.uniformLocation.isStripeTransition, this.isStripeTransition ? 1 : 0);

        // A. stripe
        gl.uniform1f(this.uniformLocation.progress, this.progress)
        gl.uniform1f(this.uniformLocation.count, this.count)
        gl.uniform1f(this.uniformLocation.smoothness, this.smoothness)

        // B. Perllin
        gl.uniform1f(this.uniformLocation.seed, this.seed)
        gl.uniform1f(this.uniformLocation.scale, this.scale)


        // Render VBO & IBO
        WebGLUtility.enableBuffer(
            gl,
            this.planeVBO,
            this.attributeLocation,
            this.attributeStride,
            this.planeIBO
        )
        gl.drawElements(
            gl.TRIANGLES,
            this.planeGeometry.index.length,
            gl.UNSIGNED_SHORT,
            0
        )

        // when animation is finished
        if (this.isAnimating && this.progress >= 1.0) {
            this.isAnimating = false
            this.activeTexture = this.nextTexture
            this.progress = 0

            // トランジションが終了して、待機中のテクスチャがあれば次のトランジションを開始
            if (this.pendingTexture) {
                this.nextTexture = this.pendingTexture;
                this.pendingTexture = null;
                this.isAnimating = true;
                this.animationStartTime = performance.now() / 1000;
            }
        }
    }
}