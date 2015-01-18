/***********************************************************************
* retro-205/D205ControlConsole.js
************************************************************************
* Copyright (c) 2014, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* ElectroData/Burroughs Datatron 205 Control Console object.
************************************************************************
* 2014-10-18  P.Kimpel
*   Original version, from D205ConsolePanel.html prototype.
***********************************************************************/
"use strict";

/**************************************/
function D205ControlConsole(p) {
    /* Constructor for the ControlConsole object */
    var h = 524;
    var w = 1064;
    var mnemonic = "ControlConsole";

    this.p = p;                         // D205Processor object
    this.fastUpdateMode = 0;            // slow vs. fast panel update mode
    this.intervalToken = 0;             // setCallback() token
    this.stats = {};                    // current statistics values used by updatePanel()
    this.lastStats = {drumTime: 0};     // prior statisticss values used by updatePanel()

    this.boundKeypress = D205Processor.bindMethod(this, D205ControlConsole.prototype.keypress);
    this.boundButton_Click = D205Util.bindMethod(this, D205ControlConsole.prototype.button_Click);
    this.boundFlipSwitch = D205Util.bindMethod(this, D205ControlConsole.prototype.flipSwitch);
    this.boundUpdatePanel = D205Util.bindMethod(this, D205ControlConsole.prototype.updatePanel);

    this.clear();

    this.window = window.open("", mnemonic);
    if (this.window) {
        this.shutDown();                // destroy the previously-existing window
        this.window = null;
    }

    // Set up the Console I/O devices and redirect to them
    this.consoleOut = new D205ConsoleOutput("ConsoleOut", p);
    this.consoleIn = new D205ConsoleInput("ConsoleIn", p);

    this.doc = null;
    this.window = window.open("../webUI/D205ControlConsole.html", mnemonic,
            "location=no,scrollbars,resizable,width=" + w + ",height=" + h +
            ",left=0,top=" + (screen.availHeight - h));
    this.window.addEventListener("load",
        D205Util.bindMethod(this, D205ControlConsole.prototype.consoleOnLoad));
}

/**************************************/
D205ControlConsole.slowRefreshPeriod = 1000;    // milliseconds
D205ControlConsole.displayRefreshPeriod = 50;   // milliseconds
D205ControlConsole.offSwitch = "./resources/ToggleDown.png";
D205ControlConsole.onSwitch = "./resources/ToggleUp.png";

/**************************************/
D205ControlConsole.prototype.$$ = function $$(e) {
    return this.doc.getElementById(e);
};

/**************************************/
D205ControlConsole.prototype.clear = function clear() {
    /* Initializes (and if necessary, creates) the panel state */

    this.lastStartState = 0;            // last state of Processor.togSTART
    this.digitSender = null;            // reference to keyboard callback function
};

/**************************************/
D205ControlConsole.prototype.loadPrefs = function loadPrefs() {
    /* Loads, and if necessary initializes, the user's panel preferences */
    var prefs = null;
    var s = localStorage["retro-205-ControlConsole-Prefs"];

    try {
        if (s) {
            prefs = JSON.parse(s);
        }
    } finally {
        // nothing
    }

    return prefs || {
        poSuppressSwitch: 0,
        skipSwitch: 0,
        audibleAlarmSwitch: 0,
        outputKnob: 1,
        breakpointKnob: 0,
        inputKnob: 1};
};

/**************************************/
D205ControlConsole.prototype.storePrefs = function storePrefs(prefs) {
    /* Stores the current panel preferences back to browser localStorage */

    localStorage["retro-205-ControlConsole-Prefs"] = JSON.stringify(prefs);
};

/**************************************/
D205ControlConsole.prototype.beforeUnload = function beforeUnload(ev) {
    var msg = "Closing this window will make the panel unusable.\n" +
              "Suggest you stay on the page and minimize this window instead";

    ev.preventDefault();
    ev.returnValue = msg;
    return msg;
};

/**************************************/
D205ControlConsole.prototype.setLampFromMask = function setLampFromMask(lamp, value) {
    var bit = value % 2;

    lamp.set(bit);
    return (value-bit)/2;
};

/**************************************/
D205ControlConsole.prototype.randomDisplay = function randomDisplay() {
    var lampMask = Math.floor(Math.random()*1024);

    this.regA.update(Math.random()*Math.random()*0x100000000000);
    this.regB.update(Math.random()*0x10000);
    this.regC.update(Math.random()*Math.random()*0x10000000000);
    this.regD.update(Math.random()*Math.random()*0x100000000000);
    this.regR.update(Math.random()*Math.random()*0x10000000000);

    lampMask = this.setLampFromMask(this.idleLamp, lampMask);
    lampMask = this.setLampFromMask(this.fcsaLamp, lampMask);
    lampMask = this.setLampFromMask(this.controlLamp, lampMask);
    lampMask = this.setLampFromMask(this.bkptLamp, lampMask);
    lampMask = this.setLampFromMask(this.overflowLamp, lampMask);
    lampMask = this.setLampFromMask(this.executeLamp, lampMask);
    lampMask = this.setLampFromMask(this.fetchLamp, lampMask);
    lampMask = this.setLampFromMask(this.notReadyLamp, lampMask);
    lampMask = this.setLampFromMask(this.continuousLamp, lampMask);
};

/**************************************/
D205ControlConsole.prototype.timeToLevel = function timeToLevel(id, elapsed) {
    /* Converts the timer value identified by "id" to a relative lamp intensity
    level based on the "elapsed" time (in word-times) */
    var lastTime = this.lastStats[id] || 0;
    var thisTime = this.stats[id] || 0;

    this.lastStats[id] = thisTime;
    if (elapsed > 0) {
        return (thisTime-lastTime)/elapsed;
    } else {
        return (thisTime > 0 ? 1 : 0);
    }
};

/**************************************/
D205ControlConsole.prototype.updatePanel = function updatePanel() {
    /* Updates the panel from the current Processor state */
    var elapsed;
    var eLevel;
    var p = this.p;                     // local copy of Processor object

    p.fetchStats(this.stats);
    elapsed = this.stats.drumTime - this.lastStats.drumTime;

    this.regA.update(p.A);
    this.regB.update(p.B);
    this.regC.update(p.C);
    this.regD.update(p.D);
    this.regR.update(p.R);

    this.idleLamp.set(p.poweredOn && p.stopIdle);
    this.fcsaLamp.set(p.stopForbidden || p.stopSector);
    this.controlLamp.set(p.stopControl);
    this.bkptLamp.set(p.stopBreakpoint);
    this.overflowLamp.set(p.poweredOn && this.timeToLevel("overflowTime", elapsed));

    eLevel = this.timeToLevel("executeTime", elapsed);
    this.executeLamp.set(p.poweredOn && eLevel);
    this.fetchLamp.set(p.poweredOn && (1-eLevel));

    this.notReadyLamp.set((p.sswLockNormal || p.sswStepContinuous) && p.poweredOn);
    this.continuousLamp.set((p.sswStepContinuous || p.cctContinuous) && p.poweredOn);

    if (p.togSTART != this.lastStartState) {
        this.lastStartState = p.togSTART;
        this.$$("TapeReaderLamp").className = "annunciator";
        this.$$("KeyboardLamp").className = "annunciator";
         if (p.togSTART) {
           switch (this.inputKnob.position) {
            case 0:                     // mechanical reader
            case 1:                     // optical reader
                this.$$("TapeReaderLamp").className = "annunciator annunciatorLit";
                break;
            case 2:                     // keyboard
                this.$$("KeyboardLamp").className = "annunciator annunciatorLit";
                break;
            } // switch inputKnob
        }
    }

    if (p.poweredOn != this.fastUpdateMode) {
        this.window.clearInterval(this.intervalToken);
        this.fastUpdateMode = p.poweredOn;
        this.intervalToken = this.window.setInterval(this.boundUpdatePanel,
            (p.poweredOn ? D205ControlConsole.displayRefreshPeriod : D205ControlConsole.slowRefreshPeriod));
    }

    this.lastStats.drumTime = this.stats.drumTime;
};

/**************************************/
D205ControlConsole.prototype.stepBtn_Click = function stepBtn_Click(ev) {
    if (this.intervalToken) {
        this.window.clearInterval(this.intervalToken);
        this.intervalToken = 0;
    }
    this.randomDisplay();
};

/**************************************/
D205ControlConsole.prototype.stopBtn_Click = function stopBtn_Click(ev) {
    if (this.intervalToken) {
        this.window.clearInterval(this.intervalToken);
        this.intervalToken = 0;
    }
};

/**************************************/
D205ControlConsole.prototype.contBtn_Click = function contBtn_Click(ev) {
    if (!this.intervalToken) {
        this.intervalToken = this.window.setInterval(D205Util.bindMethod(this, this.randomDisplay), D205ControlConsole.displayRefreshPeriod);
    }
    this.randomDisplay();
};

/**************************************/
D205ControlConsole.prototype.button_Click = function button_Click(ev) {
    /* Handler for button clicks */
    var ready = !(this.p.sswLockNormal || this.p.sswStepContinuous);

    if (this.p.poweredOn) {
        switch (ev.target.id) {
        case "ClearBtn":
            this.p.clear();
            break;
        case "ResetBtn":
            this.p.setOverflow(0);
            break;
        case "StepBtn":
            if (ready) {
                this.p.cctContinuous = 0;
                this.p.start();
            }
            break;
        case "StopBtn":
            if (ready) {
                this.p.stopControl = 1;
                this.p.cctContinuous = 0;
                this.p.stop();
            }
            break;
        case "ContBtn":
            if (ready) {
                this.p.cctContinuous = 1;
                this.p.togTiming = 0;   // to Execute
                this.p.start();
            }
            break;
        } // switch ev.target.it
        this.updatePanel();
    }
    ev.preventDefault();
    ev.stopPropagation();
    return false;
};

/**************************************/
D205ControlConsole.prototype.flipSwitch = function flipSwitch(ev) {
    /* Handler for switch & knob clicks */
    var prefs = this.loadPrefs();

    switch (ev.target.id) {
    case "AudibleAlarmSwitch":
        this.audibleAlarmSwitch.flip();
        prefs.audibleAlarmSwitch = this.p.sswAudibleAlarm =
            this.audibleAlarmSwitch.state;
        break;
    case "SkipSwitch":
        this.skipSwitch.flip();
        prefs.skipSwitch = this.p.cswSkip =
            this.skipSwitch.state;
        break;
    case "POSuppressSwitch":
        this.poSuppressSwitch.flip();
        prefs.poSuppressSwitch = this.p.cswPOSuppress =
            this.poSuppressSwitch.state;
        break;
    case "OutputKnob":
        // Output knob: 0=Off, 1=Page, 2=Tape
        this.outputKnob.step();
        prefs.outputKnob = this.p.cswOutput =
            this.outputKnob.position;
        break;
    case "InputKnob":
        // Input knob: 0=Mechanical reader, 1=Optical reader, 2=Keyboard
        this.inputKnob.step();
        prefs.inputKnob = this.p.cswInput =
            this.inputKnob.position;
        this.lastStartState = -1;       // force updatePanel to reevaluate the annunciators
        break;
    case "BreakpointKnob":
        // Breakpoint knob: 0=Off, 1, 2, 4
        this.breakpointKnob.step();
        prefs.breakpointKnob = this.p.cswBreakpoint =
            this.breakpointKnob.position;
        break;
    }

    this.storePrefs(prefs);
    this.updatePanel();
    ev.preventDefault();
    return false;
};

/**************************************/
D205ControlConsole.prototype.keypress = function keypress(ev) {
    /* Handles keyboard character events. Depending on whether there is an
    outstanding request for a keypress, returns a digit or finish pulse to the
    Processor, or discards the event altogether. Note that we have to do a little
    dance with the reference to the callback function, as the next digit can be
    solicited by the processor before the callback returns to this code, so the
    callback reference must be nullified before the call */
    var c = ev.charCode;
    var sender = this.digitSender;

    if (sender) {                       // if there is an outstanding digit request
        switch (c) {
        case 0x30:
        case 0x31:
        case 0x32:
        case 0x33:
        case 0x34:
        case 0x35:
        case 0x36:
        case 0x37:
        case 0x38:
        case 0x39:
            this.digitSender = null;
            ev.preventDefault();
            ev.stopPropagation();
            sender(c-0x30);
            break;
        case 0x0D:                      // Enter key
        case 0x46:                      // "F"
        case 0x66:                      // "f"
            this.digitSender = null;
            ev.preventDefault();
            ev.stopPropagation();
            sender(-1);
            break;
        case 0:                         // Firefox reports only graphic charCodes for keypress
            if (ev.keyCode == 0x0D) {   // check keyCode instead
                this.digitSender = null;
                ev.preventDefault();
                ev.stopPropagation();
                sender(-1);
            }
            break;
        } // switch c
    }
};


/**************************************/
D205ControlConsole.prototype.consoleOnLoad = function consoleOnLoad() {
    /* Initializes the line printer window and user interface */
    var body;
    var box;
    var e;
    var prefs = this.loadPrefs();
    var x;

    this.doc = this.window.document;
    body = this.$$("PanelSurface");

    // A Register
    this.regA = new PanelRegister(this.$$("ARegPanel"), 44, 4, "A_", "A REGISTER");
    this.regA.drawBox(1, 1, 4, "", "1px solid black");
    this.regA.drawBox(6, 2, 4, "1px dashed black", "1px dashed black");
    this.regA.lamps[43].setCaption("A-SG");
    for (x=1; x<=10; x++) {
        this.regA.lamps[43-x*4].setCaption("A-"+x);
    }

    // B Register
    this.regB = new PanelRegister(this.$$("BRegPanel"), 16, 4, "B_", "B REGISTER");
    for (x=1; x<=4; x++) {
        this.regB.lamps[19-x*4].setCaption("B-"+x);
    }

    // C Register
    this.regC = new PanelRegister(this.$$("CRegPanel"), 40, 4, "C_", "C REGISTER");
    box = this.regC.drawBox(1, 2, 4, "", "");
    this.regC.setBoxCaption(box, "ORDER");
    box = this.regC.drawBox(3, 4, 4, "1px solid black", "1px solid black");
    this.regC.setBoxCaption(box, "ADDRESS");
    box = this.regC.drawBox(7, 4, 4, "", "");
    this.regC.setBoxCaption(box, "CONTROL ADDRESS");

    // D Register
    this.regD = new PanelRegister(this.$$("DRegPanel"), 44, 4, "D_", "D REGISTER");
    this.regD.drawBox(1, 1, 4, "", "1px solid black");
    this.regD.drawBox(6, 2, 4, "1px dashed black", "1px dashed black");
    this.regD.lamps[43].setCaption("D-SG");
    for (x=1; x<=10; x++) {
        this.regD.lamps[43-x*4].setCaption("D-"+x);
    }

    // R Register
    this.regR = new PanelRegister(this.$$("RRegPanel"), 40, 4, "D_", "R REGISTER");
    this.regR.drawBox(1, 4, 4, "", "1px dashed black");
    for (x=1; x<=10; x++) {
        this.regR.lamps[43-x*4].setCaption("R-"+x);
    }

    // Colored Lamps

    this.idleLamp = new ColoredLamp(body, null, null, "IdleLamp", "redLamp", "redLit");
    this.fcsaLamp = new ColoredLamp(body, null, null, "FCSALamp", "orangeLamp", "orangeLit");
    this.controlLamp = new ColoredLamp(body, null, null, "ControlLamp", "orangeLamp", "orangeLit");
    this.bkptLamp = new ColoredLamp(body, null, null, "BKPTLamp", "orangeLamp", "orangeLit");

    this.overflowLamp = new ColoredLamp(body, null, null, "OverflowLamp", "redLamp", "redLit");

    this.executeLamp = new ColoredLamp(body, null, null, "ExecuteLamp", "whiteLamp", "whiteLit");
    this.fetchLamp = new ColoredLamp(body, null, null, "FetchLamp", "whiteLamp", "whiteLit");
    this.notReadyLamp = new ColoredLamp(body, null, null, "NotReadyLamp", "redLamp", "redLit");
    this.continuousLamp = new ColoredLamp(body, null, null, "ContinuousLamp", "greenLamp", "greenLit");

    // Switches & Knobs

    this.poSuppressSwitch = new ToggleSwitch(body, null, null, "POSuppressSwitch",
            D205ControlConsole.offSwitch, D205ControlConsole.onSwitch);
    this.poSuppressSwitch.set(this.p.cswPOSuppress = prefs.poSuppressSwitch);
    this.skipSwitch = new ToggleSwitch(body, null, null, "SkipSwitch",
            D205ControlConsole.offSwitch, D205ControlConsole.onSwitch);
    this.skipSwitch.set(this.p.cswSkip = prefs.skipSwitch);
    this.audibleAlarmSwitch = new ToggleSwitch(body, null, null, "AudibleAlarmSwitch",
            D205ControlConsole.offSwitch, D205ControlConsole.onSwitch);
    this.audibleAlarmSwitch.set(this.p.sswAudibleAlarm = prefs.audibleAlarmSwitch);

    this.outputKnob = new BlackControlKnob(body, null, null, "OutputKnob",
        prefs.outputKnob, [90, 115, 60]);
    this.breakpointKnob = new BlackControlKnob(body, null, null, "BreakpointKnob",
        prefs.breakpointKnob, [-40, -15, 15, 40]);
    this.inputKnob = new BlackControlKnob(body, null, null, "InputKnob",
        prefs.inputKnob, [300, 270, 240]);

    // Events

    this.window.addEventListener("keypress", this.boundKeypress);
    this.window.addEventListener("beforeunload", D205ControlConsole.prototype.beforeUnload);

    this.$$("ClearBtn").addEventListener("click", this.boundButton_Click);
    this.$$("ResetBtn").addEventListener("click", this.boundButton_Click);
    this.$$("StepBtn").addEventListener("click", this.boundButton_Click);
    this.$$("StopBtn").addEventListener("click", this.boundButton_Click);
    this.$$("ContBtn").addEventListener("click", this.boundButton_Click);

    this.$$("POSuppressSwitch").addEventListener("click", this.boundFlipSwitch);
    this.$$("SkipSwitch").addEventListener("click", this.boundFlipSwitch);
    this.$$("AudibleAlarmSwitch").addEventListener("click", this.boundFlipSwitch);
    this.$$("OutputKnob").addEventListener("click", this.boundFlipSwitch);
    this.$$("InputKnob").addEventListener("click", this.boundFlipSwitch);
    this.$$("BreakpointKnob").addEventListener("click", this.boundFlipSwitch);

    this.p.cswOutput = this.outputKnob.position;
    this.p.cswInput = this.inputKnob.position;
    this.p.cswBreakpoint = this.breakpointKnob.position;

    // Start the panel update in slow mode
    this.intervalToken = this.window.setInterval(this.boundUpdatePanel, D205ControlConsole.slowRefreshPeriod);
};

/**************************************/
D205ControlConsole.prototype.readDigit = function readDigit(digitSender) {
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
D205ControlConsole.prototype.writeFormatDigit = function writeFormatDigit(formatDigit, successor) {
    this.consoleOut.writeFormatDigit(this.outputKnob.position, formatDigit, successor);
};

/**************************************/
D205ControlConsole.prototype.writeSignDigit = function writeSignDigit(signDigit, successor) {
    this.consoleOut.writeSignDigit(this.outputKnob.position, signDigit, successor);
};

/**************************************/
D205ControlConsole.prototype.writeNumberDigit = function writeNumberDigit(digit, successor) {
    this.consoleOut.writeNumberDigit(this.outputKnob.position, digit, successor);
};

/**************************************/
D205ControlConsole.prototype.writeFinish = function writeFinish(controlDigit, successor) {
    this.consoleOut.writeFinish(this.outputKnob.position, controlDigit, successor);
};

/**************************************/
D205ControlConsole.prototype.shutDown = function shutDown() {
    /* Shuts down the panel */

    if (this.intervalToken) {
        this.window.clearInterval(this.intervalToken);
    }
    if (this.consoleIn) {
        this.consoleIn.shutDown();
        this.consoleIn = null;
    }
    if (this.consoleOut) {
        this.consoleOut.shutDown();
        this.consoleOut = null;
    }
    this.window.removeEventListener("beforeunload", D205ControlConsole.prototype.beforeUnload);
    this.window.close();
};