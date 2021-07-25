// 4 a mouwii dot

const isDev = false; // ### run the level editor by changing this line from "false" to "true" ###
// level editor keyboard shortcuts
// W, A, S, D, Q, E -> move place brush
// R -> rotate the place brush
// ] -> place block
// [ -> remove block
// space -> switch the active world
// M -> switch between editing and playing

const gameTitle = "mouwi minecraft";

const settings = JSON.parse(localStorage.getItem("gameSettings")) || {
	general: {
		allowCameraRotation: false,
		FPSindicator: false,
		minimalUI: false,
		sceneScale: 125, // size of a block in pixels i think
		runMobile: mobileCheck()
	},
	graphics: {
		doAA: false,
		doAC: true,
		doHQ: true,
		frameScale: 1, // 60 or 30 target fps
	}
};

let player, worldL, worldR;

let gameScene = "menu";
let largeScreen = false;
let cameraAngle = -Math.PI / 4;
let cameraRotationGoal = 0;
let currentLevelName = "Untitled";
let UIinterest = 0;
let mouseWasPressed = false;
let shakeTimeout = 0;

const screenMinorWorldSize = 0.07; // how much of the screen shows the de-selected world
let screenDivide = screenMinorWorldSize; // where the line is that divides the worlds; from 0: full left, to 1: full right

let divideKeyFrames = [{
	time: 0,
	value: screenDivide
}]; // list of key frames to move the screen divide

let leftSelected = false; // is the left world selected?
let pauseReasons = {}; // controls is the game is updated

let gameData; // the p5Zip instance holding the game assets

const blockModels = {},
	blockNames = [];
let blockProperties;

const playerModels = [];
let playerBop; // the heights that the play bobs in the run cycle

let logMode = "alert"; // meathod used to log error; alert, print, none

// dev vars
const devPlaceLocation = { // where is the level editer placing a block
	x: 0,
	y: 0,
	z: 0,
	r: 0
};
let editMode = isDev; // is the level editor editing or playing the game
let devLastSelected = null;
let devPlaneImage; // image used to add a floor grid on the level editor

// dom ui for level editor
let devPlaceSelect;
let levelDisplay;
let aLevelInput;
let bLevelInput;
let startingHeightInput;

function preload() {
	gameData = new p5Zip("assets4");
	gameData.subFolder = "assets";
	gameData.inPreload = true;

	blockProperties = gameData.getJSONarray("blockProperties", "json", (blockProperties) => {
		for (const name in blockProperties) {
			blockModels[name] = gameData.getModel(name, "obj");
			blockNames.push(name);
		}
	});
	for (let i = 0; i < 12; i++) {
		playerModels[i] = gameData.getModel("player" + i, "obj");
	}
	playerBop = gameData.getJSON("playerBop", "json");
	if (isDev) {
		devPlaneImage = gameData.getImage("devPlane", "png");
	}

	gameData.inPreload = false;
}

function setup() {
	createCanvas(windowWidth, windowHeight);

	worldL = new World(width, height);
	worldL.lightColor = [33, 255, 252];

	worldR = new World(width, height);
	worldR.lightColor = [255, 220, 50];
	worldR.altWorld = worldL; // makes worldR draw worldL past the screen divide

	player = new Character();

	if (isDev) {
		// build dev ui
		devPlaceSelect = createSelect().position(5, 10);
		for (const name of blockNames) {
			devPlaceSelect.option(name);
		}
		levelDisplay = createDiv().position(5, 35).style("background-color", "white").style("color", "black");
		createButton("Next Level").position(5, 60).mousePressed(nextLevel);
		createButton("Previous Level").position(5, 85).mousePressed(previousLevel);
		createButton("Add Level At End").position(5, 110).mousePressed(createLevelLocally);
		createButton("Remove Last Level").position(5, 135).mousePressed(removeLastLevelLocally);
		createButton("Clear Level").position(5, 160).mousePressed(() => createLevelLocally(currentLevel));
		createButton("Copy Side To Other").position(90, 160).mousePressed(() => {
			if (leftSelected) {
				worldR.blocks = JSON.parse(JSON.stringify(worldL.blocks));
			} else {
				worldL.blocks = JSON.parse(JSON.stringify(worldR.blocks));
			}
		});
		aLevelInput = createInput("0", "number").attribute("placeholder", "Level A").position(5, 185).size(80);
		bLevelInput = createInput("0", "number").attribute("placeholder", "Level B").position(100, 185).size(80);
		createButton("Switch Levels").position(195, 185).mousePressed(
			() => switchLevelsLocally(Number(aLevelInput.value()) || 0, Number(bLevelInput.value()) || 0));
		startingHeightInput = createInput("", "number").attribute("placeholder", "Player Start Altitude").changed(() => {
			autoSave();
			player.resetPosition(Number(startingHeightInput.value()));
		}).position(5, 210);
		levelNameInput = createInput("", "text").attribute("placeholder", "Level name").changed(autoSave).position(5, 235);
		createButton("Download Levels").position(5, 260).mousePressed(saveLocalLevelsToZip);
	}

	setupLevels();

	if (isDev) {
		settings.graphics.doAC = false; // stops the floor grid from bugging out
		gameScene = "game";
		loadLevel(0);
	}
}

function windowResized() {
	resizeCanvas(window.innerWidth, window.innerHeight);
	worldR.resize(window.innerWidth, window.innerHeight);
	worldL.resize(window.innerWidth, window.innerHeight);
}

function draw() {
	push();

	if (width > 1000 && height > 680) largeScreen = true;
	else largeScreen = false;

	switch (gameScene) {
		case "menu":
			drawMenuScene();
			break;
		case "levelSelect":
			drawLevelSelectScene();
			break;
		case "settings":
			drawGeneralSettingsScene();
			break;
		case "graphicsSettings":
			drawGraphicsSettingsScene();
			break;
		default:
		case "game":
			drawGameScene();
			break;
		case "controls":
			drawControlsScene();
			break;
		case "winScreen":
			drawWinScene();
			break;
	}

	mouseWasPressed = false;
	pop();
}

function drawMenuScene() {
	drawMenuBackground();

	textAlign(CENTER, CENTER);
	fill(0);
	noStroke();

	if (largeScreen) {
		textSize(128);
		text(gameTitle, width / 2, 80);
		textSize(36);
		text("uwu binch", width / 2, 140);
		drawButton("Start", width / 2, 245, true, () => {
			loadLevel(0);
			gameScene = "game"
		});
		drawButton("Level Select", width / 2, 370, true, () => gameScene = "levelSelect");
		drawButton("Settings", width / 2, 495, true, () => gameScene = "settings");
		drawButton("Controls", width / 2, 620, true, () => gameScene = "controls");
	} else {
		textSize(64);
		text(gameTitle, width / 2, 50);
		textSize(24);
		text("uwu binch", width / 2, 85);
		drawButton("Start", width / 2, 145, false, () => {
			loadLevel(0);
			gameScene = "game"
		});
		drawButton("Level Select", width / 2, 215, false, () => gameScene = "levelSelect");
		drawButton("Settings", width / 2, 285, false, () => gameScene = "settings");
		drawButton("Controls", width / 2, 355, false, () => gameScene = "controls");
	}
}

function drawLevelSelectScene() {
	drawMenuBackground();
	drawEscapeButton();

	const progress = getLevelProgress();
	const total = levelCount;
	const xSpacing = largeScreen ? 160 : 90;
	const ySpacing = largeScreen ? 140 : 80;
	const rowSize = 5;
	for (let i = 0; i < total; i++) {
		const x = (i % rowSize - rowSize / 2 + 0.5) * xSpacing;
		const y = floor(i / rowSize) * ySpacing;
		let callback = (() => {
			loadLevel(i);
			gameScene = "game";
		}).bind(i);
		if (i > progress) callback = null;
		drawButton(nf(i + 1, 2), width / 2 + x, 250 + y, largeScreen, callback);
	}
}

function drawGeneralSettingsScene() {
	drawSettingsSceneCommon();

	drawButton("General", 251, 40, false, null);
	drawButton("Graphics", 460, 40, false, () => gameScene = "graphicsSettings");

	drawSettingsToggleButton("Camera Rotation:", 150, settings.general, "allowCameraRotation");
	drawSettingsToggleButton("FPS Indicator:", 220, settings.general, "FPSindicator");
	drawSettingsToggleButton("Minimal UI:", 290, settings.general, "minimalUI");
	const sceneScale = settings.general.sceneScale;
	let nextSceneScale;
	switch (sceneScale) {
		case 60:
			nextSceneScale = 100;
			break;
		case 100:
			nextSceneScale = 125;
			break;
		case 125:
			nextSceneScale = 180;
			break;
		case 180:
			nextSceneScale = 60;
			break;
	}
	drawSettingsButton("Scene Scale: " + sceneScale, 360, settings.general, "sceneScale", nextSceneScale);
	drawSettingsToggleButton("Run for Mobile:", 430, settings.general, "runMobile");
	drawButton("Reset Progress", width / 2, 500, false, () => {
		if (confirm("Are you sure you want to reset all progress?") === true) {
			localStorage.removeItem("levelProgress");
		}
	})
}

function drawGraphicsSettingsScene() {
	drawSettingsSceneCommon();

	drawButton("General", 251, 40, false, () => gameScene = "settings");
	drawButton("Graphics", 460, 40, false, null);

	drawSettingsToggleButton("Anti Aliasing:", 150, settings.graphics, "doAA");
	drawSettingsToggleButton("Ambient Occlusion:", 220, settings.graphics, "doAC");
	drawSettingsToggleButton("High Quality Shaders:", 290, settings.graphics, "doHQ");
	const frameScale = settings.graphics.frameScale;
	let frameScaleRate, nextFrameScale;
	switch (frameScale) {
		case 1:
			frameScaleRate = 60;
			nextFrameScale = 2;
			break;
		case 2:
			frameScaleRate = 30;
			nextFrameScale = 3;
			break;
		case 3:
			frameScaleRate = 20;
			nextFrameScale = 1;
			break;
	}
	drawSettingsButton("Target FPS: " + frameScaleRate, 360, settings.graphics, "frameScale", nextFrameScale);
}

function drawSettingsSceneCommon() {
	drawMenuBackground();
	drawEscapeButton(true);
}

function drawSettingsToggleButton(str, y, settingsMenu, attribute) {
	const nextValue = !settingsMenu[attribute];
	str += settingsMenu[attribute] ? " On" : " Off";
	drawSettingsButton(str, y, settingsMenu, attribute, nextValue);
}

function drawSettingsButton(str, y, settingsMenu, attribute, nextValue) {
	drawButton(str, width / 2, y, false, () => {
		settingsMenu[attribute] = nextValue;
		localStorage.setItem("gameSettings", JSON.stringify(settings));
	})
}

function drawControlsScene() {
	drawMenuBackground();
	drawEscapeButton();

	textAlign(LEFT, CENTER);
	fill(0);
	noStroke();
	if (largeScreen) {
		textSize(48);
		text("Move: WASD or Arrow Keys", 120, 180);
		text("Swap: Space", 120, 235);
		text("Exit: M", 120, 290);
		text("Rotate: R (Enable in Settings)", 120, 345);
	} else {
		textSize(32);
		text("Move: WASD or Arrow Keys", 80, 120);
		text("Swap: Space", 80, 160);
		text("Exit: M", 80, 200);
		text("Rotate: R (Enable in Settings)", 80, 240);
	}
}

function drawWinScene() {
	drawMenuBackground();
	drawEscapeButton();

	textAlign(CENTER, CENTER);
	fill(0);
	noStroke();

	if (largeScreen) {
		textSize(220);
		text("Mouwii Wins!", width / 2, 300);
	} else {
		textSize(120);
		text("Mouwii Wins!", width / 2, 200);
	}
}

function drawMenuBackground() {
	frameRate(60);
	background(33, 255, 252);
	noStroke();
	fill(255, 220, 50);
	beginShape();
	vertex(width / 5, 0);
	vertex(width, 0);
	vertex(width, height);
	vertex(width / 5 * 4, height);
	endShape(CLOSE);
}

function drawEscapeButton(forceSmall = false) {
	if (largeScreen && !forceSmall) {
		drawButton("Menu", 144, 70, true, () => gameScene = "menu");
	} else {
		drawButton("Menu", 78, 40, false, () => gameScene = "menu");
	}
}

function drawButton(str, x, y, large, callback = null) {
	push();
	if (large) {
		textSize(96);
	} else {
		textSize(48);
	}
	const buttonWidth = textWidth(str) + (large ? 24 : 16);
	const buttonHeight = large ? 96 + 18 : 48 + 12
	if (mouseX > x - buttonWidth / 2 && mouseX < x + buttonWidth / 2 &&
		mouseY > y - buttonHeight / 2 && mouseY < y + buttonHeight / 2 &&
		callback != null) {
		stroke(0);
		fill(0, 80);
		if (mouseWasPressed) {
			callback();
		}
	} else if (callback == null) {
		stroke(60);
		fill(0, 120);
	} else {
		stroke(0);
		fill(0, 40);
	}
	strokeWeight(5);
	rectMode(CENTER);
	rect(x, y, buttonWidth, buttonHeight);
	textAlign(CENTER, CENTER);
	fill(0);
	noStroke();
	text(str, x - (large ? 2.5 : 1.25), y);
	pop();
}

function drawGameScene() {
	frameRate(60 / settings.graphics.frameScale);
	background(255, 0, 255);

	if (isDev) {
		levelDisplay.elt.innerHTML = `<b>[ Level: ${String(currentLevel)} ]`;
		if (devLastSelected !== devPlaceSelect.value()) {
			devLastSelected = devPlaceSelect.value();
			devPlaceSelect.elt.blur(); // deselect for a better user experience
		}
	}

	if (isGameRunning()) {
		for (let i = 0; i < settings.graphics.frameScale; i++) {
			update();
		}

		worldL.draw(leftSelected, player.position);
		worldR.draw(!leftSelected, player.position);

		image(worldR.outImage, 0, 0, width, height);
	}

	if (!isDev) {
		if (!settings.general.minimalUI || UIinterest > 0) {
			textAlign(LEFT, TOP);
			textSize(32);
			if (!settings.general.minimalUI) textStyle(BOLD);
			if (settings.general.minimalUI) {
				const alpha = min(255, UIinterest * 15);
				fill(0, alpha);
			} else {
				fill(0);
			}
			strokeWeight(2);
			text(currentLevelName, 32, 32);
			if (player.oKeys > 0)
				text("O keys: " + player.oKeys, 32, 64);
			if (player.xKeys > 0) {
				if (player.oKeys > 0) {
					text("X keys: " + player.xKeys, 32, 96);
				} else {
					text("X keys: " + player.xKeys, 32, 64);
				}
			}
		}
	}

	if (settings.general.FPSindicator) {
		textAlign(RIGHT, TOP);
		textSize(32);
		if (!settings.general.minimalUI) textStyle(BOLD);
		fill(0);
		text(String(floor(frameRate())) + " FPS", width - 32, 32);
	}
}

function isGameRunning() {
	return Object.keys(pauseReasons).length <= 0;
}

function update() {
	const cameraRotation = cameraRotationGoal * 0.1 * settings.graphics.frameScale;
	cameraAngle += cameraRotation;
	cameraRotationGoal -= cameraRotation;
	UIinterest -= settings.graphics.frameScale;
	shakeTimeout -= settings.graphics.frameScale;

	if (!editMode) {
		player.update(leftSelected ? worldL.blocks : worldR.blocks);
	}

	updateScreenDivide();
}

function updateScreenDivide() { // animate the screen divide with key frames
	const frame = frameCount * settings.graphics.frameScale;

	if (divideKeyFrames.length === 1) {
		screenDivide = divideKeyFrames[0].value;
		divideKeyFrames[0].time = frame;
	} else {
		const keyFrameTime = divideKeyFrames[1].time - divideKeyFrames[0].time;
		const timeAfterKeyFrameStart = frame - divideKeyFrames[0].time;
		const keyFrameProgess = constrain(timeAfterKeyFrameStart / keyFrameTime, 0, 1);
		screenDivide = divideKeyFrames[0].value + (divideKeyFrames[1].value - divideKeyFrames[0].value) * keyFrameProgess;
		if (keyFrameProgess === 1) {
			divideKeyFrames.shift();
		}
	}
}

function addDivideKeyFrames(timeTell, value) {
	divideKeyFrames.push({
		time: divideKeyFrames[divideKeyFrames.length - 1].time + timeTell,
		value: value
	});
}

function forceDivideKeyFrames(timeTell, value) {
	divideKeyFrames = [{
		time: frameCount,
		value: screenDivide
	}];
	addDivideKeyFrames(timeTell, value)
}

function switchDivide(onLeft, force = false) {
	if (onLeft === leftSelected) return;

	player.runKeyCollisions(onLeft ? worldL.blocks : worldR.blocks, false);

	const newWorldCollisionSize = player.runWallCollision(onLeft ? worldL.blocks : worldR.blocks, true);

	if (newWorldCollisionSize < 0.05 || force) { // pervent bugging into other worlds geometry
		leftSelected = onLeft;
		forceDivideKeyFrames(25, leftSelected ? 1 - screenMinorWorldSize : screenMinorWorldSize);
	} else {
		forceDivideKeyFrames(12, 0.5);
		addDivideKeyFrames(20, leftSelected ? 0.48 : 0.52);
		addDivideKeyFrames(25, leftSelected ? 1 - screenMinorWorldSize : screenMinorWorldSize)
	}
}

function mouseReleased() {
	mouseWasPressed = true;
}

function deviceShaken() {
	if (settings.general.runMobile && shakeTimeout < 0) {
		key = " ";
		keyPressed();
		shakeTimeout = 20;
	}
}

function keyPressed() {
	if (gameScene !== "game") return;

	if (!isDev) {
		if (key === " ") {
			switchDivide(!leftSelected);
		}
		if (key === "r" && settings.general.allowCameraRotation) {
			cameraRotationGoal += HALF_PI;
		}
		if (key === "m") {
			gameScene = "menu";
		}
	} else {
		screenDivide = leftSelected ? 1 - screenMinorWorldSize : screenMinorWorldSize;
		const editWorld = leftSelected ? worldL : worldR;
		if (editMode) {
			if (key === "w") {
				devPlaceLocation.x--;
			} else if (key === "s") {
				devPlaceLocation.x++;
			} else if (key === "a") {
				devPlaceLocation.z++;
			} else if (key === "d") {
				devPlaceLocation.z--
			} else if (key === "q") {
				devPlaceLocation.y--;
			} else if (key === "e") {
				devPlaceLocation.y++;
			} else if (key === "r") {
				devPlaceLocation.r += HALF_PI;
				devPlaceLocation.r %= TWO_PI;
			} else if (key === "]") {
				editWorld.blocks[devPlaceLocation.x + "," + devPlaceLocation.y + "," + devPlaceLocation.z] = {
					r: devPlaceLocation.r,
					type: devPlaceSelect.value()
				};
			} else if (key === "[") {
				delete editWorld.blocks[devPlaceLocation.x + "," + devPlaceLocation.y + "," + devPlaceLocation.z];
			}
		}
		if (key === " ") switchDivide(!leftSelected, editMode);
		else if (key === "m") editMode = !editMode;
	}
	autoSave();
}

function autoSave() {
	if (!isDev || !editMode) return;
	saveCurrentLevelLocally();
}

function logMessage(str) {
	if (logMode === "alert") {
		if (!confirm(str)) logMode = "print";
	} else if (logMode === "print") {
		console.log(str);
	}
}

// thanks to detectmobilebrowsers.com
function mobileCheck() {
	let check = false;
	(function(a) {
		if (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(a) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0, 4))) check = true;
	})(navigator.userAgent || navigator.vendor || window.opera);
	return check;
};