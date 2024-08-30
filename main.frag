precision mediump float;

uniform sampler2D texture1;
uniform sampler2D texture2;
uniform int currentIndex;
uniform float progress;

varying vec2 vTexCoord;

uniform vec2 resolution; // canvas size(widtth, height)
uniform vec2 texResolution; // texture size(widtth, height)

uniform bool isStripeTransition;

// A. Stripe transition
uniform float count; // = 10.0
uniform float smoothness; // = 0.5

// B. Perlin
uniform float scale; // = 5.0
uniform float seed; // = 16

/*
 * テクスチャのUV座標を計算し、object-fit: cover のような動作を実現する関数
 * この関数は、キャンバスとテクスチャのアスペクト比を比較して、
 * テクスチャがキャンバス全体をカバーしつつ、アスペクト比を維持するようにUV座標を調整します。
 *
 * @param uv 元のテクスチャUV座標 (0.0 ~ 1.0の範囲)
 * @return 調整後のUV座標 (0.0から1.0の範囲内)
 *
 *　--- 横長のキャンバスに縦長のテクスチャを使用する場合 ---
 *　ratio.x = 1.0 （幅方向はそのまま）
 *　ratio.y < 1.0 （高さ方向は縮小）
 *
 *　--- 縦長のキャンバスに横長のテクスチャを使用する場合 ---
 *　ratio.x < 1.0 （幅方向は縮小）
 *　ratio.y = 1.0 （高さ方向はそのまま）
*/
vec2 calculateUV(vec2 uv) {
    // キャンバスとテクスチャのアスペクト比を計算
    float canvasAspect = resolution.x / resolution.y;
    float textureAspect = texResolution.x / texResolution.y;

    // (キャンバスの縦横比の逆数) / (テクスチャの縦横比の逆数) を計算（高さを幅で割ることで、縦横を入れ替えた比率を計算）
    float canvasInverseAspect = resolution.y / resolution.x;
    float textureInverseAspect = texResolution.y / texResolution.x;

    // min関数を使用して、テクスチャが常にキャンバス全体をカバーするために必要なスケーリング比率を計算
    float ratioX = min(canvasAspect / textureAspect, 1.0);
    float ratioY = min(canvasInverseAspect / textureInverseAspect, 1.0);


    // UV座標を調整
    // 1. XとYにスケーリングを適用 - uv.x * ratioX, uv.y * ratioY
    // 2. スケーリングされたテクスチャをキャンバスの中央に配置する -　(1.0 - ratioX) * 0.5, (1.0 - ratioY) * 0.5
    // 2で、テクスチャが中央に配置されて、縦横比を維持しつつキャンバス全体をカバーする
    return vec2(
        uv.x * ratioX + (1.0 - ratioX) * 0.5,
        uv.y * ratioY + (1.0 - ratioY) * 0.5
    );
}

/*
B. Perlin
*/
// http://byteblacksmith.com/improvements-to-the-canonical-one-liner-glsl-rand-for-opengl-es-2-0/
float random(vec2 co) {
    highp float a = seed;
    highp float b = 0.78233;
    highp float c = 437.585453;
    highp float dt = dot(co.xy, vec2(a, b));
    highp float sn = mod(dt, 3.14);
    return fract(sin(sn) * c);
}

float noise(in vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) +
            (c - a) * u.y * (1.0 - u.x) +
            (d - b) * u.x * u.y;
}


// A. Stripe
vec4 stripeTransition(vec2 uv) {
    // 現在のUV座標から各テクスチャの色を取得する
    vec4 fromColor = texture2D(texture1, uv);
    vec4 toColor = texture2D(texture2, uv);

    // UV座標のxのみを格納
    float x = uv.x;

    // smoothstep(edge0, edge1, x): xが０未満なら０を返す、xが１より大きいなら１を返す。
    // edge0とedge1の間は、滑らかに遷移する(グラデーション)
    float prog = smoothstep(-smoothness, 0.0, x - progress * (1.0 + smoothness));
    float stripe = step(prog, fract(count * x));
    return mix(fromColor, toColor, stripe);
}

// B. Perlin
vec4 perlinTransition(vec2 uv) {
    vec4 from = texture2D(texture1, uv);
    vec4 to = texture2D(texture2, uv);

    float n = noise(uv * scale);
    float p = mix(-smoothness, 1.0 + smoothness, progress);

    float lower = p - smoothness;
    float higher = p + smoothness;
    float q = smoothstep(lower, higher, n);
    return mix(from, to, 1.0 - q);
}

void main() {
    vec2 adjustedUV = calculateUV(vTexCoord);

    if(isStripeTransition) {
        gl_FragColor = stripeTransition(adjustedUV); // stripe
    } else {
        gl_FragColor = perlinTransition(adjustedUV); // perlin
    }
}