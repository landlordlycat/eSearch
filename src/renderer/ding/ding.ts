const { ipcRenderer, clipboard, nativeImage } =
    require("electron") as typeof import("electron");
const fs = require("node:fs") as typeof import("fs");
const path = require("node:path") as typeof import("path");
import { getImgUrl, initStyle, setTitle } from "../root/root";
import store from "../../../lib/store/renderStore";
import xtranslator from "xtranslator";
import {
    addClass,
    button,
    ele,
    elFromId,
    type ElType,
    image,
    pureStyle,
    spacer,
    trackPoint,
    txt,
    view,
} from "dkh-ui";
initStyle(store);
pureStyle();

import { lan, t } from "../../../lib/translate/translate";

lan(store.get("语言.语言"));

setTitle(t("贴图"));

let lo: import("esearch-ocr").initType;
let translateE = async (input: string[]) => input;

// @auto-path:../assets/icons/$.svg
function iconEl(src: string) {
    return image(getImgUrl(`${src}.svg`), "icon").class("icon");
}

ipcRenderer.on("ding", (_event, type, id, more) => {
    console.log(type, id, more);
    switch (type) {
        case "close":
            close2(id);
            break;
        case "move_start":
            mouseStart(more);
            break;
        case "move_end":
            mouseEnd();
            break;
        case "back":
            back2(id);
            break;
        case "resize":
            if (!resizeSender)
                resize(more.id, more.zoom, more.dx, more.dy, more.clip);
            break;
    }
});

function sendEvent(
    type: "close" | "move_start" | "move_end" | "back" | "resize",
    id: string | null,
    more?: unknown,
) {
    ipcRenderer.send("ding_event", type, id, more);
}

const dives: ElType<HTMLElement>[] = [];

let changing: { x: number; y: number } | null = null;
const dingData: Map<
    string,
    {
        rect: [number, number, number, number];
        url: string;
        translation: string;
        isTranslate: boolean;
    }
> = new Map();
let elMap: ReturnType<typeof setNewDing>[] = [];
const setNewDing = (
    wid: string,
    x: number,
    y: number,
    w: number,
    h: number,
    url: string,
    type: "translate" | "ding",
) => {
    dingData.set(wid, {
        rect: [x, y, w, h],
        url,
        translation: "",
        isTranslate: false,
    });
    const div = view().attr({ id: wid, tabIndex: 0 }).class("ding_photo");
    dives.push(div);
    if (store.get("贴图.窗口.提示")) div.class("ding_photo_h");
    div.style({
        left: `${x}px`,
        top: `${y}px`,
        width: `${w}px`,
        height: `${h}px`,
    });
    const img = image(url, "").attr({ draggable: false });
    const imageP = view()
        .class("img")
        .add(img)
        .class(
            addClass(
                { position: "relative", transition: "var(--transition)" },
                { "&>*": { width: "100%", top: 0, left: 0 } },
            ),
        );
    const toolBar = view().attr({ id: "tool_bar" });
    const toolBarC = view("x")
        .attr({ id: "tool_bar_c" })
        .style({ padding: "4px", gap: "4px", boxSizing: "border-box" })
        .class("bar")
        .bindSet((v: { forceShow?: boolean; show?: boolean }, el) => {
            if (v.forceShow !== undefined)
                el.setAttribute("data-force-show", String(v.forceShow));
            if (v.show !== undefined)
                el.setAttribute("data-show", String(v.show));
            if (el.getAttribute("data-force-show") === "true") {
                el.style.transform = "translateY(0)";
            } else {
                el.style.transform =
                    el.getAttribute("data-show") === "true"
                        ? "translateY(0)"
                        : "translateY(-105%)";
            }
        });
    toolBar.add(toolBarC);
    // 顶栏
    div.el.onmouseenter = () => {
        toolBarC.sv({ show: true });
    };
    div.el.onmouseleave = () => {
        toolBarC.sv({ show: false });
    };

    const concorlClass = addClass(
        {
            cursor: "ew-resize",
        },
        {
            "& .icon": {
                width: "32px",
                position: "initial",
            },
        },
    );

    // 透明
    const opacityEl = txt()
        .bindSet((v: string, el) => {
            el.innerText = `${v}%`;
            img.el.style.opacity = `${Number(v) / 100}`;
        })
        .sv("100");
    const opacityElP = view("x")
        .class(concorlClass)
        .add([iconEl("opacity"), opacityEl]);

    trackPoint(opacityElP, {
        start: () => {
            toolBarC.sv({ forceShow: true });
            return { x: 0, y: 0, data: Number.parseInt(opacityEl.gv) };
        },
        ing: (p, _e, { startData }) => {
            const d = Math.round(p.x / 2);
            const newOp = Math.max(0, Math.min(100, startData + d));
            opacityEl.sv(newOp.toString());
        },
        end: () => {
            toolBarC.sv({ forceShow: false });
        },
    });

    toolBarC.add(opacityElP);
    // 大小
    const sizeInput = txt()
        .bindSet((v: string, el) => {
            el.innerText = `${v}%`;
        })
        .bindGet((el) => {
            return Number.parseInt(el.innerText);
        })
        .sv("100");
    const sizeEl = view("x")
        .class(concorlClass)
        .add([iconEl("size"), sizeInput]);

    trackPoint(sizeEl, {
        start: () => {
            toolBarC.sv({ forceShow: true });
            return { x: 0, y: 0, data: sizeInput.gv };
        },
        ing: (p, _e, { startData }) => {
            const d = Math.round(p.x / 2);
            const newS = Math.max(0, startData + d);
            sizeInput.sv(newS.toString());
            sizeChange();
        },
        end: () => {
            toolBarC.sv({ forceShow: false });
        },
    });

    function sizeChange() {
        if (Number.isFinite(Number(sizeInput.gv))) {
            let zoom = Number(sizeInput.gv) / 100;
            if (zoom < 0.05) zoom = 0.05;
            resizeSender = true;
            resize(wid, zoom, 0, 0);
            resizeSender = false;
        }
    }

    toolBarC.add(sizeEl);

    // 滚轮缩放
    div.el.onwheel = (e) => {
        if (e.deltaY !== 0) {
            let zoom = Number(sizeInput.gv) / 100;
            const zz = 1 + Math.abs(e.deltaY) / 300;
            zoom = e.deltaY > 0 ? zoom / zz : zoom * zz;
            if (zoom < 0.05) zoom = 0.05;
            resizeSender = true;
            const d = dxdy(e, e.ctrlKey ? imageP : div);
            resize(wid, zoom, d.dx, d.dy, e.ctrlKey);
            resizeSender = false;
        }
    };

    const transB = button(iconEl("translate"))
        .style({ display: "none" })
        .on("click", () => {
            const d = dingData.get(wid);
            if (d) {
                const t = d.isTranslate;
                d.isTranslate = !t;
                if (t) {
                    div.query("canvas")?.style({ display: "none" });
                } else {
                    div.query("canvas")?.style({ display: "" });
                }
            }
        });
    // 工具栏
    toolBarC.add([
        spacer(),
        view()
            .attr({ id: "b" })
            .add([
                transB,
                button(iconEl("free_draw")).on("click", () => {
                    edit(wid);
                }),
                button(iconEl("save")).on("click", () => {
                    save(wid);
                }),
                button(iconEl("copy")).on("click", () => {
                    copy(wid);
                }),
                button(iconEl("minimize")).on("click", () => {
                    minimize(div.el);
                }),
                button(iconEl("back")).on("click", () => {
                    back(wid);
                }),
                button(iconEl("close")).on("click", () => {
                    close(wid);
                }),
            ]),
    ]);
    // 双击行为
    div.el.ondblclick = () => {
        if (store.get("贴图.窗口.双击") === "归位") back(wid);
        else close(wid);
    };
    // 放到前面
    div.el.onclick = () => {
        div.el.style.zIndex = String(toppest + 1);
        dockEl.el.style.zIndex = String(toppest + 2);
        toppest += 1;
    };
    // 快捷键
    div.on("keydown", (e) => {
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        if (e.key === "Escape") {
            close(wid);
        }
        if (!Number.isNaN(Number(e.key))) {
            transform(wid, Number(e.key) - 1);
        }
    });
    div.add(toolBar).add(imageP);
    photoEl.add(div);

    // dock
    dockI();

    resize(wid, 1, 0, 0);

    if (type === "translate") {
        const transE = store.get("翻译.翻译器");

        if (transE.length > 0) {
            const x = transE[0];
            // @ts-ignore
            xtranslator.e[x.type].setKeys(x.keys);
            const lan = store.get("屏幕翻译.语言");
            translateE = (input: string[]) =>
                // @ts-ignore
                xtranslator.e[x.type].run(input, lan.from, lan.to);
        }
        initOCR().then(async () => {
            const p = await ocr(url);
            transAndDraw(div, p);
        });
        transB.style({ display: "" });
    }

    return {
        opacity: (v: string) => opacityEl.sv(v),
        size: (v: string) => sizeInput.sv(v),
        id: wid,
    };
};

async function initOCR() {
    const l = store.get("离线OCR").find((i) => i[0] === "默认") as [
        // todo 自定义
        string,
        string,
        string,
        string,
    ];
    function ocrPath(p: string) {
        return path.join(
            path.isAbsolute(p) ? "" : path.join(__dirname, "../../ocr/ppocr"),
            p,
        );
    }
    const detp = ocrPath(l[1]);
    const recp = ocrPath(l[2]);
    const 字典 = ocrPath(l[3]);
    if (!lo) {
        const localOCR = require("esearch-ocr") as typeof import("esearch-ocr");
        const ort = require("onnxruntime-node");
        const provider = store.get("AI.运行后端") || "cpu";
        lo = await localOCR.init({
            detPath: detp,
            recPath: recp,
            dic: fs.readFileSync(字典).toString(),
            detRatio: 0.75,
            ort,
            ortOption: { executionProviders: [{ name: provider }] },
        });
    }
}

ipcRenderer.on("mouse", (_e, x, y) => {
    const els = document.elementsFromPoint(x, y);
    let ignorex = false;
    for (const el of ignoreEl) {
        if (els.includes(el)) {
            ignorex = true;
            break;
        }
    }
    if (els[0] === photoEl.el || ignorex) {
        ipcRenderer.send("ding_ignore", true);
    } else {
        ipcRenderer.send("ding_ignore", false);
    }

    mouseMove(els[0] as HTMLElement, x, y);
});

function minimize(el: HTMLElement) {
    el.style.transition = "var(--transition)";
    setTimeout(() => {
        el.style.transition = "";
    }, 400);
    el.classList.add("minimize");
}
let ignoreEl: HTMLElement[] = [];
function ignore(id: string, v: boolean) {
    const el = elFromId(id)?.el;
    if (!el) return;
    if (v) {
        ignoreEl.push(el);
    } else {
        ignoreEl = ignoreEl.filter((e) => e !== el);
    }
}
const tranStyle = document.createElement("style");
for (const [i, t] of store.get("贴图.窗口.变换").entries()) {
    tranStyle.innerHTML += `.tran${i}{${t}}`;
}
document.body.appendChild(tranStyle);
/**
 * 窗口变换
 */
function transform(id: string, i: number) {
    const c = `tran${i}`;
    const img = elFromId(id)?.query(".img")?.el;
    if (!img) return;
    if (i >= 0 && i < store.get("贴图.窗口.变换").length) {
        img.classList.toggle(c);
    }
    const l = Array.from(img.classList.values());
    for (const t of l) {
        if (t.startsWith("tran") && t !== c) {
            img.classList.remove(t);
        }
    }
}
function back(id: string) {
    sendEvent("back", id);
}
function back2(id: string) {
    const el = elFromId(id);
    if (!el) return;
    const pS = dingData.get(id)?.rect;
    if (!pS) return;
    el.el.style.transition = "var(--transition)";
    setTimeout(() => {
        el.el.style.transition = "";
        resizeSender = true;
        resize(id, 1, 0, 0);
        resizeSender = false;
    }, 400);
    el.style({
        left: `${pS[0]}px`,
        top: `${pS[1]}px`,
        width: `${pS[2]}px`,
        height: `${pS[3]}px`,
    });
    el.query(".img")?.style({
        left: "0",
        top: "0",
        width: "100%",
        height: "",
    });
    ipcRenderer.send("ding_p_s", el.el.id, pS);

    const x = elMap.find((e) => e.id === id);
    if (!x) return;
    x.opacity("100");
}
function close(id: string) {
    ipcRenderer.send("ding_event", "close", id, dingData.size === 1);
}
function close2(id: string) {
    elFromId(id)?.remove();
    dingData.delete(id);
    elMap = elMap.filter((e) => e.id !== id);
    dockI();
}
function getUrl(id: string) {
    const data = dingData.get(id);
    if (!data) return "";
    const _isTranslate = data.isTranslate;
    return _isTranslate ? data.translation : data.url;
}
function copy(id: string) {
    clipboard.writeImage(nativeImage.createFromDataURL(getUrl(id)));
}
function save(id: string) {
    const b = Buffer.from(
        getUrl(id).replace(/^data:image\/\w+;base64,/, ""),
        "base64",
    );
    const save = ipcRenderer.sendSync("get_save_file_path", "png");
    if (!save) return;
    fs.writeFileSync(save, b);
    ipcRenderer.send("ok_save", save);
}
function edit(id: string) {
    const b = Buffer.from(
        getUrl(id).replace(/^data:image\/\w+;base64,/, ""),
        "base64",
    );
    ipcRenderer.send("ding_edit", b);
}

async function ocr(img: string) {
    const p = await lo.ocr(img);
    return p.columns.flatMap((c) => c.parragraphs);
}

async function transAndDraw(
    el: ElType<HTMLElement>,
    p: Awaited<ReturnType<typeof ocr>>,
) {
    const data = dingData.get(el.el.id);
    if (!data) return;
    const canvas = ele("canvas")
        .attr({
            width: data.rect[2],
            height: data.rect[3],
        })
        .style({ position: "absolute", pointerEvents: "none" })
        // @ts-ignore
        .addInto(el.query(".img")).el;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    // @ts-ignore
    ctx.drawImage(el.query(".img > img").el, 0, 0);
    console.log(p);
    const tr = await translateE(p.map((i) => i.parse.text));
    console.log(tr);

    for (const [i, t] of tr.entries()) {
        const x = p[i];
        drawText(t, ctx, x.parse.box, x.src);
    }
    // todo 多屏
    data.translation = canvas.toDataURL("image/png", 1);
    data.isTranslate = true;
}

function drawText(
    text: string,
    ctx: CanvasRenderingContext2D,
    box: Awaited<ReturnType<typeof ocr>>[0]["parse"]["box"],
    boxSrc: Awaited<ReturnType<typeof ocr>>[0]["src"],
) {
    const textList = Array.from(seg.segment(text));

    const firstline = boxSrc[0].box;
    const lineHeight = firstline[2][1] - firstline[0][1];
    const lineNum = boxSrc.length;
    let fontSize = lineHeight;
    ctx.font = `${fontSize}px serif`;
    const textWidth = ctx.measureText(text).width;
    const boxWidth = box[2][0] - box[0][0];
    const oneLineWidth = boxWidth * lineNum;
    if (textWidth > oneLineWidth) {
        fontSize = Math.floor((fontSize * oneLineWidth) / textWidth);
        ctx.font = `${fontSize}px serif`;
    }

    const gap =
        lineNum === 1
            ? 0
            : (box[2][1] - box[0][1] - lineHeight * lineNum) / (lineNum - 1);
    const lines = splitText(textList, ctx, boxWidth); // todo 严格等于lineNum

    for (const b of boxSrc) {
        ctx.fillStyle = color2rgb(b.style.bg);
        ctx.fillRect(
            b.box[0][0],
            b.box[0][1],
            b.box[2][0] - b.box[0][0],
            b.box[2][1] - b.box[0][1],
        );
    }

    const x = box[0][0];
    ctx.textBaseline = "top";
    ctx.fillStyle = color2rgb(boxSrc[0].style.text);
    for (const [i, line] of lines.entries()) {
        const y = box[0][1] + i * lineHeight + i * gap;
        ctx.fillText(line, x, y, boxWidth);
    }
}

function color2rgb(color: number[]) {
    return `rgb(${color.join(",")})`;
}

function splitText(
    text: Intl.SegmentData[],
    ctx: CanvasRenderingContext2D,
    maxWidth: number,
) {
    // todo 性能
    // todo 符号不能在开头
    let line = "";
    const lines: string[] = [];
    for (let i = 0; i < text.length; i++) {
        const t = text[i].segment;
        if (ctx.measureText(line + t).width < maxWidth) {
            line += t;
        } else {
            lines.push(line);
            line = t;
        }
    }
    if (line) {
        lines.push(line);
    }

    return lines.map((l) => l.trimEnd());
}

// 最高窗口
let toppest = 1;
let oPs: number[];
let windowDiv: ElType<HTMLElement> | null = null; // todo 使用id代替

let resizeSender = false;

type start = {
    id: string;
    x: number;
    y: number;
    dx: number;
    dy: number;
    d: Dire;
};

type Resize = {
    id: string;
    zoom: number;
    dx: number;
    dy: number;
    clip: boolean;
};

document.onmousedown = (e) => {
    const el = e.target as HTMLElement;
    const div = dives.find((d) => d.el.contains(el));
    if (div && (el.id === "tool_bar_c" || el.tagName === "IMG")) {
        const { dx, dy } = dxdy(e, div);
        sendEvent("move_start", null, {
            id: div.el.id,
            x: e.clientX,
            y: e.clientY,
            dx,
            dy,
            d: dire(div.el, { x: e.clientX, y: e.clientY }),
        } as start);
    }
    resizeSender = true;
};
function mouseStart(op: start) {
    windowDiv = elFromId(op.id);
    const div = windowDiv as ElType<HTMLElement>;
    div.style({
        left: `${op.x - div.el.offsetWidth * op.dx}px`,
        top: `${op.y - div.el.offsetHeight * op.dy}px`,
    });
    oPs = [
        div.el.offsetLeft,
        div.el.offsetTop,
        div.el.offsetWidth,
        div.el.offsetHeight,
    ];
    changing = { x: op.x, y: op.y };
    direction = op.d;
    cursor(direction);
}
function mouseMove(el: HTMLElement, x: number, y: number) {
    if (direction) {
        if (windowDiv) move(windowDiv, { x, y });
    } else {
        const div = dives.find((d) => d.el.contains(el));
        if (div) {
            const d = dire(div.el, { x, y });
            cursor(d);
        } else {
            cursor("");
        }
    }
}
document.onmouseup = (_e) => {
    sendEvent("move_end", null);
    resizeSender = false;
};
function mouseEnd() {
    oPs = [];
    changing = null;
    windowDiv = null;
    direction = "";
    cursor(direction);
}

type Dire =
    | "move"
    | "西北"
    | "东南"
    | "东北"
    | "西南"
    | "西"
    | "东"
    | "北"
    | "南"
    | "";

let direction: Dire = "";

function dire(el: HTMLElement, p: { x: number; y: number }) {
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const pX = p.x - el.offsetLeft;
    const pY = p.y - el.offsetTop;
    let direction: Dire = "";

    const num = 8;

    function w() {
        return 0 <= pX && pX <= num;
    }

    function e() {
        return width - num <= pX && pX <= width;
    }

    function n() {
        return 0 <= pY && pY <= num;
    }

    function s() {
        return height - num <= pY && pY <= height;
    }

    if (0 <= pX && pX <= width && 0 <= pY && pY <= height) {
        if (w() && n()) {
            direction = "西北";
        } else if (w() && s()) {
            direction = "西南";
        } else if (e() && n()) {
            direction = "东北";
        } else if (e() && s()) {
            direction = "东南";
        } else if (w()) {
            direction = "西";
        } else if (e()) {
            direction = "东";
        } else if (n()) {
            direction = "北";
        } else if (s()) {
            direction = "南";
        } else {
            direction = "move";
        }
    } else {
        direction = "";
    }
    return direction;
}

let lastCursor: Dire = "";

function cursor(d: Dire) {
    if (d === lastCursor) return;
    lastCursor = d;
    const m: Record<Dire, string> = {
        西北: "nwse-resize",
        东南: "nwse-resize",
        东北: "nesw-resize",
        西南: "nesw-resize",
        西: "ew-resize",
        东: "ew-resize",
        北: "ns-resize",
        南: "ns-resize",
        move: "default",
        "": "default",
    };
    (document.querySelector("html") as HTMLElement).style.cursor = m[d];
}

function move(el: ElType<HTMLElement>, e: { x: number; y: number }) {
    if (changing != null && oPs.length !== 0) {
        const oE = changing;
        const dx = e.x - oE.x;
        const dy = e.y - oE.y;
        const [ox, oy, ow, oh] = oPs;
        let pS: [number, number, number, number] = [
            Number.NaN,
            Number.NaN,
            Number.NaN,
            Number.NaN,
        ];
        const zp = { x: 0, y: 0 };
        switch (direction) {
            case "西北": {
                const k = -1 / (oh / ow);
                const d =
                    (k * dx - dy) / Math.sqrt(k ** 2 + 1) +
                    Math.sqrt(ow ** 2 + oh ** 2);
                const w = d * Math.cos(Math.atan(oPs[3] / oPs[2]));
                const h = d * Math.sin(Math.atan(oPs[3] / oPs[2]));
                pS = [ox + ow - w, oy + oh - h, w, h];
                zp.x = 1;
                zp.y = 1;
                break;
            }
            case "东南": {
                const k = -1 / (oh / ow);
                const d =
                    -(k * dx - dy) / Math.sqrt(k ** 2 + 1) +
                    Math.sqrt(ow ** 2 + oh ** 2);
                const w = d * Math.cos(Math.atan(oPs[3] / oPs[2]));
                const h = d * Math.sin(Math.atan(oPs[3] / oPs[2]));
                pS = [ox, oy, w, h];
                break;
            }
            case "东北": {
                const k = 1 / (oh / ow);
                const d =
                    (k * dx - dy) / Math.sqrt(k ** 2 + 1) +
                    Math.sqrt(ow ** 2 + oh ** 2);
                const w = d * Math.cos(Math.atan(oPs[3] / oPs[2]));
                const h = d * Math.sin(Math.atan(oPs[3] / oPs[2]));
                pS = [ox, oy + oh - h, w, h];
                zp.y = 1;
                break;
            }
            case "西南": {
                const k = 1 / (oh / ow);
                const d =
                    -(k * dx - dy) / Math.sqrt(k ** 2 + 1) +
                    Math.sqrt(ow ** 2 + oh ** 2);
                const w = d * Math.cos(Math.atan(oPs[3] / oPs[2]));
                const h = d * Math.sin(Math.atan(oPs[3] / oPs[2]));
                pS = [ox + ow - w, oy, w, h];
                zp.x = 1;
                break;
            }
            case "西": {
                const r = (ow - dx) / ow;
                pS = [ox + dx, oy, ow - dx, oh * r];
                zp.x = 1;
                break;
            }
            case "东": {
                const r = (ow + dx) / ow;
                pS = [ox, oy, ow + dx, oh * r];
                break;
            }
            case "北": {
                const r = (oPs[3] - dy) / oh;
                pS = [ox, oy + dy, ow * r, oh - dy];
                zp.y = 1;
                break;
            }
            case "南": {
                const r = (oPs[3] + dy) / oh;
                pS = [ox, oy, ow * r, oh + dy];
                break;
            }
            case "move":
                pS = [ox + dx, oy + dy, ow, oh];
                el.style({
                    left: `${pS[0]}px`,
                    top: `${pS[1]}px`,
                    width: `${pS[2]}px`,
                    height: `${pS[3]}px`,
                });
                return;
        }
        // @ts-ignore
        resize(el.el.id, pS[2] / dingData.get(el.el.id).rect[2], zp.x, zp.y);
    }
}

function dxdy(e: MouseEvent, el: ElType<HTMLElement>) {
    const r = el.el.getBoundingClientRect();
    return {
        dx: (e.clientX - r.left) / el.el.offsetWidth,
        dy: (e.clientY - r.top) / el.el.offsetHeight,
    };
}

function resize(
    id: string,
    zoom: number,
    dx: number,
    dy: number,
    _clip?: boolean,
) {
    const el = elFromId(id);
    if (!el) return;
    const d = dingData.get(id);
    if (!d) return;
    elMap.find((i) => i.id === id)?.size(String(Math.round(zoom * 100)));
    const rect = [
        el.el.offsetLeft,
        el.el.offsetTop,
        el.el.offsetWidth,
        el.el.offsetHeight,
    ];
    const toWidth = d.rect[2] * zoom;
    const toHeight = d.rect[3] * zoom;
    const point = { x: rect[0] + rect[2] * dx, y: rect[1] + rect[3] * dy };
    const x = point.x - toWidth * dx;
    const y = point.y - toHeight * dy;
    const pS = [x, y, toWidth, toHeight];
    const clip = toWidth < rect[2] ? false : _clip;

    const bar = el.query("#tool_bar_c") as ElType<HTMLElement>;
    const w = pS[2];
    let zoomN = "";
    if (w <= 360) {
        zoomN = String(w / 360);
    } else {
        zoomN = "";
    }
    if (!clip) bar.style({ zoom: zoomN });

    if (clip) {
        const style = {
            left: `${pS[0] - rect[0]}px`,
            top: `${pS[1] - rect[1]}px`,
            width: `${pS[2]}px`,
            height: `${pS[3]}px`,
        };
        el.query(".img")?.style(style);
    } else {
        const style = {
            left: 0,
            top: 0,
            width: "100%",
            height: "",
        } as const;
        el.query(".img")?.style(style);
        el.style({
            left: `${pS[0]}px`,
            top: `${pS[1]}px`,
            width: `${pS[2]}px`,
            height: `${pS[3]}px`,
        });
    }

    for (const i of el.queryAll(".img>*")) {
        i.style({ "image-rendering": zoom > 1.5 ? "pixelated" : "initial" });
    }

    if (resizeSender)
        sendEvent("resize", null, { id: id, zoom, dx, dy, clip } as Resize);
}

const photoEl = view().attr({ id: "photo" }).addInto();

const dockP = store.get("ding_dock");
const dockEl = view()
    .attr({ id: "dock" })
    .style({ left: `${dockP[0]}px`, top: `${dockP[1]}px` })
    .addInto();
const dockView = view().addInto(dockEl);

let dockShow = false;

trackPoint(dockEl, {
    start: () => {
        dockEl.el.style.transition = "0s";
        return { x: dockEl.el.offsetLeft, y: dockEl.el.offsetTop };
    },
    ing: (p) => {
        dockEl.style({
            left: `${p.x}px`,
            top: `${p.y}px`,
        });
        return p;
    },
    end: (_, { moved, ingData }) => {
        if (!moved) {
            showDock();
        } else {
            store.set("ding_dock", [ingData.x, ingData.y]);
        }
        dockEl.el.style.transition = "var(--transition)";
    },
});

const showDock = () => {
    dockShow = !dockShow;
    if (dockShow) {
        if (
            dockEl.el.offsetLeft + 5 <=
            // @ts-ignore
            document.querySelector("html").offsetWidth / 2
        ) {
            dockEl.el.classList.remove("dock_right");
            dockEl.el.classList.add("dock_left");
        } else {
            dockEl.el.classList.remove("dock_left");
            dockEl.el.classList.add("dock_right");
        }
        dockEl.el.classList.add("dock");
        dockView.style({ display: "block" });
    } else {
        dockEl.el.className = "";
        dockEl.el.style.transition = "";
        dockView.style({ display: "none" });
    }
};

// 刷新dock
function dockI() {
    dockView.clear();
    for (const i of dingData.keys()) {
        let iIgnore_v = false;
        let iTran_v = -1;

        const dockItem = view();
        const iPhoto = image(getUrl(i), "预览").on("click", () => {
            const div = document.getElementById(i);
            if (div?.classList.contains("minimize")) {
                div.style.transition = "var(--transition)";
                setTimeout(() => {
                    div.style.transition = "";
                }, 400);
                div.classList.remove("minimize");
            } else {
                back(i);
            }
            if (div) div.style.zIndex = String(toppest + 1);
            toppest += 1;
        });
        const iClose = view()
            .add(iconEl("close"))
            .attr({ title: t("关闭") })
            .on("click", () => {
                close(i);
            });
        const iIgnore = view()
            .add(iconEl("ignore"))
            .attr({ title: t("鼠标穿透") })
            .on("click", () => {
                iIgnore_v = !iIgnore_v;
                ignore(i, iIgnore_v);
            });
        const iTran = view()
            .add(iconEl("replace"))
            .attr({ title: t("窗口变换") })
            .on("click", () => {
                iTran_v = iTran_v === -1 ? 0 : -1;
                transform(i, iTran_v);
            });

        dockItem
            .add([
                view("x")
                    .add([iTran, iIgnore, iClose])
                    .class("i_bar")
                    .class("small-size")
                    .class("bar"),
                iPhoto,
            ])
            .addInto(dockView);
    }
}
ipcRenderer.on("img", (_event, wid, x, y, w, h, url, type) => {
    elMap.push(setNewDing(String(wid), x, y, w, h, url, type));
});

let seg: Intl.Segmenter;
try {
    seg = new Intl.Segmenter(
        store.get("屏幕翻译.语言.to") ?? navigator.language ?? "zh-HANS",
        {
            granularity: "word",
        },
    );
} catch (error) {
    seg = new Intl.Segmenter("zh-HANS", {
        granularity: "word",
    });
}
