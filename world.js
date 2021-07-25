let levelsStoredLocally = false; // are levels in local storage or the gameData zip
let currentLevel = 0;
let levelCount; // total amount of levels found

// scene shader red channel is object rotation 
// blue is object lightness (monochrome colour)

class World {
	constructor(width, height) {
		this.blocks = {};

		this.darkColor = [32, 30, 26]; // range of colours for the world
		this.lightColor = [250, 238, 210];
		this.backgroundLightness = 255; // where on the colour range is the background

		this.width = width;
		this.height = height;

		// remmeber old settings to detect changes
		this.doAA = settings.graphics.doAA;
		this.doAC = settings.graphics.doAC;
		this.doHQ = settings.graphics.doHQ;

		this.outImage = null;
		this.altWorld = null;

		this.buildGraphics();
	}

	setLevel(level) {
		this.blocks = level.blocks || this.blocks;
	}

	getLevel() {
		return {
			blocks: this.blocks
		};
	}

	buildGraphics() {
		setAttributes("antialias", this.doAA);
		this.sceneBuf = createGraphics(this.width, this.height, WEBGL);
		this.sceneShader = this.sceneBuf.createShader(sceneVertShader, replaceShaderQualityParts(sceneFragShader, this.doHQ));
		setAttributes("antialias", this.doAA);
		this.postBuf = createGraphics(this.width, this.height, WEBGL);
		this.postShader = createPostShader(this.postBuf, this.doAC, this.doHQ);
		this.outImage = null;
	}

	removeGraphics() { // remove graphics objects to put the world in a like new state
		this.sceneBuf.remove();
		this.sceneBuf = null;
		this.sceneShader = null;
		this.postBuf.remove();
		this.postBuf = null;
		this.postShader = null;
	}

	rebuildGraphics() {
		this.removeGraphics();
		this.buildGraphics();
	}

	insureGraphics() { // make sure settings are up to date
		if (settings.graphics.doAA !== this.doAA ||
			settings.graphics.doAC !== this.doAC ||
			settings.graphics.doHQ !== this.doHQ) {
			this.doAA = settings.graphics.doAA;
			this.doAC = settings.graphics.doAC;
			this.doHQ = settings.graphics.doHQ;
			this.rebuildGraphics();
		}
	}

	resize(width, height) {
		this.width = width;
		this.height = height;
		this.rebuildGraphics();
	}

	draw(selected, cameraPosition) {
		this.insureGraphics();

		const g = this.sceneBuf;

		g.push();
		g.resetMatrix();
		g.clear();
		g.background(255, 255, this.backgroundLightness);
		g.noStroke();
		g.ortho(-width / 2, width / 2, -height / 2, height / 2, 1, 10000);
		g.shader(this.sceneShader);
		this.sceneShader.setUniform("darkColor", this.darkColor.map(v => v / 255));
		this.sceneShader.setUniform("lightColor", this.lightColor.map(v => v / 255));
		this.sceneShader.setUniform("screenSize", [g.width, g.height]);
		// make the texture in the world move with the world not the camera
		const positionOffset = createVector(cameraPosition.x, cameraPosition.z).copy().rotate(-cameraAngle)
			.add(0, cameraPosition.y).mult(settings.general.sceneScale).mult(2, -sqrt(2));
		this.sceneShader.setUniform("positionOffset", [positionOffset.x, positionOffset.y]);

		g.translate(1, 1, -5000);
		g.rotateX(-PI / 4);
		g.rotateY(cameraAngle);
		g.scale(settings.general.sceneScale);
		g.translate(-cameraPosition.x, -cameraPosition.y, -cameraPosition.z);

		g.push();
		for (const blockID in this.blocks) { // draw level blocks
			const block = this.blocks[blockID];
			const [x, y, z] = blockID.split(",");
			g.push();
			g.translate(x, y, z);
			g.rotateY(block.r);
			g.fill((block.r) * 32, 0, 255);
			g.model(blockModels[block.type]);
			g.pop();
			if (isDev) { // draw shadows in level editor
				g.push();
				g.rotateX(HALF_PI);
				g.fill(0, 0, 96);
				g.translate(x, z, 0.02);
				g.plane(0.4, 0.4);
				g.pop();
			}
		}
		g.pop();

		if (isDev) { // draw floor grid in level editor
			g.push();
			g.texture(devPlaneImage);
			g.rotateX(HALF_PI);
			g.plane(31, 31);
			if (selected && editMode) {
				g.fill(0);
				g.translate(devPlaceLocation.x, devPlaceLocation.z, 0.05);
				g.plane(0.4, 0.4);
				g.pop();
				g.push();
				g.translate(devPlaceLocation.x, devPlaceLocation.y, devPlaceLocation.z);
				g.rotateY(devPlaceLocation.r);
				g.fill((devPlaceLocation.r) * 32, 0, 128);
				g.model(blockModels[devPlaceSelect.value()]);
			}
			g.pop();
		}

		player.draw(g);

		g.push();
		this.postBuf.noStroke();
		this.postBuf.shader(this.postShader);
		this.postShader.setUniform("sceneImage", g);
		if (this.altWorld != null) {
			this.postShader.setUniform("altPostImage", this.altWorld.outImage);
		}
		this.postShader.setUniform("darkColor", this.darkColor.map(v => v / 255));
		this.postShader.setUniform("lightColor", this.lightColor.map(v => v / 255));
		this.postShader.setUniform("pixelSize", [1 / g.width, 1 / g.height]);
		this.postShader.setUniform("screenDivide", (this.altWorld != null) ? screenDivide : -1);
		this.postBuf._accessibleOutputs = { // worst hack ever
			grid: false,
			text: false
		}
		this.postBuf.rect(0, 0, 1, 1);
		this.outImage = this.postBuf;
		g.pop();
	}
}

function setupLevels() {
	findLevelCount().then((_levelCount) => {
		levelCount = _levelCount;
		if (isDev) importToLocalLevels();
		if (levelCount <= 0 && currentLevel === 0) {
			if (isDev) { // create first level automaticly if the level editor is open
				logMessage("Creating first level for development");
				createLevelLocally();
			} else {
				logMessage("No levels found");
			}
		}
	});
}

function nextLevel() {
	if (currentLevel + 1 >= levelCount) {
		if (isDev) {
			logMessage("Next level missing");
		} else {
			gameScene = "winScreen";
		}
		return false;
	}
	currentLevel++;
	loadLevel(currentLevel);
	return true;
}

function previousLevel() {
	if (currentLevel <= 0) {
		logMessage("No previous level");
		return false;
	}
	currentLevel--;
	loadLevel(currentLevel);
	return true;
}

function loadLevel(levelNumber, fromLocalStorage = levelsStoredLocally) { // load a level then run the game after loading
	if (levelNumber >= levelCount) {
		logMessage("Can't load level that does not exist");
		return;
	}
	if (fromLocalStorage) {
		const levelData = JSON.parse(localStorage.getItem("levelData" + levelNumber));
		loadLevelData(levelData, levelNumber);
	} else {
		pauseReasons["loadingLevel"] = true;

		gameData.getJSON("levelData" + levelNumber, "json", data => {
			loadLevelData(data, levelNumber);
			delete pauseReasons["loadingLevel"];
		});
	}

	localStorage.setItem("levelProgress", max(getLevelProgress(), currentLevel));
}

function getLevelProgress() {
	const progress = localStorage.getItem("levelProgress");
	if (progress == null) return 0;
	return progress;
}

function loadLevelData(levelData, levelNumber) {
	currentLevel = levelNumber;
	worldL.setLevel(levelData.left);
	worldR.setLevel(levelData.right);
	player.reset(levelData.startingHeight);
	currentLevelName = levelData.name;

	if (isDev) {
		startingHeightInput.value(String(levelData.startingHeight));
		levelNameInput.value(levelData.name);
	}

	UIinterest = 160;
	cameraAngle = -Math.PI / 4;
}

function findLevelCount(fromLocalStorage = levelsStoredLocally) { // find the total amount of levels
	if (fromLocalStorage) {
		let levelNumber = 0;
		while (localStorage.getItem("levelData" + levelNumber) != null) {
			levelNumber++;
		}
		return Promise.resolve(levelNumber);
	} else {
		return new Promise((resolve) => {
			gameData.getJSON("levelCount", "json", data => { resolve(data.count); });
		});
	}
}

function createLevelLocally(levelNumber = levelCount) {
	localStorage.setItem("levelData" + levelNumber, JSON.stringify({
		left: {
			blocks: {}
		},
		right: {
			blocks: {}
		},
		startingHeight: 0,
		name: "untitled"
	}));
	findLevelCount().then((_levelCount) => {
		levelCount = _levelCount;
		loadLevel(levelCount - 1);
	});
}

function removeLastLevelLocally() {
	const levelNumber = levelCount - 1;
	if (levelNumber === currentLevel) {
		if (!previousLevel()) {
			return;
		}
	}
	localStorage.removeItem("levelData" + levelNumber);
	findLevelCount().then((_levelCount) => {
		levelCount = _levelCount;
		loadLevel(levelCount - 1);
	});
}

function switchLevelsLocally(levelNumberA, levelNumberB) {
	const levelDataA = localStorage.getItem("levelData" + levelNumberA);
	const levelDataB = localStorage.getItem("levelData" + levelNumberB);
	localStorage.setItem("levelData" + levelNumberA, levelDataB);
	localStorage.setItem("levelData" + levelNumberB, levelDataA);
	if (levelNumberA === currentLevel || levelNumberB === currentLevel) {
		loadLevel(currentLevel);
	}
}

function importToLocalLevels() {
	if (levelsStoredLocally) return;
	let levelsLeft = levelCount;
	if (levelsLeft <= 0) {
		logMessage("No levels found to import");
	} else {
		pauseReasons["importingLevels"] = true;

		new Promise((resolve) => {
			for (let i = 0; i < levelCount; i++) {
				gameData.getJSON("levelData" + i, "json", ((i, data) => {
					localStorage.setItem("levelData" + i, JSON.stringify(data));
					levelsLeft--;
					if (levelsLeft <= 0) resolve();
				}).bind(null, i));
			}
		}).then(() => {
			levelsStoredLocally = true;
			logMessage("Imported levels to local");
			delete pauseReasons["importingLevels"];
		});
	}
}

function saveCurrentLevelLocally(levelNumber = currentLevel) {
	localStorage.setItem("levelData" + levelNumber, JSON.stringify({
		left: worldL.getLevel(),
		right: worldR.getLevel(),
		startingHeight: Number(startingHeightInput.value() || 0),
		name: levelNameInput.value()
	}));
}

function saveLocalLevelsToZip() { // save to zip so it can be included in the gameData zip
	levelsZip = new JSZip();

	for (let i = 0; i < levelCount; i++) {
		const levelData = localStorage.getItem("levelData" + i);
		levelsZip.file(`levelData${i}.json`, levelData);
	}

	levelsZip.file("levelCount.json", JSON.stringify({ count: levelCount }));

	levelsZip.generateAsync({
		type: "blob"
	}).then(function (blob) {
		downloadFile(blob, `levels${new Date().getTime()}.zip`);
	});
}