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
function D205CardatronControl(p) {
    /* Constructor for the CardatronControl object */
    var left = 600;

    this.mnemonic = "CCU";
    this.p = p;                         // D205Processor object
    this.setupUnit = 1;                 // Unit number for INPUT SETUP button

    // Do not call this.clear() here -- call this.clearUnit() from onLoad instead

    this.doc = null;
    this.window = window.open("../webUI/D205CardatronControl.html", this.mnemonic,
            "location=no,scrollbars=no,resizable,width=140,height=140,top=0,left=" + left);
    this.window.addEventListener("load",
        D205Util.bindMethod(this, D205CardatronControl.prototype.cardatronOnLoad));

    // Set up the I/O devices
    this.inputUnit = [
            null,                                       // no input unit 0
            new D205CardatronInput("CR1", 1),           // input unit 1
            null,                                       // input unit 2
            null,                                       // input unit 3
            null,                                       // input unit 4
            null,                                       // input unit 5
            null,                                       // input unit 6
            null];                                      // input unit 7
    this.outputUnit = [
            null,                                       // no output unit 0
            new D205CardatronOutput("CP1", 1, false),   // output unit 1
            new D205CardatronOutput("CP2", 2, false),   // output unit 2
            new D205CardatronOutput("LP3", 3, true),    // output unit 3
            null,                                       // output unit 4
            null,                                       // output unit 5
            null,                                       // output unit 6
            null];                                      // output unit 7
}

/**************************************/
D205CardatronControl.prototype.$$ = function $$(e) {
    return this.doc.getElementById(e);
};

/**************************************/
D205CardatronControl.prototype.clear = function clear() {
    /* Initializes (and if necessary, creates) the panel state */

    this.clearUnit();
};

/**************************************/
D205CardatronControl.prototype.setUnitDesignateLamps = function setUnitDesignateLamps(unit) {
    /* Sets the UD lamps on the panel from the low-order three bits of "unit" */

    this.unitDesignate1Lamp.set(unit & 0x01);
    this.unitDesignate2Lamp.set((unit >>> 1) & 0x01);
    this.unitDesignate4Lamp.set((unit >>> 2) & 0x01);
};

/**************************************/
D205CardatronControl.prototype.setRelayDesignateLamps = function setRelayDesignateLamps(mask) {
    /* Sets the RD lamps on the panel from the low-order four bits of "mask" */

    this.relayDesignate1Lamp.set(mask & 0x01);
    this.relayDesignate2Lamp.set((mask >>> 1) & 0x01);
    this.relayDesignate4Lamp.set((mask >>> 2) & 0x01);
    this.relayDesignate8Lamp.set((mask >>> 3) & 0x01);
};

/**************************************/
D205CardatronControl.prototype.InputSetupBtn_onClick = function InputSetupBtn_onClick(ev) {
    /* Handle the click event for the INPUT SETUP button. This will request the
    Processor to clear the C register and load a CDR (44) instruction into it */

    this.p.inputSetup(this.setupUnit);
};

/**************************************/
D205CardatronControl.prototype.ClearBtn_onClick = function ClearBtn_onClick(ev) {
    /* Handle the click event for the CLEAR button. This is a General Clear for
    the system. this.p.clear will clear the Processor. That in turn will call
    this.clear, which will clear the Cardatron Control state */

    this.p.clear();
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
    this.$$("InputSetupBtn").addEventListener("click",
            D205Util.bindMethod(this, D205CardatronControl.prototype.InputSetupBtn_onClick));
    this.$$("ClearBtn").addEventListener("click",
            D205Util.bindMethod(this, D205CardatronControl.prototype.ClearBtn_onClick));

    this.clearUnit();
};

/**************************************/
D205CardatronControl.prototype.inputInitiate = function inputInitiate(unitNr, kDigit, wordSender) {
    /* Initiates the read from one of the Cardatron input devices */

    this.outputUnitLamp.set(0);
    this.setRelayDesignateLamps(0);
    if (!this.inputUnit[unitNr]) {
        // ?? what happens if the unitNr is invalid? Halt?
        wordSender(-1);                 // just terminate the I/O
    } else {
        this.setUnitDesignateLamps(unitNr);
        this.inputUnit[unitNr].inputInitiate(kDigit, wordSender);
    }
};

/**************************************/
D205CardatronControl.prototype.inputWord = function inputWord(unitNr, wordSender) {
    /* Reads the next word from the Cardatron input device */

    if (!this.inputUnit[unitNr]) {
        // ?? what happens if the unitNr is invalid? Halt?
        wordSender(-1);                 // just terminate the I/O
    } else {
        this.inputUnit[unitNr].inputWord(wordSender);
    }
};

/**************************************/
D205CardatronControl.prototype.inputStop = function inputStop(unitNr) {
    /* Terminates data transfer from the Cardatron input device */

    this.setUnitDesignateLamps(0);
    if (!this.inputUnit[unitNr]) {
        // ?? what happens if the unitNr is invalid? Halt?
    } else {
        this.inputUnit[unitNr].inputStop();
    }
};

/**************************************/
D205CardatronControl.prototype.inputReadyInterrogate = function inputReadyInterrogate(unitNr) {
    /* Interrogates the ready status of a Cardatron input device */

    if (!this.inputUnit[unitNr]) {
        // ?? what happens if the unitNr is invalid? Halt?
        return false;
    } else {
        return this.inputUnit[unitNr].inputReadyInterrogate();
    }
};

/**************************************/
D205CardatronControl.prototype.inputFormatInitiate = function inputFormatInitiate(
        unitNr, kDigit, requestNextWord, signalFinished) {
    /* Initiates loading a format band for one of the Cardatron input devices */

    this.outputUnitLamp.set(0);
    this.setRelayDesignateLamps(0);
    if (!this.inputUnit[unitNr]) {
        // ?? what happens if the unitNr is invalid? Halt?
        signalFinished();               // just terminate the I/O
    } else {
        this.setUnitDesignateLamps(unitNr);
        this.inputUnit[unitNr].inputFormatInitiate(kDigit, requestNextWord, signalFinished);
    }
};

/**************************************/
D205CardatronControl.prototype.outputInitiate = function outputInitiate(
        unitNr, kDigit, tDigit, requestNextWord, signalFinished) {
    /* Initiates writing to one of the Cardatron output devices */

    this.outputUnitLamp.set(1);
    this.setRelayDesignateLamps(tDigit);
    if (!this.outputUnit[unitNr]) {
        // ?? what happens if the unitNr is invalid? Halt?
        signalFinished();               // just terminate the I/O
    } else {
        this.setUnitDesignateLamps(unitNr);
        this.outputUnit[unitNr].outputInitiate(kDigit, tDigit, requestNextWord, signalFinished);
    }
};

/**************************************/
D205CardatronControl.prototype.outputReadyInterrogate = function outputReadyInterrogate(unitNr) {
    /* Interrogates the ready status of a Cardatron output device */

    if (!this.outputUnit[unitNr]) {
        // ?? what happens if the unitNr is invalid? Halt?
        return false;
    } else {
        return this.outputUnit[unitNr].outputReadyInterrogate();
    }
};

/**************************************/
D205CardatronControl.prototype.outputFormatInitiate = function outputFormatInitiate(
        unitNr, kDigit, requestNextWord, signalFinished) {
    /* Initiates loading a format band for one of the Cardatron output devices */

    this.outputUnitLamp.set(1);
    this.setRelayDesignateLamps(0);
    if (!this.outputUnit[unitNr]) {
        // ?? what happens if the unitNr is invalid? Halt?
        signalFinished();               // just terminate the I/O
    } else {
        this.setUnitDesignateLamps(unitNr);
        this.outputUnit[unitNr].outputFormatInitiate(kDigit, requestNextWord, signalFinished);
    }
};

/**************************************/
D205CardatronControl.prototype.clearUnit = function clearUnit() {
    /* Clears the internal state of the control unit */

    this.outputUnitLamp.set(0);
    this.setUnitDesignateLamps(0);
    this.setRelayDesignateLamps(0);
};

/**************************************/
D205CardatronControl.prototype.shutDown = function shutDown() {
    /* Shuts down the panel */
    var x;

    if (this.inputUnit) {
        for (x=this.inputUnit.length-1; x>=0; --x) {
            if (this.inputUnit[x]) {
                this.inputUnit[x].shutDown();
                this.inputUnit[x] = null;
            }
        }
    }

    if (this.outputUnit) {
        for (x=this.outputUnit.length-1; x>=0; --x) {
            if (this.outputUnit[x]) {
                this.outputUnit[x].shutDown();
                this.outputUnit[x] = null;
            }
        }
    }

    this.window.removeEventListener("beforeunload", D205CardatronControl.prototype.beforeUnload);
    this.window.close();
};