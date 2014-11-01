/***********************************************************************
* retro-205/D205ConsolePanel.js
************************************************************************
* Copyright (c) 2014, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* Electrodata/Burroughs Datatron 205 Control Console object.
************************************************************************
* 2014-10-18  P.Kimpel
*   Original version, from D205ConsolePanel.html prototype.
***********************************************************************/
"use strict";

/**************************************/
function D205ControlConsole() {
    /* Constructor for the ControlConsole object */
    var h = 524;
    var w = 1064;
    var mnemonic = "ControlConsole";

    this.timer = 0;                     // setCallback() token

    this.clear();

    this.window = window.open("", mnemonic);
    if (this.window) {
        this.shutDown();                // destroy the previously-existing window
        this.window = null;
    }
    this.doc = null;
    this.window = window.open("../webUI/D205ControlConsole.html", mnemonic,
            "location=no,scrollbars,resizable,width=" + w + ",height=" + h +
            ",left=0,top=" + (screen.availHeight - h));
    this.window.addEventListener("load",
        D205Util.bindMethod(this, D205ControlConsole.prototype.consoleOnLoad), false);
}

/**************************************/
D205ControlConsole.displayRefreshPeriod = 50;   // milliseconds

/**************************************/
D205ControlConsole.prototype.$$ = function $$(e) {
    return this.doc.getElementById(e);
};

/**************************************/
D205ControlConsole.prototype.clear = function clear() {
    /* Initializes (and if necessary, creates) the printer unit state */

};

/**************************************/
D205ControlConsole.prototype.beforeUnload = function beforeUnload(ev) {
    var msg = "Closing this window will make the device unusable.\n" +
              "Suggest you stay on the page and minimize this window instead";

    ev.preventDefault();
    ev.returnValue = msg;
    return msg;
};

/**************************************/
D205ControlConsole.prototype.setLamp = function setLamp(id, value, lampClass, litClass) {
    var bit = value % 2;
    var e = this.$$(id);

    e.className = (bit ? lampClass + " " + litClass : lampClass);
    return (value-bit)/2;
};

/**************************************/
D205ControlConsole.prototype.updateDisplay = function updateDisplay() {
    var lampMask = Math.floor(Math.random()*1024);

    this.regA.update(Math.random()*Math.random()*0x100000000000);
    this.regB.update(Math.random()*0x10000);
    this.regC.update(Math.random()*Math.random()*0x10000000000);
    this.regD.update(Math.random()*Math.random()*0x100000000000);
    this.regR.update(Math.random()*Math.random()*0x10000000000);

    lampMask = this.setLamp("IdleLamp", lampMask, "redLamp", "redLit");
    lampMask = this.setLamp("FCSALamp", lampMask, "orangeLamp", "orangeLit");
    lampMask = this.setLamp("ControlLamp", lampMask, "orangeLamp", "orangeLit");
    lampMask = this.setLamp("BKPTLamp", lampMask, "orangeLamp", "orangeLit");
    lampMask = this.setLamp("OverflowLamp", lampMask, "redLamp", "redLit");
    lampMask = this.setLamp("ExecuteLamp", lampMask, "whiteLamp", "whiteLit");
    lampMask = this.setLamp("FetchLamp", lampMask, "whiteLamp", "whiteLit");
    lampMask = this.setLamp("NotReadyLamp", lampMask, "redLamp", "redLit");
    lampMask = this.setLamp("ContinuousLamp", lampMask, "greenLamp", "greenLit");
};

/**************************************/
D205ControlConsole.prototype.stepBtn_Click = function stepBtn_Click(ev) {
    if (this.timer) {
        clearInterval(this.timer);
        this.timer = 0;
    }
    this.updateDisplay();
};

/**************************************/
D205ControlConsole.prototype.stopBtn_Click = function stopBtn_Click(ev) {
    if (this.timer) {
        clearInterval(this.timer);
        this.timer = 0;
    }
};

/**************************************/
D205ControlConsole.prototype.contBtn_Click = function contBtn_Click(ev) {
    if (!this.timer) {
        this.timer = setInterval(D205Util.bindMethod(this, this.updateDisplay), D205ControlConsole.displayRefreshPeriod);
    }
    this.updateDisplay();
};

/**************************************/
D205ControlConsole.prototype.flipSwitch = function flipSwitch(ev) {
    var img = ev.target;
    var src = img.src;

    if (src.indexOf("Down") > 0) {
        img.src = src.replace("Down", "Up");
    } else if (src.indexOf("Up") > 0) {
        img.src = src.replace("Up", "Down");
    }
};

/**************************************/
D205ControlConsole.prototype.consoleOnLoad = function consoleOnLoad() {
    /* Initializes the line printer window and user interface */
    var body;
    var box;
    var e;
    var x;

    this.doc = this.window.document;
    body = this.$$("PanelSurface");

    this.regA = new PanelRegister(this.$$("ARegPanel"), 44, 4, "A REGISTER");
    this.regB = new PanelRegister(this.$$("BRegPanel"), 16, 4, "B REGISTER");
    this.regC = new PanelRegister(this.$$("CRegPanel"), 40, 4, "C REGISTER");
    this.regD = new PanelRegister(this.$$("DRegPanel"), 44, 4, "D REGISTER");
    this.regR = new PanelRegister(this.$$("RRegPanel"), 40, 4, "R REGISTER");

    body.appendChild(this.regA.element);
    this.regA.drawBox(1, 1, 4, "", "1px solid black");
    this.regA.drawBox(6, 2, 4, "1px dashed black", "1px dashed black");
    this.regA.lamps[43].setCaption("A-SG");
    for (x=1; x<=10; x++) {
        this.regA.lamps[43-x*4].setCaption("A-"+x);
    }

    body.appendChild(this.regB.element);
    for (x=1; x<=4; x++) {
        this.regB.lamps[19-x*4].setCaption("B-"+x);
    }

    body.appendChild(this.regC.element);
    box = this.regC.drawBox(1, 2, 4, "", "");
    this.regC.setBoxCaption(box, "ORDER");
    box = this.regC.drawBox(3, 4, 4, "1px solid black", "1px solid black");
    this.regC.setBoxCaption(box, "ADDRESS");
    box = this.regC.drawBox(7, 4, 4, "", "");
    this.regC.setBoxCaption(box, "CONTROL ADDRESS");

    body.appendChild(this.regD.element);
    this.regD.drawBox(1, 1, 4, "", "1px solid black");
    this.regD.drawBox(6, 2, 4, "1px dashed black", "1px dashed black");
    this.regD.lamps[43].setCaption("D-SG");
    for (x=1; x<=10; x++) {
        this.regD.lamps[43-x*4].setCaption("D-"+x);
    }

    body.appendChild(this.regR.element);
    this.regR.drawBox(1, 4, 4, "", "1px dashed black");
    for (x=1; x<=10; x++) {
        this.regR.lamps[43-x*4].setCaption("R-"+x);
    }

    //this.window.addEventListener("beforeunload",
    //        D205ControlConsole.prototype.beforeUnload, false);
    this.$$("StepBtn").addEventListener("click",
            D205Util.bindMethod(this, D205ControlConsole.prototype.stepBtn_Click), false);
    this.$$("StopBtn").addEventListener("click",
            D205Util.bindMethod(this, D205ControlConsole.prototype.stopBtn_Click), false);
    this.$$("ContBtn").addEventListener("click",
            D205Util.bindMethod(this, D205ControlConsole.prototype.contBtn_Click), false);
    this.$$("POSuppressSwitch").addEventListener("click",
            D205Util.bindMethod(this, D205ControlConsole.prototype.flipSwitch), false);
    this.$$("SkipSwitch").addEventListener("click",
            D205Util.bindMethod(this, D205ControlConsole.prototype.flipSwitch), false);
    this.$$("AudibleAlarmSwitch").addEventListener("click",
            D205Util.bindMethod(this, D205ControlConsole.prototype.flipSwitch), false);
};

/**************************************/
D205ControlConsole.prototype.shutDown = function shutDown() {
    /* Shuts down the device */

    if (this.timer) {
        clearInterval(this.timer);
    }
    this.window.removeEventListener("beforeunload", D205ControlConsole.prototype.beforeUnload, false);
    this.window.close();
};