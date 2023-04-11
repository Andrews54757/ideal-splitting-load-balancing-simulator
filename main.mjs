import Dat from './dat.gui.mjs';
import MersenneTwister from './twister.mjs';
const gui = new Dat.GUI();
const widthRatio = 8;
const config = {
    running: true,
    logarithmicSimulationSpeed: 0,
    seed: "0000000000",
    loaderSpeed: 4,
    thresholdSize: 27,
    thresholdResolution: 1,
    findMinimum: false
}

let controls = gui.addFolder("Simulation Controls");

controls.add(config, 'running').onChange(onRunningChange);
controls.add(config, 'logarithmicSimulationSpeed', 0, 6, 0.1);

let simulationConfig = gui.addFolder("Simulation Config");
simulationConfig.add(config, 'seed').onChange(onConfigChange);
simulationConfig.add(config, 'loaderSpeed', 1, 8, 1).onChange(onConfigChange);
simulationConfig.add(config, 'thresholdSize', 1, 100, 1).onChange(onConfigChange);
simulationConfig.add(config, 'thresholdResolution', 1, 100, 1).onChange(onConfigChange);
simulationConfig.add(config, 'findMinimum').onChange(onConfigChange);
gui.width = 500;

let rng;
let rngColor;
let loaders;
let taskCounter = 0;
let currentTask = null;

function onConfigChange() {
    resetSim();
}

function getNewTask() {
    let size = Math.floor(rng.random() * 27) + 1;
    let task = {
        id: taskCounter++,
        input: size,
        processed: 0,
        output: 0,
        color: getRandomColor()
    }
    return task;
}

function getRandomColor() {
    var colorRGB = [0xFF, 0x07, (rngColor.random() * 256) >> 0];
    colorRGB.sort(function () {
        return 0.5 - rngColor.random();
    });

    return {
        r: colorRGB[0],
        b: colorRGB[1],
        g: colorRGB[2]
    }
}

let tickCounter = 0;
let loaderContainer = document.getElementById("loaders");
let splitterContainer = document.getElementById("splitter");
let splitterTasks;
function resetSim() {
    rng = new MersenneTwister(config.seed.split("").map(c => parseInt(c)));
    rngColor = new MersenneTwister(0);
    loaderContainer.innerHTML = "";
    splitterContainer.innerHTML = "";

    const label = document.createElement("div");
    label.classList.add("label");
    label.innerText = "Splitter";
    splitterContainer.appendChild(label);


    splitterTasks = document.createElement("div");
    splitterTasks.classList.add("tasks");
    splitterContainer.appendChild(splitterTasks);

    loaders = [];
    taskCounter = 0;
    tickCounter = 0;
    currentTask = null;
}

function getNextLoader() {
    let minIndex = -1
    let threshold = Math.ceil(config.thresholdSize / config.thresholdResolution);
    let minValue = -1;
    for (let i = 0; i < loaders.length; i++) {
        if (Math.ceil(loaders[i].queued / config.thresholdResolution) >= threshold) continue;
        if (minIndex == -1 || Math.ceil(loaders[i].queued / config.thresholdResolution) < minValue) {
            minIndex = i;
            minValue = Math.ceil(loaders[i].queued / config.thresholdResolution);
            if (!config.findMinimum) {
                break;
            }
        }
    }

    if (minIndex != -1) {
        return loaders[minIndex];
    }

    let loader = {
        id: loaders.length,
        queued: 0,
        taskQueue: [],
        progress: 0,
        element: document.createElement("div"),
        taskListElement: document.createElement("div"),
    }

    loader.element.classList.add("loader");
    loaderContainer.appendChild(loader.element);

    const labelElement = document.createElement("div");
    loader.labelElement = labelElement;
    labelElement.classList.add("label");
    labelElement.innerText = "Loader " + (loader.id + 1);
    loader.element.appendChild(labelElement);

    loader.taskListElement.classList.add("tasks");
    loader.element.appendChild(loader.taskListElement);

    loaders.push(loader);

    return loader;
}



function tick(shouldUpdateDOM) {

    if (tickCounter % 2 == 0) { // half-speed
        if (!currentTask || currentTask.input <= 0) {
            if (currentTask) {
                splitterTasks.removeChild(currentTask.splitterElement);
                currentTask.splitterElement = null;
            }
            currentTask = getNewTask();
            currentTask.loader = getNextLoader();
            currentTask.loader.taskQueue.push(currentTask);
            currentTask.splitterElement = document.createElement("div");
            currentTask.splitterElement.classList.add("task");
            currentTask.splitterElement.innerText = currentTask.id;
            currentTask.splitterElement.style.backgroundColor = `rgb(${currentTask.color.r}, ${currentTask.color.g}, ${currentTask.color.b})`;
            splitterTasks.appendChild(currentTask.splitterElement);

            currentTask.loaderElement = document.createElement("div");
            currentTask.loaderElement.classList.add("task");
            currentTask.loaderElement.innerText = currentTask.id;
            currentTask.loaderElement.style.backgroundColor = `rgb(${currentTask.color.r}, ${currentTask.color.g}, ${currentTask.color.b})`;
            currentTask.loader.taskListElement.appendChild(currentTask.loaderElement);
        }


        currentTask.loader.queued++;
        currentTask.input--;
        currentTask.processed++;
        if (shouldUpdateDOM) {
            currentTask.splitterElement.style.width = currentTask.input * widthRatio + "px";
            currentTask.loaderElement.style.width = Math.ceil((currentTask.processed - (currentTask.loader.progress / 64)) * widthRatio) + "px";
            currentTask.loader.labelElement.innerText = "Loader " + (currentTask.loader.id + 1) + " (" + currentTask.loader.queued + ")";
        }
    }

    loaders.forEach(loader => {
        if (loader.queued <= 0) {
            loader.progress = 0;
            return;
        }

        loader.progress += config.loaderSpeed;

        while (loader.progress >= 64) {
            loader.progress = loader.progress - 64;

            loader.queued--;
            loader.taskQueue[0].processed--;
            loader.taskQueue[0].output++;

            if (loader.taskQueue[0].processed <= 0) {
                loader.taskListElement.removeChild(loader.taskQueue[0].loaderElement);
                loader.taskQueue.shift();
            }
        }
        if (shouldUpdateDOM) {
            currentTask.loader.labelElement.innerText = "Loader " + (currentTask.loader.id + 1) + " (" + currentTask.loader.queued + ")";

            if (loader.taskQueue.length) {
                let task = loader.taskQueue[0];
                task.loaderElement.style.width = Math.ceil((task.processed - (task.loader.progress / 64)) * widthRatio) + "px";
            }
        }
    });
    tickCounter++;
}

let delta = 0;
let lastTick = performance.now();

function onRunningChange() {
    delta = 0;
    lastTick = performance.now();
}
function mainLoop() { // hopperspeed
    let now = performance.now();
    let simultationSpeed = 10 ** config.logarithmicSimulationSpeed;
    let simulationDelay = 400 / simultationSpeed;
    let diff = now - lastTick;
    delta += diff / simulationDelay;
    lastTick = now;

    if (config.running) {
        let multiplicity = 0;
        while (delta >= 1) {
            tick(multiplicity === 0);
            delta--;
            multiplicity++;

            let now2 = performance.now();
            if (now2 - now >= 40) {
                delta = 0;
                break;
            }
        }
    }

    requestAnimationFrame(mainLoop);
}
resetSim();
mainLoop();
