import * as fs from "fs/promises";

const fileName = import.meta.url.match(/\/([^\/]+?)\.js$/)[1];
const input = fs.readFile(`./input/${fileName}.txt`, "utf-8");

input
    .then(input => { console.log(solution(input)) })
    .catch(error => { console.error(`Error occured\n${error}`); });

const solution = (input) => {
    console.time(1);

    const graph = parseInput(input);
    const distanceMap = transformDistanceMap(graph, FWPath(graph));
    const clearGraph = parseGraph(graph, distanceMap, "AA");
    // const result = findBestPath(clearGraph, 30, "START");
    // const result = findBestPath(testGraph, 100, "START");

    const result = findBestPathDuo(clearGraph, 26);
    // const result = findBestPathDuoV2(testGraph, 100);

    console.timeEnd(1);
    return result
}

const parseInput = input => {
    const output = {};
    input.split(/\n+/).forEach(line => {
        const data = line.match(/(?:(?<=Valve )\w+)|\d+|(?:(?<=valves? ).+)/g);
        output[data[0]] = {
            value: parseInt(data[1]),
            refs: data[2].split(", ")
        }
    });

    return output;
}

const FWPath = graph => {
    const nodeList = Object.keys(graph);
    const distanceMap = {};
    nodeList.forEach(node => {
        distanceMap[node] = { [node]: 0 };
        graph[node].refs.forEach(ref => {
            distanceMap[node][ref] = 1;
        })
    })

    nodeList.forEach(k => {
        nodeList.forEach(i => {
            nodeList.forEach(j => {
                const newDistance = getFWDistance(distanceMap, i, k) + getFWDistance(distanceMap, k, j);
                if (getFWDistance(distanceMap, i, j) > newDistance)
                    distanceMap[i][j] = newDistance
            })
        })
    })
    return distanceMap;
}

const getFWDistance = (distanceMap, start, end) => distanceMap[start]?.[end] != undefined ? distanceMap[start][end] : Infinity

const transformDistanceMap = (graph, distanceMap) => {
    const nodeList = Object.keys(graph);
    const filteredMap = {};
    nodeList.forEach(start => {
        filteredMap[start] = {};
        Object.keys(distanceMap[start]).forEach(end => {
            if (graph[end]?.value && start != end) filteredMap[start][end] = distanceMap[start][end] + 1
        })
    })
    return filteredMap;
}

const parseGraph = (graph, distanceMap, start) => {
    const newGraph = graph[start].value
        ? {
            [start]: { value: graph[start].value, refs: distanceMap[start] },
            "START": { value: 0, refs: { ...distanceMap[start], [start]: 1 } },
        }
        : {
            "START": { value: 0, refs: distanceMap[start] },
        };
    const nodeList = Object.keys(distanceMap[start]);
    nodeList.forEach(node => {
        if (graph[node].value || node == start)
            newGraph[node] = {
                value: graph[node].value,
                refs: distanceMap[node]
            }
    })
    return newGraph;
}

const optimizeGraph = (graph, limit) => {
    const nodeList = Object.keys(graph).sort((a) => a == 'START' ? -1 : 1);
    const nodeMap = {};
    nodeList.forEach((node, i) => { nodeMap[node] = i });

    const newGraph = nodeList.map(node => {
        const timer = limit - (graph['START'].refs[node] || 0);
        const refList = Object.keys(graph[node].refs)
            .sort((a, b) => {
                const timerA = timer - graph[node].refs[a];
                const timerB = timer - graph[node].refs[b];
                return timerB * graph[b].value - timerA * graph[a].value;
            });
        const refPriority = refList.map(ref => nodeMap[ref]);
        const refDistance = {};
        refList.forEach(ref =>
            refDistance[nodeMap[ref]] = graph[node].refs[ref]
        );
        const refBitmap = refList.reduce((bitmap, ref) => {
            bitmap = bitmap ^ (1 << nodeMap[ref]);
            return bitmap
        }, 0)
        return {
            value: graph[node].value,
            refDistance,
            refBitmap,
            refPriority,
        }
    });

    return newGraph
}

const findBestPath = (graph, limit) => {
    const newGraph = optimizeGraph(graph, limit);
    return findBestPathStep(newGraph, limit, 0, 1, 0);
}

const findBestPathStep = (graph, limit, start, visitedBitmap, currentMax) => {

    const maxPossibleSum = graph.reduce((sum, node, nodeKey) => {
        if (visitedBitmap & (1 << nodeKey)) return sum;
        const timer = limit - graph[start].refDistance[nodeKey];
        const pressure = timer > 0 ? timer * node.value : 0;
        return sum + pressure;
    }, 0);
    if (maxPossibleSum <= currentMax) return 0;

    if (!(~visitedBitmap & graph[start].refBitmap)) return maxPossibleSum;

    return graph[start].refPriority.reduce((max, refNodeKey) => {
        const nodeBitmap = 1 << refNodeKey;
        if (visitedBitmap & nodeBitmap) return max;
        const timer = limit - graph[start].refDistance[refNodeKey];
        if (timer <= 0) return max;
        const newVisited = visitedBitmap | nodeBitmap;
        const pressure = timer * graph[refNodeKey].value;
        return Math.max(max, pressure +
            ((timer > 2)
                ? findBestPathStep(graph, timer, refNodeKey, newVisited, max - pressure)
                : 0));
    }, 0)
}

const findBestPathDuo = (graph, limit) => {
    graph = optimizeGraph(graph, limit);
    const startState = { start: [0, 0], limit: [limit, limit], visitedBitmap: 1 };
    const consideredStates = new priorityQueue([startState]
        , (a, b) => getScore(totalScore, a) - getScore(totalScore, b));
    const interimScore = { [getId(startState)]: 0 };
    const totalScore = { [getId(startState)]: estimate(graph, startState) };

    let max = 0;
    while (consideredStates.getElements().length != 0) {
        const current = consideredStates.popHead();
        const { start, limit, visitedBitmap } = current;
        const nodeKey = start[0];
        const timer = limit[0];
        if ((timer <= 2) || !(~visitedBitmap & graph[nodeKey].refBitmap)) continue;
        graph[nodeKey].refPriority.forEach(neighbour => {
            const neighbourBitmap = 1 << neighbour;
            if (visitedBitmap & neighbourBitmap) return null;
            const neighbourLimit = (timer - graph[nodeKey].refDistance[neighbour]);
            if (neighbourLimit <= 0) return null;
            const neighbourState = { visitedBitmap: visitedBitmap | neighbourBitmap };
            neighbourState.start = [start[1], neighbour];
            neighbourState.limit = [limit[1], neighbourLimit];
            const neighbourID = getId(neighbourState);
            if (interimScore[neighbourID] != undefined) return null;

            const neighbourPressure = neighbourLimit * graph[neighbour].value;
            const currentScore = getScore(interimScore, current) + neighbourPressure;

            if (currentScore > getScore(interimScore, neighbourState)) {
                max = Math.max(max, currentScore);
                interimScore[neighbourID] = currentScore;
                totalScore[neighbourID] = currentScore + estimate(graph, neighbourState);
                if (totalScore[neighbourID] > max) {
                    consideredStates.addValue(neighbourState);
                }
            }
        })
    }

    return max;
}

const getScore = (scoreMap, state) => {
    const log = scoreMap[getId(state)];
    return log ? log : 0
}

const getId = (state) => `${state.start},${[state.limit]},${state.visitedBitmap}`;

const estimate = (graph, state) => {
    const { limit, start, visitedBitmap } = state;
    return graph.reduce((sum, node, nodeKey) => {
        if (visitedBitmap & (1 << nodeKey)) return sum;
        const timer = limit.map((_, i) => limit[i] - graph[start[i]].refDistance[nodeKey]);
        const pressure = timer.map((time) => time > 0 ? time * node.value : 0);
        return sum + Math.max(...pressure);
    }, 0)
};

class priorityQueue {
    constructor(data, compareFunc) {
        this.compareFunc = (a, b) => compareFunc(a, b);
        this.queue = this.#createQueue(data);
    }
    #createQueue = (data) => {
        const queue = [...data].sort(this.compareFunc);
        return queue
    }
    popHead = () => this.queue.pop();
    getHead = () => this.queue[this.queue.length - 1];
    getNthElement = (n) => this.queue[n];
    getElements = () => this.queue;
    addValue = (value) => {
        let l = 0, r = this.queue.length - 1;
        let insertPoint = r + 1;

        while (l <= r) {
            const m = Math.floor((l + r) / 2);
            const compareResult = this.compareFunc(this.getNthElement(m), value);
            switch (true) {
                case compareResult < 0: l = m + 1; break;
                case compareResult > 0: r = m - 1; insertPoint = r + 1; break;
                case compareResult == 0:
                    l = r + 1;
                    insertPoint = m + 1;
            }
        }

        this.queue.splice(insertPoint, 0, value);
        return this
    }
}

const testGraph = {
    "START": { value: 0, refs: { "A": 99, "B": 1, "C": 2 } },
    "A": { value: 10000, refs: { "B": 100, "C": 101 } },
    "B": { value: 10, refs: { "A": 100, "C": 1 } },
    "C": { value: 10, refs: { "A": 101, "B": 1, } },
}