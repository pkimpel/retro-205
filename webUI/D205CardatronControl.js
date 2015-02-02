/***********************************************************************
* retro-205/D205CardatronControl.js
************************************************************************
* Copyright (c) 2015, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* ElectroData/Burroughs Datatron 205 Cardatron Control object.
************************************************************************
* 2015-02-01  P.Kimpel
*   Original version, from D205ConsoleConsole.js.
***********************************************************************/
"use strict";

/**************************************/
function D205CardatronControl(mnemonic) {
    /* Constructor for the CardatronControl object */
    var left = 600;

    this.mnemonic = mnemonic;

    this.clear();

    this.window = window.open("", mnemonic);
    if (this.window) {
        this.shutDown();                // destroy the previously-existing window
        this.window = null;
    }

    this.doc = null;
    this.window = window.open("../webUI/D205CardatronControl.html", mnemonic,
            "location=no,scrollbars=no,resizable,width=200,height=80,top=0,left=" + left);
    this.window.addEventListener("load",
        D205Util.bindMethod(this, D205CardatronControl.prototype.cardatronOnLoad));

    // Set up the I/O devices
    this.unit = [
            null,                               // no unit 0
            new D205CardatronInput("CI1", 1),   // input unit 1
            null,                               // unused unit 2/6
            null,                               // unused unit 3/5
            null,                               // unused unit 4/4
            null,                               // unused unit 5/3
            null,                               // unused unit 6/2
            null];                              // unused unit 7/1
}

/**************************************/
D205CardatronControl.slowRefreshPeriod = 1000;    // milliseconds
D205CardatronControl.displayRefreshPeriod = 50;   // milliseconds
D205CardatronControl.offSwitchClass = "./resources/ToggleDown.png";
D205CardatronControl.onSwitchClass = "./resources/ToggleUp.png";

/**************************************/
D205CardatronControl.prototype.$$ = function $$(e) {
    return this.doc.getElementById(e);
};

/**************************************/
D205CardatronControl.prototype.clear = function clear() {
    /* Initializes (and if necessary, creates) the panel state */

    this.lastStartState = 0;            // last state of Processor.togSTART
    this.digitSender = null;            // reference to keyboard callback function
};

/**************************************/
D205CardatronInput.prototype.ClearBtn_onClick = function ClearBtn_onClick(ev) {
    /* Handle the click event for the CLEAR button */

    this.outputUnitLamp.set(0);
    this.unitDesignate1Lamp.set(0);
    this.unitDesignate2Lamp.set(0);
    this.unitDesignate4Lamp.set(0);
    this.relayDesignate1Lamp.set(0);
    this.relayDesignate2Lamp.set(0);
    this.relayDesignate4Lamp.set(0);
    this.relayDesignate8Lamp.set(0);
};

/**************************************/
D205CardatronControl.prototype.beforeUnload = function beforeUnload(ev) {
    var msg = "Closing this window will make the panel unusable.\n" +
              "Suggest you stay on the page and minimize this window instead";

    ev.preventDefault();
    ev.returnValue = msg;
    return msg;
};

/**************************************/
D205CardatronControl.prototype.cardatronOnLoad = function cardatronOnLoad() {
    /* Initializes the Cardatron Control window and user interface */
    var body;
    var box;
    var e;
    var x;

    this.doc = this.window.document;
    body = this.$$("PanelSurface");

    this.outputUnitLamp = new NeonLamp(body, null, null, "OutputUnitLamp");
    this.outputUnitLamp.setCaption("OU", true);
    this.unitDesignate4Lamp = new NeonLamp(body, null, null, "UnitDesignate4Lamp");
    this.unitDesignate4Lamp.setCaption("UD4", true);
    this.unitDesignate2Lamp = new NeonLamp(body, null, null, "UnitDesignate2Lamp");
    this.unitDesignate2Lamp.setCaption("UD2", true);
    this.unitDesignate1Lamp = new NeonLamp(body, null, null, "UnitDesignate1Lamp");
    this.unitDesignate1Lamp.setCaption("UD1", true);

    this.relayDesignate8Lamp = new NeonLamp(body, null, null, "RelayDesignate8Lamp");
    this.relayDesignate8Lamp.setCaption("RD8", true);
    this.relayDesignate4Lamp = new NeonLamp(body, null, null, "RelayDesignate4Lamp");
    this.relayDesignate4Lamp.setCaption("RD4", true);
    this.relayDesignate2Lamp = new NeonLamp(body, null, null, "RelayDesignate2Lamp");
    this.relayDesignate2Lamp.setCaption("RD2", true);
    this.relayDesignate1Lamp = new NeonLamp(body, null, null, "RelayDesignate1Lamp");
    this.relayDesignate1Lamp.setCaption("RD1", true);

    // Events

    this.window.addEventListener("beforeunload", D205CardatronControl.prototype.beforeUnload);
    this.$$("ClearBtn").addEventListener("click",
            D205Util.bindMethod(this, D205CardatronInput.prototype.ClearBtn_onClick));
};

/**************************************/
D205CardatronControl.prototype.readDigit = function readDigit(digitSender) {
    /* Initiates the read of a digit from one of the Console input devices.
    For the paper-tape readers, attempts to read the digit immediately. For
    the keyboard, stashes the callback function and waits for a keyboard event */

    switch (this.inputKnob.position) {
    case 0:                             // mechanical reader
    case 1:                             // optical reader
        this.consoleIn.readTapeDigit(this.inputKnob.position, digitSender);
        break;
    case 2:                             // keyboard
        this.digitSender = digitSender;
        this.window.focus();
        break;
    } // switch inputKnob
};

/**************************************/
D205CardatronControl.prototype.writeFormatDigit = function writeFormatDigit(formatDigit, successor) {
    this.consoleOut.writeFormatDigit(this.outputKnob.position, formatDigit, successor);
};

/**************************************/
D205CardatronControl.prototype.writeSignDigit = function writeSignDigit(signDigit, successor) {
    this.consoleOut.writeSignDigit(this.outputKnob.position, signDigit, successor);
};

/**************************************/
D205CardatronControl.prototype.writeNumberDigit = function writeNumberDigit(digit, successor) {
    this.consoleOut.writeNumberDigit(this.outputKnob.position, digit, successor);
};

/**************************************/
D205CardatronControl.prototype.writeFinish = function writeFinish(controlDigit, successor) {
    this.consoleOut.writeFinish(this.outputKnob.position, controlDigit, successor);
};

/**************************************/
D205CardatronControl.prototype.shutDown = function shutDown() {
    /* Shuts down the panel */
    var x;

    if (this.unit) {
        for (x=this.unit.length-1; x>=0; --x) {
            if (this.unit[x]) {
                this.unit[x].shutDown();
                this.unit[x] = null;
            }
        }
    }

    this.window.removeEventListener("beforeunload", D205CardatronControl.prototype.beforeUnload);
    this.window.close();
};