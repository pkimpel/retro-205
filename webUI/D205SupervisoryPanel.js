/***********************************************************************
* retro-205/D205SupervisoryPanel.js
************************************************************************
* Copyright (c) 2014, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* Electrodata/Burroughs Datatron 205 Supervisory Control Panel object.
************************************************************************
* 2014-11-01  P.Kimpel
*   Original version, from D205ControlConsole.html prototype.
***********************************************************************/
"use strict";

/**************************************/
function D205SupervisoryPanel() {
    /* Constructor for the SupervisoryPanel object */
    var h = 800; // was originally 524;
    var w = 1180;
    var mnemonic = "SupervisoryPanel";

    this.timer = 0;                     // setCallback() token

    this.clear();

    this.window = window.open("", mnemonic);
    if (this.window) {
        this.shutDown();                // destroy the previously-existing window
        this.window = null;
    }
    this.doc = null;
    this.window = window.open("../webUI/D205SupervisoryPanel.html", mnemonic,
            "location=no,scrollbars,resizable,width=" + w + ",height=" + h +
            ",top=0,left=" + (screen.availWidth - w));
    this.window.addEventListener("load",
        D205Util.bindMethod(this, D205SupervisoryPanel.prototype.consoleOnLoad), false);
}

/**************************************/
D205SupervisoryPanel.displayRefreshPeriod = 50;   // milliseconds

/**************************************/
D205SupervisoryPanel.prototype.$$ = function $$(e) {
    return this.doc.getElementById(e);
};

/**************************************/
D205SupervisoryPanel.prototype.clear = function clear() {
    /* Initializes (and if necessary, creates) the printer unit state */

};

/**************************************/
D205SupervisoryPanel.prototype.beforeUnload = function beforeUnload(ev) {
    var msg = "Closing this window will make the device unusable.\n" +
              "Suggest you stay on the page and minimize this window instead";

    ev.preventDefault();
    ev.returnValue = msg;
    return msg;
};

/**************************************/
D205SupervisoryPanel.prototype.setLamp = function setLamp(id, value, lampClass, litClass) {
    var bit = value % 2;
    var e = this.$$(id);

    e.className = (bit ? lampClass + " " + litClass : lampClass);
    return (value-bit)/2;
};

/**************************************/
D205SupervisoryPanel.prototype.updateDisplay = function updateDisplay() {
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
D205SupervisoryPanel.prototype.stepBtn_Click = function stepBtn_Click(ev) {
    if (this.timer) {
        clearInterval(this.timer);
        this.timer = 0;
    }
    this.updateDisplay();
};

/**************************************/
D205SupervisoryPanel.prototype.stopBtn_Click = function stopBtn_Click(ev) {
    if (this.timer) {
        clearInterval(this.timer);
        this.timer = 0;
    }
};

/**************************************/
D205SupervisoryPanel.prototype.contBtn_Click = function contBtn_Click(ev) {
    if (!this.timer) {
        this.timer = setInterval(D205Util.bindMethod(this, this.updateDisplay), D205SupervisoryPanel.displayRefreshPeriod);
    }
    this.updateDisplay();
};

/**************************************/
D205SupervisoryPanel.prototype.flipSwitch = function flipSwitch(ev) {
    var img = ev.target;
    var src = img.src;

    if (src.indexOf("Down") > 0) {
        img.src = src.replace("Down", "Up");
    } else if (src.indexOf("Up") > 0) {
        img.src = src.replace("Up", "Down");
    }
};

/**************************************/
D205SupervisoryPanel.prototype.consoleOnLoad = function consoleOnLoad() {
    /* Initializes the line printer window and user interface */
    var adderDiv;
    var body;
    var box;
    var controlDiv;
    var cx;
    var cy;
    var e;
    var x;

    this.doc = this.window.document;
    body = this.$$("PanelSurface");
    adderDiv = this.$$("AdderDiv");
    controlDiv = this.$$("ControlDiv");

    // A Register
    this.regA = new PanelRegister(this.$$("ARegPanel"), 44, 4, "A REGISTER");
    this.regA.drawBox(1, 1, 4, "", "1px solid black");
    this.regA.drawBox(6, 2, 4, "1px dashed black", "1px dashed black");
    this.regA.lamps[43].setCaption("A-SG");
    for (x=1; x<=10; x++) {
        this.regA.lamps[43-x*4].setCaption("A-"+x);
    }

    // Adder Panel //

    // B Register
    this.regB = new PanelRegister(this.$$("BRegPanel"), 16, 4, "B REGISTER");
    for (x=1; x<=4; x++) {
        this.regB.lamps[19-x*4].setCaption("B-"+x);
    }

    // CardaTron Control
    cx = 5*PanelRegister.hSpacing + PanelRegister.hOffset;
    cy = PanelRegister.vOffset;
    this.cardaTronTWA = new NeonLamp(cx, cy);
    this.cardaTronTWA.setCaption("CARDATRON CONTROL");
    this.cardaTronTWA.setCaption("TWA", true);
    adderDiv.appendChild(this.cardaTronTWA.element);
    this.cardaTronBIO = new NeonLamp(cx, cy+PanelRegister.vSpacing);
    this.cardaTronBIO.setCaption("BIO", true);
    adderDiv.appendChild(this.cardaTronBIO.element);

    // Carry Control
    this.regCarry = new PanelRegister(this.$$("CarryPanel"), 5, 5, null);
    this.regCarry.lamps[4].setCaption("CARRY");
    cx = 1;
    for (x=0; x<5; ++x) {
        this.regCarry.lamps[x].setCaption("CT " + cx, true);
        cx *= 2;
    }
    // (relocate the CT1 lamp to bottom of the second column)
    cx = PanelRegister.hSpacing + PanelRegister.hOffset;
    cy = 3*PanelRegister.vSpacing + PanelRegister.vOffset;
    this.regCarry.lamps[0].element.style.left = cx.toString() + "px";
    this.regCarry.lamps[0].element.style.top = cy.toString() + "px";

    // Adder Control
    this.regAdder = new PanelRegister(this.$$("AdderPanel"), 4, 4, null);
    this.regAdder.lamps[3].setCaption("ADDER COL");
    cx = 1;
    for (x=0; x<4; ++x) {
        this.regAdder.lamps[x].setCaption(cx.toString(), true);
        cx *= 2;
    }

    // C Register
    this.regC = new PanelRegister(this.$$("CRegPanel"), 40, 4, "C REGISTER");
    box = this.regC.drawBox(1, 2, 4, "", "");
    this.regC.setBoxCaption(box, "ORDER");
    box = this.regC.drawBox(3, 4, 4, "1px solid black", "1px solid black");
    this.regC.setBoxCaption(box, "ADDRESS");
    box = this.regC.drawBox(7, 4, 4, "", "");
    this.regC.setBoxCaption(box, "CONTROL ADDRESS");

    // D Register
    this.regD = new PanelRegister(this.$$("DRegPanel"), 44, 4, "D REGISTER");
    this.regD.drawBox(1, 1, 4, "", "1px solid black");
    this.regD.drawBox(6, 2, 4, "1px dashed black", "1px dashed black");
    this.regD.lamps[43].setCaption("D-SG");
    for (x=1; x<=10; x++) {
        this.regD.lamps[43-x*4].setCaption("D-"+x);
    }

    // R Register
    this.regR = new PanelRegister(this.$$("RRegPanel"), 40, 4, "R REGISTER");
    this.regR.drawBox(1, 4, 4, "", "1px dashed black");
    for (x=1; x<=10; x++) {
        this.regR.lamps[43-x*4].setCaption("R-"+x);
    }

    // Control Toggles Panel
    this.control = new PanelRegister(controlDiv, 40, 4, "CONTROL");
    box = this.control.drawBox(1, 1, 4, "", "1px dashed black");
    box = this.control.drawBox(2, 3, 4, "", "1px dashed black");
    box = this.control.drawBox(5, 1, 4, "", "1px dashed black");
    box = this.control.drawBox(6, 1, 4, "", "1px dashed black");
    box = this.control.drawBox(7, 1, 4, "", "1px dashed black");
    box = this.control.drawBox(8, 1, 4, "", "1px dashed black");
    box = this.control.drawBox(9, 1, 3, "", "1px dashed black");
    box.style.borderBottom = "1px dashed black";
    box.style.height = (this.control.yCoord(4) - this.control.yCoord(1) - 1).toString() + "px";

    this.control.lamps[ 3].setCaption("SHIFT CTR");
    this.control.lamps[ 3].setCaption("8", true);
    this.control.lamps[ 2].setCaption("4", true);
    this.control.lamps[ 1].setCaption("2", true);
    this.control.lamps[ 0].setCaption("1", true);

    this.control.lamps[ 7].setCaption("MAG. TAPE");
    this.control.lamps[ 7].setCaption("3P", true);
    this.control.lamps[ 6].setCaption("1BV4", true);
    this.control.lamps[ 5].setCaption("1BV5", true);
    this.control.lamps[ 4].setCaption("10", true);

    this.control.lamps[11].setCaption("SHIFT CONTROL");
    this.control.lamps[11].setCaption("1", true);
    this.control.lamps[10].setCaption("2", true);
    this.control.lamps[ 9].setCaption("3", true);
    this.control.lamps[ 8].setCaption("4", true);

    this.control.lamps[15].setCaption("CENTRAL CONTROL");
    this.control.lamps[15].setCaption("TO", true);
    this.control.lamps[14].setCaption("BKPT", true);
    this.control.lamps[13].setCaption("ZCT", true);
    this.control.lamps[12].setCaption("ASYNC", true);

    this.control.lamps[19].setCaption("OUTPUT CONTROL");
    this.control.lamps[19].setCaption("OK", true);
    this.control.lamps[18].setCaption("PO1", true);
    this.control.lamps[17].setCaption("PO2", true);
    this.control.lamps[16].setCaption("DELAY", true);

    this.control.lamps[23].setCaption("INPUT CONTROL");
    this.control.lamps[23].setCaption("START", true);
    this.control.lamps[22].setCaption("TF", true);
    this.control.lamps[21].setCaption("TC1", true);
    this.control.lamps[20].setCaption("TC2", true);

    this.control.lamps[27].setCaption("SIGN", true);
    this.control.lamps[26].setCaption("COUNT", true);
    this.control.lamps[25].setCaption("\u00F7ALARM", true);     // division sign
    this.control.lamps[24].setCaption("STEP", true);

    this.control.lamps[31].setCaption("ARITHMETIC CONTROL");
    this.control.lamps[31].setCaption("COMPL", true);
    this.control.lamps[30].setCaption("+A/+B", true);
    this.control.lamps[29].setCaption("CLEAR", true);
    this.control.lamps[28].setCaption("\u00D7, \u00F7", true);       // division sign

    this.control.lamps[35].setCaption("B\u2192A, IN", true);
    this.control.lamps[34].setCaption("ADDER", true);
    this.control.lamps[33].setCaption("DP CTR", true);
    this.control.lamps[32].setCaption("\u0394 B, \u00F7", true); // delta, division signs

    this.control.lamps[39].setCaption("SPECIAL CTR");
    this.control.lamps[39].setCaption("8", true);
    this.control.lamps[38].setCaption("4", true);
    this.control.lamps[37].setCaption("2", true);
    this.control.lamps[36].setCaption("1", true);       // division sign


    /*****
    cx = cols*PanelRegister.hSpacing + PanelRegister.hOffset;
    for (b=0; b<bits; b++) {
        if (b%rows == 0) {
            cy = (rows-1)*PanelRegister.vSpacing + PanelRegister.vOffset;
            cx -= PanelRegister.hSpacing;
        } else {
            cy -= PanelRegister.vSpacing;
        }
        lamp = new NeonLamp(cx, cy);
        this.lamps[b] = lamp;
        this.element.appendChild(lamp.element);
    *****/

    // Events

    //this.window.addEventListener("beforeunload",
    //        D205SupervisoryPanel.prototype.beforeUnload, false);
    //this.$$("PowerOnBtn").addEventListener("click",
    //        D205Util.bindMethod(this, D205SupervisoryPanel.prototype.powerOnBtn_Click), false);
    //this.$$("PowerOffBtn").addEventListener("click",
    //        D205Util.bindMethod(this, D205SupervisoryPanel.prototype.powerOffBtn_Click), false);
    //this.$$("StartBtn").addEventListener("click",
    //        D205Util.bindMethod(this, D205SupervisoryPanel.prototype.startBtn_Click), false);
    this.$$("LockNormalSwitch").addEventListener("click",
            D205Util.bindMethod(this, D205SupervisoryPanel.prototype.flipSwitch), false);
    this.$$("ContinuousStepSwitch").addEventListener("click",
            D205Util.bindMethod(this, D205SupervisoryPanel.prototype.flipSwitch), false);
    this.$$("AudibleAlarmSwitch").addEventListener("click",
            D205Util.bindMethod(this, D205SupervisoryPanel.prototype.flipSwitch), false);
};

/**************************************/
D205SupervisoryPanel.prototype.shutDown = function shutDown() {
    /* Shuts down the device */

    if (this.timer) {
        clearInterval(this.timer);
    }
    this.window.removeEventListener("beforeunload", D205SupervisoryPanel.prototype.beforeUnload, false);
    this.window.close();
};