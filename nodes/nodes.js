/* eslint-env browser */
//@ts-check

//Author: github/kevin-cgc
//Simple 3d->2d point cloud implementation

/*
// if (node.uid == "watch") {
// 	//colorizeVarsLogTag`CamR.x:${camera.rotate.x}\ncnx = ${(cnx * Math.cos(camera.rotate.x)) - (cnz * Math.sin(camera.rotate.x))} = (${cnx * Math.cos(camera.rotate.x)}) - (${cnz * Math.sin(camera.rotate.x)})`;
// 	//debugger;
// }
function colorizeVarsLogTag(strs, ...vars) {
	const str = String.raw({raw: strs.map((i) => `%c${i}%c`)}, ...vars);
	const params = [];
	strs.forEach(() => {
		params.push("color:white");
		params.push("color:cyan");
	});
	console.log(str, ...params);
	return str;
}
*/

/** @typedef {[number, number, number]} Coord3D */
function dtr(d) {
	return d * (Math.PI / 180);
}
function polarToRectangle(dX, dY, radius) {
	var x = Math_sinE0(dtr(dX)) * Math_cosE0(dtr(dY)) * radius;
	var y = Math_sinE0(dtr(dX)) * Math_sinE0(dtr(dY)) * radius;
	var z = Math_cosE0(dtr(dX)) * radius;
	return {
		x: y,
		y: z,
		z: x
	};
}
function Math_sinE0(r) {
	if (r === 0) {
		return Math.sin(0.000001);
	} else {
		return Math.sin(r);
	}
}
function Math_cosE0(r) {
	if (r === 0) {
		return Math.cos(0.000001);
	} else {
		return Math.cos(r);
	}
}
const waitMS = ms => new Promise(res => setTimeout(res, ms));

export const objVertexMapCache = new Map();

export class World {
	constructor(canvas, startTick = true, nodeinfo = document.querySelector(".nodeinfo"), setBGColor=true, defaultRotateXStep = 0.01, doPreRender = ()=>{}) {
		if (setBGColor) canvas.style.backgroundColor = "#000";
		/** @type {CanvasRenderingContext2D} */
		this.canvasctx = canvas.getContext("2d");//, { alpha: false }); #causes the aran glitch effect
		this.canvasctx.canvas.width = window.innerWidth;
		this.canvasctx.canvas.height = window.innerHeight;

		this.nodeinfo = nodeinfo;

		window.onresize = () => {
			this.canvasctx.canvas.width = window.innerWidth;
			this.canvasctx.canvas.height = window.innerHeight;
			this.camera.pos.x = -this.canvasctx.canvas.width/2;
			this.camera.pos.y = -this.canvasctx.canvas.height/2;
		};
		setTimeout(function(){ window.dispatchEvent(new Event("resize")); }, 250);

		/** @type {Node[]} */
		this.nodes = [];
		this.camera = {
			pos: {
				x: -this.canvasctx.canvas.width/2,
				y: -this.canvasctx.canvas.height/2,
				z: -5
			},
			rotate: { //radians
				x: 0, //
				y: 0, //roll
				z: 0
			},
			fov: {
				h: 90,
				v: 60
			},
			zoom: 1
		};
		this.drawLines = false;

		this.defaultRotateXStep = defaultRotateXStep;

        /** @type {Coord3D} */
		this.OFFSCREENCOORDS = [0, 0, 0];

		this.morphState = 0;
		this.morphTick = () => {};

		this.mouseX = 0;
		this.mouseY = 0;
		this.canvasctx.canvas.addEventListener("mousemove", ev => {
			const rect = canvas.getBoundingClientRect();
			this.mouseX = ev.clientX - rect.left;
			this.mouseY = ev.clientY - rect.top;
			if (this.mouseDown) {
				this.camera.rotate.x += (ev.movementX*6)/this.canvasctx.canvas.width;
				this.camera.rotate.y += (ev.movementY*6)/this.canvasctx.canvas.height;
				// this.camera.rotate.z += (ev.movementY*6)/this.canvasctx.canvas.height;
			}
		});

		this.canvasctx.canvas.addEventListener("mousedown", ev => {
			this.mouseDown = true;
		});

		const mouseUp = () => this.mouseDown = false;
		this.canvasctx.canvas.addEventListener("mouseup", mouseUp);
		this.canvasctx.canvas.addEventListener("mouseleave", mouseUp);



		this.doPreRender = doPreRender;
		if (startTick) {
			this.startTick();
		}
	}

	stopTick() {
		this.tick = ()=>{};
	}
	startTick() {
		this.tick = () => {
			this.morphTick();
			if (!this.mouseDown) this.camera.rotate.x = (this.defaultRotateXStep + this.camera.rotate.x) % (Math.PI*2);
			this.doPreRender();
			this.render();
			requestAnimationFrame(this.tick);
		};
		requestAnimationFrame(this.tick);
	}

	render() {
		let prevn = null;
		for (let n of this.nodes) {
			Node.vectorize(n); //rasterize for 2d no perspective(always facing camera) node/dot
			if (
				this.nodeinfo &&
				(this.mouseX-2 < n.vectorized2d.x && n.vectorized2d.x < this.mouseX+2) &&
				(this.mouseY-2 < n.vectorized2d.y && n.vectorized2d.y < this.mouseY+2)
			) {
				this.nodeinfo.textContent = `x: ${n.x}\ny: ${n.y}\nz: ${n.z}`;
				n.highlight = true;
			} else n.highlight = false;
		}
		// this.nodes.sort((n1,n2) => { //sorting does not seem to work
		// 	if (n1.vectorized2d.z>n2.vectorized2d.z) return 1;
		// 	if (n1.vectorized2d.z<n2.vectorized2d.z) return -1;
		// 	return 0;
		// });

		this.canvasctx.clearRect(0, 0, this.canvasctx.canvas.width, this.canvasctx.canvas.height);

		// sort nodes by color (13 -> 17 fps)
		// fill path instead of each rect (17 -> 30 fps)
		const nodesByColor = new Map();
		for (const n of this.nodes) {
			const ncolor = n.getColor();
			const nbca = nodesByColor.get(ncolor) || nodesByColor.set(ncolor, []).get(ncolor);
			nbca.push(n);
		}
		for (const [ncolor, nodes] of nodesByColor) {
			this.canvasctx.beginPath();
			this.canvasctx.strokeStyle = this.canvasctx.fillStyle = ncolor;
			for (let n of nodes) {
				if (this.drawLines) Node.drawLineBetween(prevn, n); //draw line between vectorized2d coords
				Node.addNodeToPath(n); //draw node shape at vectorized2d coord
				prevn = n;
			}
			this.canvasctx.fill();
		}
	}

	createNode(vertex) {
		const n = new Node(this, ...vertex);
		this.nodes.push(n);
		return n;
	}

	createModel(vertices) {
		this.nodes = [];
		for (const vertex of vertices) {
			this.createNode(vertex);
		}
		return;
	}

    /** @return {Coord3D} */
	genMorphRandomSphereCoordinates() {
		const r = polarToRectangle(Math.random()*360, Math.random()*360, Math.min(this.canvasctx.canvas.width, this.canvasctx.canvas.height));
		return [r.x, r.y, r.z];
	}

	genMorphRandomCoordinates() {
		const cs = Math.min(this.canvasctx.canvas.width, this.canvasctx.canvas.height);
		return [
			Math.random()*cs - cs/2,
			Math.random()*cs - cs/2,
			Math.random()*cs - cs/2
		];
	}

    /**
     *
     * @param {Coord3D[]} vertices
     */
	async morphToModel(vertices) {
		const mi = Math.min(this.nodes.length, vertices.length);

		{ //go to sphere
			for (let i=0; i<mi; i++) this.nodes[i].setNextCoordinates(...this.genMorphRandomSphereCoordinates());
			if (this.nodes.length > vertices.length) for (let i=mi; i<this.nodes.length; i++) this.nodes[i].setNextCoordinates(...this.genMorphRandomSphereCoordinates()); //set all extra nodes to go off-screen
			else if (vertices.length > this.nodes.length) for (let i=mi; i<vertices.length; i++) this.createNode(this.genMorphRandomSphereCoordinates()); //create new nodes to come from off-screen

			const tms = 350;
			const ts = Date.now();
			this.morphTick = () => {
				const x = (Date.now() - ts)/tms;
				const y = 2*x - Math.pow(x, 2);
				this.morphState = y;
				this.camera.rotate.x += 0.01;
			};
			await waitMS(tms);
			this.morphTick = () => {};
			for (const node of this.nodes) node.makeNextCurrent();
			this.morphState = 0;
		}

		{ //spin sphere
			const tms = 700;
			const ts = Date.now();
			this.morphTick = () => {
				const x = (Date.now() - ts)/tms;
				const y = x - Math.pow(x, 5);
				// this.camera.rotate.x += y*(Math.PI/16);
				this.camera.rotate.y += y*(Math.PI/4);
			};
			await waitMS(tms);
			this.morphTick = () => {};
			this.camera.rotate.x = 0;
			this.camera.rotate.y = 0;
		}

		{ //randomSphere again
			for (let i=0; i<mi; i++) this.nodes[i].setNextCoordinates(...this.genMorphRandomSphereCoordinates());
			if (this.nodes.length > vertices.length) for (let i=mi; i<this.nodes.length; i++) this.nodes[i].setNextCoordinates(...this.genMorphRandomSphereCoordinates()); //set all extra nodes to go off-screen
			else if (vertices.length > this.nodes.length) for (let i=mi; i<vertices.length; i++) this.createNode(this.genMorphRandomSphereCoordinates()); //create new nodes to come from off-screen

			this.morphState = 0;
			const tms = 350;
			const ts = Date.now();
			this.morphTick = () => {
				const x = (Date.now() - ts)/tms;
				const y = 2*x - Math.pow(x, 2);
				this.morphState = y;
			};
			await waitMS(tms);
			this.morphTick = () => {};
			for (const node of this.nodes) node.makeNextCurrent();
			this.morphState = 0;
		}

		{ //final
			for (let i=0; i<mi; i++) this.nodes[i].setNextCoordinates(...vertices[i]);
			if (this.nodes.length > vertices.length) for (let i=mi; i<this.nodes.length; i++) this.nodes[i].setNextCoordinates(...this.OFFSCREENCOORDS); //set all extra nodes to go off-screen
			else if (vertices.length > this.nodes.length) for (let i=mi; i<vertices.length; i++) this.createNode(this.OFFSCREENCOORDS).setNextCoordinates(...vertices[i]); //create new nodes to come from off-screen

			const tms = 300;
			const ts = Date.now();
			this.morphTick = () => {
				const x = (Date.now() - ts)/tms;
				const y = 2*x - Math.pow(x, 2);
				this.morphState = y;
			};
			await waitMS(tms);
			this.morphTick = () => {};
			for (const node of this.nodes) node.makeNextCurrent();
			this.morphState = 0;
		}

	}

	async scan(a) {
		const tms = 800;
		const ts = Date.now();
		this.morphState = 1;
		// https://math.stackexchange.com/a/2378405/769817
		this.morphTick = () => {
			const timex = (Date.now() - ts)/tms;
			const timey = 2*timex - Math.pow(timex, 2);
			for (const n of this.nodes) {
				const nodex = n.z/this.canvasctx.canvas.width + 0.5;
				const a = 0.015;
				const ymod = -50 * (
					Math.pow(20, -Math.pow((nodex+0.1-(1.2*timey))/a, 2))
				);
				n.setNextCoordinates(n.x, n.y+ymod, n.z);
				if (ymod < -30) n.color = "#0f0";
				else n.color = "#fff";
			}
		};
		await waitMS(tms);
		this.morphTick = () => {};
		for (const n of this.nodes) { n.color = "#fff"; }
		this.morphState = 0;
    }

	async loadVerticies(objFileURL, scale, xyzadjust = { x:0, y:0, z:0 }) {
		const objuid = objFileURL+scale+xyzadjust.x+xyzadjust.y+xyzadjust.z;
		if (objVertexMapCache.has(objuid)) return objVertexMapCache.get(objuid);
		const obj = await loadOBJFile(objFileURL);
		const vertices = getVerticesFromOBJ(obj).map(vertex => {
			return [
				(parseFloat(vertex[0]) + xyzadjust.x) * scale,
				(parseFloat(vertex[1]) + xyzadjust.y) * scale,
				(parseFloat(vertex[2]) + xyzadjust.z) * scale
			];
		});
		objVertexMapCache.set(objuid, vertices);
		return vertices;
	}

	async loadObjFromFile(objFileURL, scale, xyzadjust) {
		const vertices = await this.loadVerticies(objFileURL, scale, xyzadjust);
		this.createModel(vertices);
		return;
	}
	async loadObjFromFileAndMorph(objFileURL, scale, xyzadjust) {
		const vertices = await this.loadVerticies(objFileURL, scale, xyzadjust);
		await this.morphToModel(vertices);
		return;
	}
}

export class Node {
	constructor(world, x,y,z, color) {
		this.world = world;
		this.color = color || "#fff"; //"#"+Math.floor(Math.random()*0xFFFFFF).toString(16).padStart(6, "0"); //"#fff";
		this.highLightColor = "#f00";
		this.highlight = false;
		this.x = x || 0.00;
		this.y = y || 0.00;
		this.z = z || 0.00;
		this.perspective3d = {
			x: 0.00,
			y: 0.00,
			z: 0.00
		};
		this.vectorized2d = {
			x: 0.00,
			y: 0.00,
			// z: 0.00
		};
		this.next = {
			x: 0.00,
			y: 0.00,
			z: 0.00
		};
	}

	setNextCoordinates(x,y,z) { //set next coordinates for morph
		this.next.x = x || 0.00;
		this.next.y = y || 0.00;
		this.next.z = z || 0.00;
	}

	makeNextCurrent() {
		this.x = this.next.x;
		this.y = this.next.y;
		this.z = this.next.z;
	}

	getColor() {
		return this.highlight ? this.highLightColor : this.color;
	}

	static get SIZE() {
		return 1;
	}
	static get POLYGON() { //do these need to be better centered on coordinate?
		/* eslint-disable no-unreachable */
		//triangleish
		return [
			[10, 0],
			[-5, -5],
			[-5, 5]
		];
		//squareish
		return [
			[0, 10],
			[10, 0],
			[0, -10],
			[-10, 0]
		];
		//hexagonish
		return [
			[0,		10],
			[-1,	0],
			[-5,	-3],
			[0,		-5],
			[5,		-3],
			[2,		0],
			[5,		3],
			[0,		5],
			[-5,	3],
			[-1,	0]
		];

		/* eslint-enable no-unreachable */
	}

	//move to non static funcs?
	/**
	 *
	 * @param {Node} node
	 */
	static addNodeToPath(node) {
		let cx = node.vectorized2d.x;
		let cy = node.vectorized2d.y;

		// node.world.canvasctx.strokeStyle = node.world.canvasctx.fillStyle = node.highlight?node.highLightColor:node.color; //done in World.render
		node.world.canvasctx.rect(cx-Node.SIZE,cy-Node.SIZE, Node.SIZE,Node.SIZE); //fill is in World.render
	}

	/**
	 *
	 * @param {Node} node
	 */
	static vectorize(node) {
		//init
		let cnx = node.x * (1-node.world.morphState) + node.next.x * (node.world.morphState); //linear morph between two 3d coordinates
		let cny = node.y * (1-node.world.morphState) + node.next.y * (node.world.morphState); //^
		let cnz = node.z * (1-node.world.morphState) + node.next.z * (node.world.morphState); //^

		let cnxn, cnyn, cnzn;


		//rotate z/y plane (pitch)
		//cnx = cnx
		cnyn = ((cnz * Math.sin(node.world.camera.rotate.z)) + cny * Math.cos(node.world.camera.rotate.z));
		cnzn = ((cnz * Math.cos(node.world.camera.rotate.z)) - cny * Math.sin(node.world.camera.rotate.z));
		//cnx = cnxn;
		cny = cnyn;
		cnz = cnzn;

		//rotate x/z plane (yaw)
		cnxn = ((cnx * Math.cos(node.world.camera.rotate.x)) - cnz * Math.sin(node.world.camera.rotate.x));
		//cny = cny;
		cnzn = ((cnx * Math.sin(node.world.camera.rotate.x)) + cnz * Math.cos(node.world.camera.rotate.x));
		cnx = cnxn;
		//cny = cnyn;
		cnz = cnzn;

		//rotate y/x plane (roll)
		cnxn = ((cny * Math.sin(node.world.camera.rotate.y)) + cnx * Math.cos(node.world.camera.rotate.y));
		cnyn = ((cny * Math.cos(node.world.camera.rotate.y)) - cnx * Math.sin(node.world.camera.rotate.y));
		//cnz = cnz
		cnx = cnxn;
		cny = cnyn;
		//cnz = cnzn;

		//zoom
		cnx *= node.world.camera.zoom;
		cny *= node.world.camera.zoom;
		cnz *= node.world.camera.zoom;

		//move/pan
		cnx -= node.world.camera.pos.x;
		cny -= node.world.camera.pos.y;
		cnz -= node.world.camera.pos.z;

		node.perspective3d.x = cnx;
		node.perspective3d.y = cny;
		node.perspective3d.z = cnz;


		node.vectorized2d.x = cnx;
		node.vectorized2d.y = cny;
		// node.vectorized2d.z = cnz;
	}

	/**
	 *
	 * @param {Node} pn
	 * @param {Node} cn
	 */
	static drawLineBetween(pn, cn) {
		if (pn && cn) {
			pn.world.canvasctx.beginPath();
			pn.world.canvasctx.moveTo(pn.vectorized2d.x, pn.vectorized2d.y);
			pn.world.canvasctx.lineTo(cn.vectorized2d.x, cn.vectorized2d.y);
			pn.world.canvasctx.stroke();
			pn.world.canvasctx.closePath();
		}
	}
}


export async function loadOBJFile(objFileURL) {
	const resp = await fetch(objFileURL);
	const reader = resp.body.getReader();
	const lines = [[""]];
	while(true) { // eslint-disable-line no-constant-condition
		const {value, done} = await reader.read();
		if (done) break;
		for (const byte of value) {
			const char = String.fromCharCode(byte); //this code runs every byte of the stream and splits data on newlines
			if (char === "\n") {
				lines.push([""]);
				continue;
			}
			const line = lines[lines.length-1];
			if (char === " " && line[line.length-1] !== "") {
				line.push("");
				continue;
			}
			line[line.length-1] += char;
		}
	}
	return lines;
}
export function getVerticesFromOBJ(obj) { //It is a one time, so dont worry about overhead
	const vertices = obj.filter(line => line[0] === "v");
	vertices.forEach(vline => vline.shift());
	return vertices;
}
