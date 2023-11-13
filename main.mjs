import Dat from './dat.gui.mjs';
import MersenneTwister from './twister.mjs';
const gui = new Dat.GUI();
const widthRatio = 8;
const config = {
    running: true,
    logarithmicSimulationSpeed: 0,
    seed: "0000000000",
    loaderSpeed: 8,
    hasQueue: false,
    hasLoadBalancing: false,
    weightedThresholds: false,
    idealBalancing: false,
    sequence: "",
    tick: () => {
        tick(true);
    },
    reset: () => {
        resetSim();
    }
}

const colordict = {
    "brown": "#8B4513",
    "red": "#FF0000",
    "orange": "#FFA500",
    "yellow": "#FFFF00",
    "green": "#008000",
    "blue": "#0000FF",
    "purple": "#800080",
    "pink": "#FFC0CB",
    "gray": "#808080",
    "black": "#000000",
    "white": "#FFFFFF",
    "cyan": "#00FFFF",
    "magenta": "#FF00FF",
    "lime": "#00FF00",
    "olive": "#808000",
    "maroon": "#800000",
    "navy": "#000080",
    "teal": "#008080",
    "silver": "#C0C0C0",
    "indigo": "#4B0082",
    "violet": "#EE82EE",
    "turquoise": "#40E0D0",
    "tan": "#D2B48C",
    "salmon": "#FA8072",
    "plum": "#DDA0DD",
    "orchid": "#DA70D6",
    "khaki": "#F0E68C",
    "gold": "#FFD700",
    "fuchsia": "#FF00FF",
    "coral": "#FF7F50",
    "crimson": "#DC143C",
}

let controls = gui.addFolder("Simulation Controls");

controls.add(config, 'running').onChange(onRunningChange);
controls.add(config, 'tick');
controls.add(config, 'reset');
controls.add(config, 'logarithmicSimulationSpeed', 0, 8, 0.1);

let simulationConfig = gui.addFolder("Simulation Config");
simulationConfig.add(config, 'seed').onChange(onConfigChange);
simulationConfig.add(config, 'sequence').onChange(onConfigChange);
simulationConfig.add(config, 'loaderSpeed', 1, 8, 1).onChange(onConfigChange);
simulationConfig.add(config, 'hasQueue').onChange(onConfigChange);
simulationConfig.add(config, 'hasLoadBalancing').onChange(onConfigChange);
simulationConfig.add(config, 'weightedThresholds').onChange(onConfigChange);
simulationConfig.add(config, 'idealBalancing').onChange(onConfigChange);
gui.width = 500;

let rng;
let rngColor;
let loaders = [];
let latencies = 0;
let latencyCounter = 0;
let throughputs = 0;
let taskCounter = 0;
let currentTask = null;
let sequence = [];

function onConfigChange() {
    resetSim();
}
function stringToRGB(str) {
    if (!str) {
        return null;
    }

    return {
        r: parseInt(str.substr(1, 2), 16),
        g: parseInt(str.substr(3, 2), 16),
        b: parseInt(str.substr(5, 2), 16),
    }
}
function getNewTask() {
    let task = {
        id: ++taskCounter,
        input: 0,
        processed: 0,
        output: 0,
        color: {},
        latency: 0,
        duration: 0,
    }

    if (sequence.length > 0) {
        let qt = sequence[0];
        task.input = qt.size;

        if (qt.size !== -1) {
            sequence.shift();
            task.color = qt.color || getRandomColor();
        }

    } else {
        task.input = Math.floor(rng.random() * 27) + 1;
        task.color = getRandomColor();
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
let swapCounter = 0;
let loaderContainer = document.getElementById("loaders");
let splitterContainer = document.getElementById("splitter");
let averageLatencyElement = document.getElementById("averagelat");
let averageThroughputElement = document.getElementById("averagethr");
let ticksElement = document.getElementById("ticks");

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

    loaders.length = 0;
    latencies = 0;
    throughputs = 0;
    taskCounter = 0;
    tickCounter = 0;
    latencyCounter = 0;
    currentTask = null;

    sequence = [];
    config.sequence.split(",").forEach(s => {
        s = s.trim();
        if (!s) return;
        s = s.split("/");
        sequence.push({
            size: parseInt(s[0]),
            color: stringToRGB(colordict[s[1]])
        });
    });

    let minRequired = Math.ceil(31.5 / config.loaderSpeed);
    for (let i = 0; i < minRequired; i++) {
        createLoader();
    }
}

function getNextLoader() {

    if (config.idealBalancing) {

        let min = loaders[0];
        for (let i = 1; i < loaders.length; i++) {
            if (loaders[i].queued < min.queued) {
                min = loaders[i];
            }
        }

        return min;
    } else {
        if (config.hasLoadBalancing) {
            for (let i = 0; i < loaders.length; i++) {
                if (loaders[i].queued <= 0) {
                    return loaders[i];
                }
            }
        }

        for (let i = 0; i < loaders.length; i++) {
            if (config.hasQueue) {
                let cutoff = ((i <= (loaders.length >> 1)) && config.weightedThresholds) ? 11 : 21;
                if (loaders[i].queued < cutoff) {
                    return loaders[i];
                }
            } else {
                if (loaders[i].queued <= 0) {
                    return loaders[i];
                }
            }
        }
    }

    if (config.hasQueue) {
        return loaders[loaders.length - 1];
    }

    return createLoader();
}

function createLoader() {
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

function createLoaderRenderElements(task) {
    if (task.isRenderingInLoader) throw new Error("bad call")
    task.isRenderingInLoader = true;
    task.loaderElement = document.createElement("div");
    task.loaderElement.classList.add("task");
    task.loaderElement.innerText = task.id;
    task.loaderElement.style.backgroundColor = `rgb(${task.color.r}, ${task.color.g}, ${task.color.b})`;
    task.loader.taskListElement.appendChild(task.loaderElement);
}

function simulateSplitter(shouldUpdateDOM) {
    if (!currentTask || currentTask.input <= 0) {
        if (currentTask) {
            if (currentTask.splitterElement) splitterTasks.removeChild(currentTask.splitterElement);
            currentTask.splitterElement = null;
        }
        currentTask = getNewTask();
        if (currentTask.input < 0) {

            return;
        }
        currentTask.loader = getNextLoader();
        currentTask.loader.taskQueue.push(currentTask);
        swapCounter = 63;
        return;
    }

    if (!currentTask.isRenderingInSplitter && shouldUpdateDOM) {
        currentTask.isRenderingInSplitter = true;
        currentTask.splitterElement = document.createElement("div");
        currentTask.splitterElement.classList.add("task");
        currentTask.splitterElement.innerText = currentTask.id;
        currentTask.splitterElement.style.backgroundColor = `rgb(${currentTask.color.r}, ${currentTask.color.g}, ${currentTask.color.b})`;
        splitterTasks.appendChild(currentTask.splitterElement);
        currentTask.splitterElement.style.width = currentTask.input * widthRatio + "px";
    }

    if (swapCounter <= 0) {
        swapCounter = 63; // kindof useless rn
    } else {
        swapCounter--;
        currentTask.loader.queued++;
        currentTask.input--;
        currentTask.processed++;
        if (shouldUpdateDOM) {
            currentTask.splitterElement.style.width = currentTask.input * widthRatio + "px";

            if (!currentTask.isRenderingInLoader) {
                createLoaderRenderElements(currentTask);
            }
            currentTask.loaderElement.style.width = Math.ceil((currentTask.processed - (currentTask.loader.progress / 64)) * widthRatio) + "px";
        }
    }
}
function tick(shouldUpdateDOM) {

    if (tickCounter % 2 == 0) { // half-speed
        simulateSplitter(shouldUpdateDOM);
    }

    let throughput = 0;

    loaders.forEach(loader => {
        if (loader.queued <= 0) {
            loader.progress = 0;
            if (shouldUpdateDOM) {
                loader.labelElement.innerText = "Loader " + (loader.id + 1) + " (0)";
            }
            return;
        }

        loader.progress += config.loaderSpeed;
        throughput += config.loaderSpeed;

        while (loader.progress >= 64) {
            loader.progress = loader.progress - 64;
            loader.queued--;
            loader.taskQueue[0].processed--;
            loader.taskQueue[0].output++;

            if (loader.taskQueue[0].processed <= 0) {
                if (loader.taskQueue[0].isRenderingInLoader)
                    loader.taskListElement.removeChild(loader.taskQueue[0].loaderElement);
                latencies = (latencies * latencyCounter + loader.taskQueue[0].latency) / (latencyCounter + 1);
                latencyCounter++;
                loader.taskQueue.shift();
            }
        }


        for (let i = 1; i < loader.taskQueue.length; i++) {
            loader.taskQueue[i].latency++;
        }

        if (shouldUpdateDOM) {

            loader.taskQueue.forEach((task) => {
                if (!task.isRenderingInLoader) {
                    createLoaderRenderElements(task);
                    task.loaderElement.style.width = Math.ceil((task.processed - (task.loader.progress / 64)) * widthRatio) + "px";
                }
            })

            loader.labelElement.innerText = "Loader " + (loader.id + 1) + " (" + loader.queued + ")";

            if (loader.taskQueue.length) {
                let task = loader.taskQueue[0];
                task.loaderElement.style.width = Math.ceil((task.processed - (task.loader.progress / 64)) * widthRatio) + "px";
            }
        }
    });

    throughputs = (throughputs * tickCounter + throughput) / (tickCounter + 1);

    if (shouldUpdateDOM) {
        averageLatencyElement.innerText = (latencies / 2.5).toFixed(4) + "s";
        averageThroughputElement.innerText = throughputs.toFixed(4) + "hs";
        ticksElement.innerText = (tickCounter * 8) + " ticks";
    }
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
            delta--;
            tick(delta < 1);
            multiplicity++;

            let now2 = performance.now();
            if (now2 - now >= 40) {
                if (delta >= 1) tick(true);
                delta = 0;
                break;
            }
        }
    }

    requestAnimationFrame(mainLoop);
}
resetSim();
mainLoop();

window.loaders = loaders;
