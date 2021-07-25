const sceneVertShader = `
precision mediump float;

attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aTexCoord;

uniform mat4 uProjectionMatrix;
uniform mat4 uModelViewMatrix;
uniform mat3 uNormalMatrix;
uniform vec4 uMaterialColor;
uniform vec2 screenSize;

varying vec3 vNormal;
varying vec2 vPosition;

void main() {
  vec4 positionVec4 = vec4(aPosition, 1.0);
		
	float r = uMaterialColor.r * 8.0;
	vNormal = aNormal * mat3(cos(r), 0, sin(r), 0, 1, 0, -sin(r), 0, cos(r));
	vPosition = (uProjectionMatrix * uModelViewMatrix * positionVec4).xy * screenSize;

  gl_Position = uProjectionMatrix * uModelViewMatrix * positionVec4;
}
`;

const sceneFragShader = `
precision mediump float;

varying vec3 vNormal;
varying vec2 vPosition;

uniform vec4 uMaterialColor;
uniform vec3 darkColor;
uniform vec3 lightColor;
uniform vec2 positionOffset;

const float advSamples = #sceneAdvSamples#;

float random(vec2 position) {
	return fract(sin(dot(position.xy, vec2(524.1412, 243.5633))) * 46232.0);
}

float randomB(vec2 position) {
	return fract(sin(dot(position.xy, vec2(235.1412, 754.5633))) * 85674.0);
}

float randomC(vec2 position) {
	return fract(sin(dot(position.xy, vec2(745.1412, 867.5633))) * 65782.0);
}

float subSample(vec2 sectorCoord, vec2 subSectorCoord, vec2 offset){
	sectorCoord = sectorCoord - offset;
	subSectorCoord = subSectorCoord + offset;
	float dist = distance(subSectorCoord, vec2(random(sectorCoord), randomB(sectorCoord)) + 0.5);
	if(dist < 0.5) {
		return randomC(sectorCoord);
	} else {
		return 0.0;
	}
}

float sample(vec2 position, float scale) {
	vec2 sectorCoord = floor(position / scale);
	vec2 subSectorCoord = fract(position / scale);
	
	return max(max(subSample(sectorCoord, subSectorCoord, vec2(0.0, 0.0)),
         subSample(sectorCoord, subSectorCoord, vec2(1.0, 0.0))),
         max(subSample(sectorCoord, subSectorCoord, vec2(0.0, 1.0)),
         subSample(sectorCoord, subSectorCoord, vec2(1.0, 1.0))));
}

float advSample(float light, vec2 position, float scale) {
	for(float i = 0.0; i < advSamples; i ++) {
		float s = sample(position + vec2(i * 23.0 + 54.0, i * -43.0 + 13.0), scale);
		if(s > clamp(light * (advSamples + 1.0 - i), 0.0, 1.0) ||
		s > clamp(light * (advSamples - i), 0.0, 1.0)) {
			float col = i / advSamples;
			return col;
		}
	}
	return 0.92;
}

void main() {
	float light = pow(clamp(1.3 - distance(vNormal, normalize(vec3(0.075, -0.275, 1.0))), 0.0, 1.0), 0.75);
	
	float depth = (gl_FragCoord.z) / 2.0 + 0.5;
	
	gl_FragColor = vec4(floor(depth * 256.0) / 256.0, mod(depth * 256.0, 1.0), uMaterialColor.b * advSample(light, vPosition + positionOffset, 10.0), uMaterialColor.a);
}
`;

const postVertShader = `
precision mediump float;

attribute vec3 aPosition;
attribute vec2 aTexCoord;

varying vec2 vTexCoord;

void main() {
  vTexCoord = aTexCoord;

  vec4 positionVec4 = vec4(aPosition, 1.0);
  positionVec4.xy = positionVec4.xy * 2.0 - 1.0;

  gl_Position = positionVec4;
}
`;

const postACfragShader = `
precision mediump float;

uniform sampler2D sceneImage;
uniform sampler2D altPostImage;
uniform vec3 darkColor;
uniform vec3 lightColor;
uniform vec2 pixelSize;
uniform float screenDivide;

varying vec2 vTexCoord;

float getDepth(vec4 col) {
	return col.r + col.g / 256.0;
}

float sample(float depth, vec2 coords, float accuracy) {
	vec4 col = texture2D(sceneImage, coords);
	float otherDepth = getDepth(col);
	return depth - otherDepth > accuracy ? 0.0035 : 0.0;
}

float sampleAC(float depth, vec2 coords, vec2 dist, float accuracy) {
	return sample(depth, coords + vec2(0.0, dist.y), accuracy) +
	sample(depth, coords + vec2(0.0, -dist.y), accuracy) +
	sample(depth, coords + vec2(dist.x, 0.0), accuracy) +
	sample(depth, coords + vec2(-dist.x, 0.0), accuracy) +
	sample(depth, coords + vec2(dist.x, dist.y), accuracy) +
	sample(depth, coords + vec2(dist.x, -dist.y), accuracy) +
	sample(depth, coords + vec2(-dist.x, dist.y), accuracy) +
	sample(depth, coords + vec2(-dist.x, -dist.y), accuracy);
}

bool nearEdge(vec2 coords) {
	return getDepth(texture2D(sceneImage, coords + vec2(0.0, pixelSize.y * 2.0))) > 0.999 ||
	getDepth(texture2D(sceneImage, coords + vec2(pixelSize.x * 2.0, 0.0))) > 0.999  ||
	getDepth(texture2D(sceneImage, coords + vec2(0.0, pixelSize.y * -2.0))) > 0.999 ||
	getDepth(texture2D(sceneImage, coords + vec2(pixelSize.x * -2.0, 0.0))) > 0.999;
}

void main() {
	vec2 coords = vTexCoord;
	coords.y = 1.0 - coords.y;
	
	#worldSwapStart#
	
	vec4 col = texture2D(sceneImage, coords);
	float depth = getDepth(col);
	
	if(depth > 0.999 || nearEdge(coords)) {
		gl_FragColor = vec4(mix(darkColor, lightColor, col.b), col.a);
	} else {
		float ac = #ACsample#;
		gl_FragColor = vec4(mix(darkColor, lightColor, col.b * ac), col.a);
	}
	
	#worldSwapEnd#
}
`;

const postFragShader = ` // no AC
precision mediump float;

uniform sampler2D sceneImage;
uniform sampler2D altPostImage;
uniform vec3 darkColor;
uniform vec3 lightColor;
uniform vec2 pixelSize;
uniform float screenDivide;

varying vec2 vTexCoord;

void main() {
	vec2 coords = vTexCoord;
	coords.y = 1.0 - coords.y;
	
	#worldSwapStart#
	
	vec4 col = texture2D(sceneImage, coords);
	gl_FragColor = vec4(mix(darkColor, lightColor, col.b), col.a);
	
	#worldSwapEnd#
}
`;

const hqShaderReplacments = {
	ACsample: "1.0 - (sampleAC(depth, coords, pixelSize * 16.0, 0.004) * 6.0 + sampleAC(depth, coords, pixelSize * 8.0, 0.002) * 8.0 + sampleAC(depth, coords, pixelSize * 4.0, 0.001) * 14.0 + sampleAC(depth, coords, pixelSize * 2.0, 0.0005) * 28.0)",
	sceneAdvSamples: "8.0"
}

const lqShaderReplacments = {
	ACsample: "1.0 - (sampleAC(depth, coords, pixelSize * 8.0, 0.002) * 16.0 + sampleAC(depth, coords, pixelSize * 3.0, 0.00075) * 40.0)",
	sceneAdvSamples: "4.0"
}

const worldSwitchShaderReplacment = {
	"worldSwapStart": `
		if(coords.x * 1.1 - coords.y * 0.1 > screenDivide) {
	`,
	"worldSwapEnd": `
		} else {
			gl_FragColor = texture2D(altPostImage, coords);
		}
	`
}

function createPostShader(buffer, doAC, doHQ) {
	const shaderString = replaceShaderParts(doAC ? postACfragShader : postFragShader, worldSwitchShaderReplacment);
	return buffer.createShader(postVertShader, replaceShaderQualityParts(shaderString, doHQ))
}

function replaceShaderQualityParts(shaderString, doHQ) { // replace for low and high quality shaders
	const replacments = doHQ ? hqShaderReplacments : lqShaderReplacments;
	return replaceShaderParts(shaderString, replacments)
}

function replaceShaderParts(shaderString, replacments) {
	// replace parts of shader code dynamically to apply graphics settings (and other stuff)
	for (let key in replacments) {
		shaderString = shaderString.replaceAll("#" + key + "#", replacments[key]);
	}
	return shaderString;
}