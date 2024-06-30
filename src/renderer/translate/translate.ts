import { setting } from "../../ShareTypes";

import xtranslator from "xtranslator";

var Store = require("electron-store");
var configPath = new URLSearchParams(location.search).get("config_path");
var store = new Store({
    cwd: configPath || "",
});

import copy_svg from "../assets/icons/copy.svg";

function iconEl(img: string) {
    return el("img", { src: img, class: "icon" });
}

import { el } from "redom";

const input = el("textarea");
const lans = el("div");
const lansFrom = el("select");
const lansTo = el("select");

const results = el("div", { class: "results" });

lans.append(lansFrom, lansTo);

document.body.append(input, lans, results);

const inputText = decodeURIComponent(new URLSearchParams(location.search).get("text"));

function translate(text: string) {
    const fyq = store.get("翻译.翻译器") as setting["翻译"]["翻译器"];

    results.innerHTML = "";
    for (let i of fyq) {
        const copy = el("button", iconEl(copy_svg));
        const e = el("div", el("div", { class: "title" }, el("span", i.id), copy));
        results.append(e);
        const t = el("p");
        e.append(t);
        translateI(text, i).then((text) => {
            t.innerText = text;
            copy.onclick = () => {
                navigator.clipboard.writeText(text);
            };
        });
    }
}

function translateI(text: string, i: setting["翻译"]["翻译器"][0]) {
    xtranslator.e[i.type].setKeys(i.keys);
    return xtranslator.e[i.type].run(text, lansFrom.value, lansTo.value);
}

input.value = inputText;
if (inputText) {
    translate(inputText);
}

let composing = false;
input.addEventListener("compositionstart", () => (composing = true));
input.addEventListener("compositionend", () => (composing = false));

let lastTrans = 0;

input.oninput = () => {
    if (composing) return;
    const now = new Date().getTime();
    if (now - lastTrans < 2000) return;
    else lastTrans = now;

    translate(input.value);
};
