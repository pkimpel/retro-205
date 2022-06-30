/***********************************************************************
* retro-205/webUI D205SupervisoryPanel.js
************************************************************************
* Copyright (c) 2014, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* ElectroData/Burroughs Datatron 205 Supervisory Control Panel object.
************************************************************************
* 2014-11-01  P.Kimpel
*   Original version, from D205ControlConsole.html prototype.
***********************************************************************/
"use strict";

/**************************************/
function D205SupervisoryPanel(p, systemShutdown) {
    /* Constructor for the SupervisoryPanel object */
    var h = 584;
    var w = 1180;
    var mnemonic = "SupervisoryPanel";

    this.config = p.config;             // System Configuration object
    this.intervalToken = 0;             // setInterval() token
    this.p = p;                         // D205Processor object
    this.systemShutdown = systemShutdown; // system shut-down callback
    this.alarming = false;              // True if alarm is currently sounding
    this.alarmSound = null;             // Alarm sound element on the page

    this.boundLamp_Click = D205SupervisoryPanel.prototype.lamp_Click.bind(this);
    this.boundMeatballMemdump = D205SupervisoryPanel.prototype.meatballMemdump.bind(this);
    this.boundPowerBtn_Click = D205SupervisoryPanel.prototype.powerBtn_Click.bind(this);
    this.boundClear_Click = D205SupervisoryPanel.prototype.clear_Click.bind(this);
    this.boundFlipSwitch = D205SupervisoryPanel.prototype.flipSwitch.bind(this);
    this.boundStartBtn_Click = D205SupervisoryPanel.prototype.startBtn_Click.bind(this);
    this.boundUpdatePanel = D205SupervisoryPanel.prototype.updatePanel.bind(this);

    this.doc = null;
    this.window = null;
    D205Util.openPopup(window, "../webUI/D205SupervisoryPanel.html", mnemonic,
            "location=no,scrollbars,resizable,width=" + w + ",height=" + h +
            ",top=0,left=" + (screen.availWidth - w),
        this, D205SupervisoryPanel.prototype.consoleOnLoad);
}

/**************************************/
D205SupervisoryPanel.displayRefreshPeriod = 50;   // milliseconds
D205SupervisoryPanel.offSwitchImage = "./resources/ToggleDown.png";
D205SupervisoryPanel.onSwitchImage = "./resources/ToggleUp.png";

D205SupervisoryPanel.codeXlate = [      // translate internal 205 code to ANSI
        " ", "_", " ", ".", "\u00A4", "_",  "_",  "_", "_", "_", "!", "!", "!", "!", "!", "!",  // 00-0F
        "&", "_", "_", "$", "*",      "^",  "~",  "_", "_", "_", "!", "!", "!", "!", "!", "!",  // 10-1F
        "-", "/", "_", ",", "%",      "_",  "|",  "_", "_", "_", "!", "!", "!", "!", "!", "!",  // 20-2F
        "_", "_", "_", "#", "@",      "\\", "_",  "_", "_", "_", "!", "!", "!", "!", "!", "!",  // 30-3F
        "_", "A", "B", "C", "D",      "E",  "F",  "G", "H", "I", "!", "!", "!", "!", "!", "!",  // 40-4F
        "_", "J", "K", "L", "M",      "N",  "O",  "P", "Q", "R", "!", "!", "!", "!", "!", "!",  // 50-5F
        "_", "_", "S", "T", "U",      "V",  "W",  "X", "Y", "Z", "!", "!", "!", "!", "!", "!",  // 60-6F
        "_", "_", "_", "_", "_",      "_",  "_",  "_", "_", "_", "!", "!", "!", "!", "!", "!",  // 70-7F
        "0", "1", "2", "3", "4",      "5",  "6",  "7", "8", "9", "!", "!", "!", "!", "!", "!",  // 80-8F
        "_", "_", "_", "_", "_",      "_",  "_",  "_", "_", "_", "!", "!", "!", "!", "!", "!",  // 90-9F
        "!", "!", "!", "!", "!",      "!",  "!",  "!", "!", "!", "!", "!", "!", "!", "!", "!",  // A0-AF
        "!", "!", "!", "!", "!",      "!",  "!",  "!", "!", "!", "!", "!", "!", "!", "!", "!",  // B0-BF
        "!", "!", "!", "!", "!",      "!",  "!",  "!", "!", "!", "!", "!", "!", "!", "!", "!",  // C0-CF
        "!", "!", "!", "!", "!",      "!",  "!",  "!", "!", "!", "!", "!", "!", "!", "!", "!",  // D0-DF
        "!", "!", "!", "!", "!",      "!",  "!",  "!", "!", "!", "!", "!", "!", "!", "!", "!",  // E0-EF
        "!", "!", "!", "!", "!",      "!",  "!",  "!", "!", "!", "!", "!", "!", "!", "!", "!"]; // F0-FF

/**************************************/
D205SupervisoryPanel.prototype.$$ = function $$(e) {
    return this.doc.getElementById(e);
};

/**************************************/
D205SupervisoryPanel.prototype.powerOnSystem = function powerOnSystem() {
    /* Powers on the system */

    if (!this.p.poweredOn) {
        this.p.powerUp();
        this.powerLamp.set(1);
        this.window.focus();
        if (!this.intervalToken) {
            this.intervalToken = this.window.setInterval(this.boundUpdatePanel, D205SupervisoryPanel.displayRefreshPeriod);
        }
    }
};

/**************************************/
D205SupervisoryPanel.prototype.powerOffSystem = function powerOffSystem() {
    /* Powers off the system */

    if (this.p.poweredOn) {
        this.systemShutdown();
        this.powerLamp.set(0);
        if (this.intervalToken) {       // if the display auto-update is running
            this.window.clearInterval(this.intervalToken);  // kill it
            this.intervalToken = 0;
        }
    }
};

/**************************************/
D205SupervisoryPanel.prototype.beforeUnload = function beforeUnload(ev) {
    var msg = "Closing this window will make the panel unusable.\n" +
              "Suggest you stay on the page and minimize this window instead";

    ev.preventDefault();
    ev.returnValue = msg;
    return msg;
};

/**************************************/
D205SupervisoryPanel.prototype.meatballMemdump = function meatballMemdump() {
    /* Opens a temporary window and formats the current processor and memory
    state to it */
    var doc = null;                     // dump window.document
    var p = this.p;                     // local copy of Processor object
    var paper = null;                   // <pre> element to receive dump lines
    var trimRightRex = /[\s\uFEFF\xA0]+$/;
    var win = null;                     // dump window
    var xlate = D205SupervisoryPanel.codeXlate; // local copy

    function formatWord(w) {
        /* Formats a 205 numeric word as "S DDDDDDDDDD" and returns it */
        var s = padBCD(w, 11);

        return s.substring(0, 1) + " " + s.substring(1);
    }

    function padBCD(value, digits) {
        /* Formats "value" as a BCD number of "digits" length, left-padding with
        zeroes as necessary */
        var text = value.toString(16);

        if (value < 0) {
            return text;
        } else {
            return padLeft(text, digits, "0");
        }
    }

    function padLeft(text, minLength, c) {
        /* Pads "text" on the left to a total length of "minLength" with "c" */
        var s = text.toString();
        var len = s.length;
        var pad = c || " ";

        while (len++ < minLength) {
            s = pad + s;
        }
        return s;
    }

    function trimRight(text) {
        /* Returns the string with all terminating whitespace removed from "text" */

        return text.replace(trimRightRex, '');
    }

    function wordToANSI(value) {
        /* Converts the "value" as a 205 word to a five-character string and returns it */
        var c;                              // current character
        var s = "";                         // working string value
        var w = value;                      // working word value
        var x;                              // character counter

        for (x=0; x<5; ++x) {
            c = w % 256;
            w = (w-c)/256;
            s = xlate[c] + s;
        }

        return s;
    }

    function writer(text) {
        /* Outputs one line of text to the dump window */

        paper.appendChild(doc.createTextNode(trimRight(text) + "\n"));
    }

    function dumpProcessorState() {
        /* Dumps the register state for the Processor */
        var s = "";
        var x = 0;

        writer("");
        writer("Processor:  A: " + formatWord(p.A) + "   R: " + formatWord(p.R));
        writer("");
        s = padBCD(p.C, 10);
        s = s.substring(0, 2) + " " + s.substring(2, 6) + " " + s.substring(6);
        writer("            D: " + formatWord(p.D) + "   B: " + padBCD(p.B, 4) + "   C: " + s);
        writer("");
        writer("        ADDER: " + padBCD(p.ADDER, 1) + "  CT: " + padBCD(p.CT, 2) +
               "      SPECIAL: " + padBCD(p.SPECIAL, 1) + "   SHIFT: " + padBCD(p.SHIFT, 2));

        writer("");
        s = "Supervisory Panel:";
        if (p.sswAudibleAlarm) {s += " Audible-Alarm"}
        s += (p.sswLockNormal ? " Lock" : " Normal");
        s += (p.sswStepContinuous ? " Continuous" : " Step");
        writer(s);

        s = "Control Console:  ";
        s += " Output="
        switch (p.cswOutput) {
            case 1: s += "Page"; break;
            case 2: s += "Tape"; break;
            default:s += "Off"; break;
        }

        if (p.cswPOSuppress)         {s += " P.O.Suppress"}
        if (p.cswSkip)               {s += " Skip"}
        s += " Breakpoint=";
        switch (p.cswBreakpoint) {
            case 4: s += "4"; break;
            case 2: s += "2"; break;
            case 1: s += "1"; break;
            default:s += "Off";
        }

        if (p.cswAudibleAlarm)       {s += " Audible-Alarm"}
        s += " Input=";
        switch (p.cswInput) {
            case 1: s += "Optical"; break;
            case 2: s += "Keyboard"; break;
            default:s += "Mechanical"; break;
        }

        writer(s);
        writer("Mag Tape Suppress-B: " + (p.tswSuppressB ? "On" : "Off"));
    }

    function dumpMemory(mod, base, start, top) {
        /* Routine to dump main memory or one of the loops */
        var addr = 0;
        var dupCount = 0;
        var lastLine = "";
        var line = "";
        var x = 0;                      // image data index

        function dumpDupes() {
            /* Outputs the duplicate-line message, if any */

            if (dupCount > 0) {
                writer("....  ..... DUP FOR " + dupCount + " LINE" + (dupCount>1 ? "S" : "") +
                       " THRU " + padLeft(base+addr-1, 4, "0") + " .....");
                dupCount = 0;
            }
        }

        writer("");
        addr = start;
        while (addr <= top) {
            // Format the next five words
            line = "";
            for (x=0; x<5; ++x) {
                line += "  " + formatWord(mod[addr+x]);
            } // for x

            // Check for duplicate lines; write a non-duplicate
            if (line == lastLine) {
                ++dupCount;
            } else {
                dumpDupes();
                lastLine = line;
                line = padLeft(base+addr, 4, "0") + line + "  ";
                for (x=0; x<5; ++x) {
                    line += wordToANSI(mod[addr+x]);
                } // for x

                writer(line);
            }

            addr += 5;
        } // for addr

        dumpDupes();
    }

    function memdumpDriver() {
        /* Driver for formatting the memory and Processor state dump */

        while (paper.firstChild) {               // delete any existing <pre> content
            paper.removeChild(paper.firstChild);
        }

        writer("retro-205 Processor State and Memory Dump : " + new Date().toString());

        dumpProcessorState();

        // Dump all of memory
        writer("");
        writer("Memory: ");
        dumpMemory(p.MM, 0, 0, 3999);
        dumpMemory(p.L4, 4000, 0, 19);
        dumpMemory(p.L5, 5000, 0, 19);
        dumpMemory(p.L6, 6000, 0, 19);
        dumpMemory(p.L7, 7000, 0, 19);
        writer("");
        writer("End dump");
    }

    function memdumpSetup(ev) {
        /* Loads a status message into the "paper" rendering area, then calls
        dumpDriver after a short wait to allow the message to appear */

        doc = ev.target;
        win = doc.defaultView
        doc.title = "retro-205 Console: Meatball Memdump";
        win.moveTo((screen.availWidth-win.outerWidth)/2, (screen.availHeight-win.outerHeight)/2);
        paper = doc.getElementById("Paper");
        writer("Rendering the dump... please wait...");
        setTimeout(memdumpDriver, 50);
        win.focus();
    }

    // Outer block of meatBallMemdump
    D205Util.openPopup(window, "./D205FramePaper.html", "",
            "location=no,scrollbars=yes,resizable,width=800,height=600",
            this, memdumpSetup);
};

/**************************************/
D205SupervisoryPanel.prototype.displayCallbackState = function displayCallbackState() {
    /* Builds a table of outstanding callback state */
    var cb;
    var cbs;
    var e;
    var body = document.createElement("tbody");
    var oldBody = this.$$("CallbackBody");
    var row;
    var state = getCallbackState(0x03);
    var token;

    cbs = state.delayDev;
    for (token in cbs) {
        row = document.createElement("tr");

        e = document.createElement("td");
        e.appendChild(document.createTextNode(token));
        row.appendChild(e);

        e = document.createElement("td");
        e.appendChild(document.createTextNode((cbs[token]||0).toFixed(2)));
        row.appendChild(e);

        e = document.createElement("td");
        e.colSpan = 2;
        row.appendChild(e);
        body.appendChild(row);
    }

    cbs = state.pendingCallbacks;
    for (token in cbs) {
        cb = cbs[token];
        row = document.createElement("tr");

        e = document.createElement("td");
        e.appendChild(document.createTextNode(token.toString()));
        row.appendChild(e);

        e = document.createElement("td");
        e.appendChild(document.createTextNode(cb.delay.toFixed(2)));
        row.appendChild(e);

        e = document.createElement("td");
        e.appendChild(document.createTextNode((cb.context && cb.context.mnemonic) || "??"));
        row.appendChild(e);

        e = document.createElement("td");
        e.appendChild(document.createTextNode((cb.args ? cb.args.length : 0).toString()));
        row.appendChild(e);
        body.appendChild(row);
    }

    body.id = oldBody.id;
    oldBody.parentNode.replaceChild(body, oldBody);
};

/**************************************/
D205SupervisoryPanel.prototype.updatePanel = function updatePanel() {
    /* Updates the panel from the current Processor state */
    var eLevel;
    var p = this.p;                     // local copy of Processor object
    var tg = p.toggleGlow;

    eLevel = (p.stopIdle ? p.togTiming : tg.glowTiming);

    this.regA.updateLampGlow(tg.glowA);
    this.regB.updateLampGlow(tg.glowB);
    this.regC.updateLampGlow(tg.glowC);
    this.regD.updateLampGlow(tg.glowD);
    this.regR.updateLampGlow(tg.glowR);
    this.control.updateLampGlow(tg.glowCtl);

    this.regAdder.updateLampGlow(tg.glowADDER);
    this.regCarry.updateLampGlow(tg.glowCT);

    this.cardatronTWA.set(tg.glowTWA);
    this.cardatron3IO.set(tg.glow3IO);

    this.overflowLamp.set(p.poweredOn && tg.glowOverflow);
    this.sectorLamp.set(p.stopSector);
    this.fcLamp.set(p.stopForbidden);
    this.controlLamp.set(p.stopControl);
    this.idleLamp.set(p.poweredOn && p.stopIdle);

    this.executeLamp.set(p.poweredOn && (1-eLevel));
    this.fetchLamp.set(p.poweredOn && eLevel);

    this.mainLamp.set(tg.glowMAIN);
    this.rwmLamp.set(tg.glowRWM);
    this.rwlLamp.set(tg.glowRWL);
    this.wdblLamp.set(tg.glowWDBL);
    this.actLamp.set(tg.glowACTION);
    this.accessLamp.set(tg.glowACCESS);
    this.lmLamp.set(tg.glowLM);
    this.l4Lamp.set(tg.glowL4);
    this.l5Lamp.set(tg.glowL5);
    this.l6Lamp.set(tg.glowL6);
    this.l7Lamp.set(tg.glowL7);

    // Control the audible alarm
    if (p.sswAudibleAlarm && p.cswAudibleAlarm) {
        if (p.stopControl || p.stopOverflow || p.stopBreakpoint || p.stopForbidden || p.stopSector) {
            if (!this.alarming) {
                this.alarming = true;
                this.alarmSound.play();
            }
        } else {
            if (this.alarming) {
                this.alarming = false;
                this.alarmSound.pause();
            }
        }
    } else if (this.alarming) {
        this.alarming = false;
        this.alarmSound.pause();
    }

    /********** DEBUG **********
    this.$$("ProcDelta").value = p.procSlackAvg.toFixed(2);
    this.$$("LastLatency").value = p.delayDeltaAvg.toFixed(2);
    this.displayCallbackState();
    ***************************/
};

/**************************************/
D205SupervisoryPanel.prototype.lamp_Click = function lamp_Click(ev) {
    /* Handles the click event within panels. Determines which lamp element was
    clicked, flips the state of the corresponding toggle in the Processor, and
    refreshes the lamp element */
    var bit;                            // bit number extracted from the id
    var id = ev.target.id;              // id of the element clicked
    var ix = id.indexOf("_");           // offset of the "_" delimiter in the id
    var p = this.p;                     // local copy of processor object
    var reg;                            // register prefix from id

    if (p.poweredOn) {
        if (ix < 0) {
            reg = id;
            bit = 0;
        } else if (ix > 0) {
            reg = id.substring(0, ix);
            bit = parseInt(id.substring(ix+1)) || 0;
        }

        switch (reg) {
        case "A":
            p.A = D205Processor.bitFlip(p.A, bit);
            this.regA.update(p.A);
            break;
        case "B":
            p.B = D205Processor.bitFlip(p.B, bit);
            this.regB.update(p.B);
            break;
        case "C":
            p.C = D205Processor.bitFlip(p.C, bit);
            this.regC.update(p.C);
            break;
        case "D":
            p.D = D205Processor.bitFlip(p.D, bit);
            this.regD.update(p.D);
            break;
        case "R":
            p.R = D205Processor.bitFlip(p.R, bit);
            this.regR.update(p.R);
            break;
        case "ADD":
            p.ADDER = D205Processor.bitFlip(p.ADDER, bit);
            this.regAdder.update(p.ADDER);
            break;
        case "CT":
            p.CT = D205Processor.bitFlip(p.CT, bit);
            this.regCarry.update(p.CT);
            break;
        case "TWA":
            p.togTWA ^= 1;
            this.cardatronTWA.set(p.togTWA);
            break;
        case "3IO":
            p.tog3IO ^= 1;
            this.cardatron3IO.set(p.tog3IO);
            break;
        case "CTL":
            switch (bit) {
            case 0:
            case 1:
            case 2:
            case 3:
            case 4:
                p.SHIFT = D205Processor.bitFlip(p.SHIFT, bit);
                break;
            case 5:
                p.togMT1BV5 ^= 1;
                break;
            case 6:
                p.togMT1BV4 ^= 1;
                break;
            case 7:
                p.togMT3P ^= 1;
                break;
            case 8:
            case 9:
            case 10:
            case 11:
                p.SHIFTCONTROL = D205Processor.bitFlip(p.SHIFTCONTROL, bit-8);
                break;
            case 12:
                p.togASYNC ^= 1;
                break;
            case 13:
                p.togZCT ^= 1;
                break;
            case 14:
                p.togBKPT ^= 1;
                break;
            case 15:
                p.togT0 ^= 1;
                break;
            case 16:
                p.togDELAY ^= 1;
                break;
            case 17:
                p.togPO2 ^= 1;
                break;
            case 18:
                p.togPO1 ^= 1;
                break;
            case 19:
                p.togOK ^= 1;
                break;
            case 20:
                p.togTC2 ^= 1;
                break;
            case 21:
                p.togTC1 ^= 1;
                break;
            case 22:
                p.togTF ^= 1;
                break;
            case 23:
                p.togSTART ^= 1;
                break;
            case 24:
                p.togSTEP ^= 1;
                break;
            case 25:
                p.togDIVALARM ^= 1;
                break;
            case 26:
                p.togCOUNT ^= 1;
                break;
            case 27:
                p.togSIGN ^= 1;
                break;
            case 28:
                p.togMULDIV ^= 1;
                break;
            case 29:
                p.togCLEAR ^= 1;
                break;
            case 30:
                p.togPLUSAB ^= 1;
                break;
            case 31:
                p.togCOMPL ^= 1;
                break;
            case 32:
                p.togDELTABDIV ^= 1;
                break;
            case 33:
                p.togDPCTR ^= 1;
                break;
            case 34:
                p.togADDER ^= 1;
                break;
            case 35:
                p.togBTOAIN ^= 1;
                break;
            case 36:
            case 37:
            case 38:
            case 39:
                p.SPECIAL = D205Processor.bitFlip(p.SPECIAL, bit-36);
                break;
            } // switch bit

            break;
        } // switch reg
    }

    ev.preventDefault();
    ev.stopPropagation();
    return false;
};

/**************************************/
D205SupervisoryPanel.prototype.clear_Click = function Clear_Click(ev) {
    /* Event handler for the various clear/reset buttons on the panel */

    if (this.p.poweredOn) {
        switch (ev.target.id) {
        case "ClearBtn":
            this.p.clear();
            break;
        case "ClearARegBtn":
            this.p.A = 0;
            break;
        case "ClearBRegBtn":
            this.p.B = 0;
            break;
        case "ClearCRegBtn":
            this.p.C = 0;
            break;
        case "ClearDRegBtn":
            this.p.D = 0;
            break;
        case "ClearRRegBtn":
            this.p.R = 0;
            break;
        case "ClearControlBtn":
            this.p.clearControl();
            break;
        case "ResetOverflowBtn":
            this.p.setOverflow(0);
            break;
        case "ResetSectorBtn":
            this.p.stopSector = 0;
            break;
        case "ResetControlBtn":
            this.p.stopControl = 0;
            break;
        case "ExecuteBtn":
            this.p.setTimingToggle(0);
            break;
        case "FetchBtn":
            this.p.setTimingToggle(1 - this.p.sswLockNormal);
            break;
        }
        this.updatePanel();
    }
    ev.preventDefault();
    return false;
};

/**************************************/
D205SupervisoryPanel.prototype.powerBtn_Click = function powerBtn_Click(ev) {
    /* Handler for the START button: begins execution for the current cycle */

    switch(ev.target.id) {
    case "PowerOffBtn":
        this.powerOffSystem();
        break;
    case "PowerOnBtn":
        this.powerOnSystem();
        break;
    }
    this.updatePanel();
    ev.preventDefault();
    return false;
};

/**************************************/
D205SupervisoryPanel.prototype.startBtn_Click = function startBtn_Click(ev) {
    /* Handler for the START button: begins execution for the current cycle */

    this.p.start();
    this.updatePanel();
    ev.preventDefault();
    return false;
};

/**************************************/
D205SupervisoryPanel.prototype.flipSwitch = function flipSwitch(ev) {
    /* Handler for switch & knob clicks */

    switch (ev.target.id) {
    case "AudibleAlarmSwitch":
        this.audibleAlarmSwitch.flip();
        this.config.putNode("SupervisoryPanel.audibleAlarmSwitch",
                this.p.sswAudibleAlarm = this.audibleAlarmSwitch.state);
        break;
    case "LockNormalSwitch":
        this.lockNormalSwitch.flip();
        this.config.putNode("SupervisoryPanel.lockNormalSwitch",
                this.p.sswLockNormal = this.lockNormalSwitch.state);
        break;
    case "StepContinuousSwitch":
        this.stepContinuousSwitch.flip();
        this.config.putNode("SupervisoryPanel.stepContinuousSwitch",
                this.p.sswStepContinuous = this.stepContinuousSwitch.state);
        break;
    case "PulseSourceSwitch":           // non-functional, just turn it back off
        this.pulseSourceSwitch.flip();
        this.config.putNode("SupervisoryPanel.pulseSourceSwitch", 0);
        setCallback(null, this.pulseSourceSwitch, 250, this.pulseSourceSwitch.set, 0);
        break;
    case "WordContSwitch":              // non-functional, just turn it back off
        this.wordContSwitch.flip();
        this.config.putNode("SupervisoryPanel.wordContSwitch", 0);
        setCallback(null, this.wordContSwitch, 250, this.wordContSwitch.set, 0);
        break;
    case "FrequencyKnob":               // non-functional knob -- just step it
        this.frequencyKnob.step();
        this.config.putNode("SupervisoryPanel.frequencyKnob", this.frequencyKnob.position);
        break;
    }

    this.updatePanel();
    ev.preventDefault();
    return false;
};

/**************************************/
D205SupervisoryPanel.prototype.consoleOnLoad = function consoleOnLoad(ev) {
    /* Initializes the Supervisory Panel window and user interface */
    var adderDiv;
    var body;
    var box;
    var controlDiv;
    var cx;
    var cy;
    var e;
    var prefs = this.config.getNode("SupervisoryPanel");
    var x;

    this.doc = ev.target;
    this.window = this.doc.defaultView;
    body = this.$$("PanelSurface");
    adderDiv = this.$$("AdderDiv");
    controlDiv = this.$$("ControlDiv");

    // A Register
    this.regA = new PanelRegister(this.$$("ARegPanel"), 44, 4, "A_", "A REGISTER");
    this.regA.drawBox(1, 1, 4, "", "1px solid black");
    this.regA.drawBox(6, 2, 4, "1px dashed black", "1px dashed black");
    this.regA.lamps[43].setCaption("A-SG");
    for (x=1; x<=10; x++) {
        this.regA.lamps[43-x*4].setCaption("A-"+x);
    }

    // Adder Panel //

    // B Register
    this.regB = new PanelRegister(this.$$("BRegPanel"), 16, 4, "B_", "B REGISTER");
    for (x=1; x<=4; x++) {
        this.regB.lamps[19-x*4].setCaption("B-"+x);
    }

    // Cardatron Control
    cx = 5*PanelRegister.hSpacing + PanelRegister.hOffset;
    cy = PanelRegister.vOffset;
    this.cardatronTWA = new NeonLamp(adderDiv, cx, cy, "TWA");
    this.cardatronTWA.setCaption("CARDATRON CONTROL");
    this.cardatronTWA.setCaption("TWA", true);
    this.cardatron3IO = new NeonLamp(adderDiv, cx, cy+PanelRegister.vSpacing, "3IO");
    this.cardatron3IO.setCaption("3IO", true);

    // Carry Control
    this.regCarry = new PanelRegister(this.$$("CarryPanel"), 5, 5, "CT_", null);
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
    this.regAdder = new PanelRegister(this.$$("AdderPanel"), 4, 4, "ADD_", null);
    this.regAdder.lamps[3].setCaption("ADDER COL");
    cx = 1;
    for (x=0; x<4; ++x) {
        this.regAdder.lamps[x].setCaption(cx.toString(), true);
        cx *= 2;
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
    this.regR = new PanelRegister(this.$$("RRegPanel"), 40, 4, "R_", "R REGISTER");
    this.regR.drawBox(1, 4, 4, "", "1px dashed black");
    for (x=1; x<=10; x++) {
        this.regR.lamps[43-x*4].setCaption("R-"+x);
    }

    // Control Toggles Panel
    this.control = new PanelRegister(controlDiv, 40, 4, "CTL_", "CONTROL");
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
    this.control.lamps[ 6].setCaption("18V4", true);
    this.control.lamps[ 5].setCaption("18V5", true);
    this.control.lamps[ 4].setCaption("10", true);

    this.control.lamps[11].setCaption("SHIFT CONTROL");
    this.control.lamps[11].setCaption("1", true);
    this.control.lamps[10].setCaption("2", true);
    this.control.lamps[ 9].setCaption("3", true);
    this.control.lamps[ 8].setCaption("4", true);

    this.control.lamps[15].setCaption("CENTRAL CONTROL");
    this.control.lamps[15].setCaption("T0", true);
    this.control.lamps[14].setCaption("BKPT", true);
    this.control.lamps[13].setCaption("ZCT", true);
    this.control.lamps[12].setCaption("ASYNC", true);

    this.control.lamps[19].setCaption("OUTPUT CONTROL");
    this.control.lamps[19].setCaption("OK", true);
    this.control.lamps[18].setCaption("PO 1", true);
    this.control.lamps[17].setCaption("PO 2", true);
    this.control.lamps[16].setCaption("DELAY", true);

    this.control.lamps[23].setCaption("INPUT CONTROL");
    this.control.lamps[23].setCaption("START", true);
    this.control.lamps[22].setCaption("TF", true);
    this.control.lamps[21].setCaption("TC 1", true);
    this.control.lamps[20].setCaption("TC 2", true);

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
    this.control.lamps[32].setCaption("\u0394B, \u00F7", true); // delta, division signs

    this.control.lamps[39].setCaption("SPECIAL CTR");
    this.control.lamps[39].setCaption("8", true);
    this.control.lamps[38].setCaption("4", true);
    this.control.lamps[37].setCaption("2", true);
    this.control.lamps[36].setCaption("1", true);

    // Colored Lamps

    this.t8Lamp = new ColoredLamp(body, null, null, "T8Lamp", "whiteLamp", "whiteLit");
    this.t4Lamp = new ColoredLamp(body, null, null, "T4Lamp", "whiteLamp", "whiteLit");
    this.t2Lamp = new ColoredLamp(body, null, null, "T2Lamp", "whiteLamp", "whiteLit");
    this.t1Lamp = new ColoredLamp(body, null, null, "T1Lamp", "whiteLamp", "whiteLit");
    this.singleWordLamp = new ColoredLamp(body, null, null, "SingleWordLamp", "whiteLamp", "whiteLit");

    this.powerLamp = new ColoredLamp(body, null, null, "PowerLamp", "greenLamp", "greenLit");

    this.overflowLamp = new ColoredLamp(body, null, null, "OverflowLamp", "redLamp", "redLit");

    this.sectorLamp = new ColoredLamp(body, null, null, "SectorLamp", "whiteLamp", "whiteLit");
    this.controlLamp = new ColoredLamp(body, null, null, "ControlLamp", "orangeLamp", "orangeLit");
    this.fcLamp = new ColoredLamp(body, null, null, "FCLamp", "whiteLamp", "whiteLit");
    this.idleLamp = new ColoredLamp(body, null, null, "IdleLamp", "redLamp", "redLit");

    this.executeLamp = new ColoredLamp(body, null, null, "ExecuteLamp", "whiteLamp", "whiteLit");
    this.fetchLamp = new ColoredLamp(body, null, null, "FetchLamp", "whiteLamp", "whiteLit");

    this.mainLamp = new ColoredLamp(body, null, null, "MAINLamp", "whiteLamp", "whiteLit");
    this.rwmLamp = new ColoredLamp(body, null, null, "RWMLamp", "whiteLamp", "whiteLit");
    this.rwlLamp = new ColoredLamp(body, null, null, "RWLLamp", "whiteLamp", "whiteLit");
    this.wdblLamp = new ColoredLamp(body, null, null, "WDBLLamp", "whiteLamp", "whiteLit");
    this.actLamp = new ColoredLamp(body, null, null, "ACTLamp", "whiteLamp", "whiteLit");
    this.accessLamp = new ColoredLamp(body, null, null, "ACCESSLamp", "whiteLamp", "whiteLit");
    this.lmLamp = new ColoredLamp(body, null, null, "LMLamp", "whiteLamp", "whiteLit");
    this.l7Lamp = new ColoredLamp(body, null, null, "L7Lamp", "whiteLamp", "whiteLit");
    this.l6Lamp = new ColoredLamp(body, null, null, "L6Lamp", "whiteLamp", "whiteLit");
    this.l5Lamp = new ColoredLamp(body, null, null, "L5Lamp", "whiteLamp", "whiteLit");
    this.l4Lamp = new ColoredLamp(body, null, null, "L4Lamp", "whiteLamp", "whiteLit");

    // Switches & Knobs

    this.pulseSourceSwitch = new ToggleSwitch(body, null, null, "PulseSourceSwitch",
            D205SupervisoryPanel.offSwitchImage, D205SupervisoryPanel.onSwitchImage);
    this.pulseSourceSwitch.set(prefs.pulseSourceSwitch);
    this.wordContSwitch = new ToggleSwitch(body, null, null, "WordContSwitch",
            D205SupervisoryPanel.offSwitchImage, D205SupervisoryPanel.onSwitchImage);
    this.wordContSwitch.set(prefs.wordContSwitch);
    this.frequencyKnob = new BlackControlKnob(body, null, null, "FrequencyKnob",
        prefs.frequencyKnob, [-60, -30, 0, 30, 60]);

    this.lockNormalSwitch = new ToggleSwitch(body, null, null, "LockNormalSwitch",
            D205SupervisoryPanel.offSwitchImage, D205SupervisoryPanel.onSwitchImage);
    this.lockNormalSwitch.set(this.p.sswLockNormal = prefs.lockNormalSwitch);
    this.stepContinuousSwitch = new ToggleSwitch(body, null, null, "StepContinuousSwitch",
            D205SupervisoryPanel.offSwitchImage, D205SupervisoryPanel.onSwitchImage);
    this.stepContinuousSwitch.set(this.p.sswStepContinuous = prefs.stepContinuousSwitch);

    // Note that the Audible Alarm switch on the Supervisory Panel is unconditionally
    // set to DISABLED and not restored from the setting in prefs. The corresponding
    // switch on the Control Console IS restored from prefs, however. The reasons for
    // this are (a) to avoid generating sound unless the user really wants to hear it,
    // but more importantly, (b) since about 2019, the major browsers inhibit <audio>
    // play unless the user has interacted with the page in some fashion, e.g., by means
    // of a mouse click. Thus a user clicking the Audible Alarm switch to change it from
    // DISABLED to ON will satisfy this requirement.

    this.audibleAlarmSwitch = new ToggleSwitch(body, null, null, "AudibleAlarmSwitch",
            D205SupervisoryPanel.offSwitchImage, D205SupervisoryPanel.onSwitchImage);
    this.audibleAlarmSwitch.set(this.p.sswAudibleAlarm = 0);

    // Events

    this.$$("ClearBtn").addEventListener("click", this.boundClear_Click);
    this.$$("ClearARegBtn").addEventListener("click", this.boundClear_Click);
    this.$$("ClearBRegBtn").addEventListener("click", this.boundClear_Click);
    this.$$("ClearCRegBtn").addEventListener("click", this.boundClear_Click);
    this.$$("ClearDRegBtn").addEventListener("click", this.boundClear_Click);
    this.$$("ClearRRegBtn").addEventListener("click", this.boundClear_Click);
    this.$$("ClearControlBtn").addEventListener("click", this.boundClear_Click);
    this.$$("ResetOverflowBtn").addEventListener("click", this.boundClear_Click);
    this.$$("ResetSectorBtn").addEventListener("click", this.boundClear_Click);
    this.$$("ResetControlBtn").addEventListener("click", this.boundClear_Click);
    this.$$("ExecuteBtn").addEventListener("click", this.boundClear_Click);
    this.$$("FetchBtn").addEventListener("click", this.boundClear_Click);
    //this.$$("PowerOnBtn").addEventListener("click", this.boundPowerBtn_Click);
    this.$$("PowerOffBtn").addEventListener("dblclick", this.boundPowerBtn_Click);

    this.window.addEventListener("beforeunload", D205SupervisoryPanel.prototype.beforeUnload);

    this.$$("SinglePulseBtn").addEventListener("click", this.boundMeatballMemdump, false);

    this.$$("PulseSourceSwitch").addEventListener("click", this.boundFlipSwitch);
    this.$$("WordContSwitch").addEventListener("click", this.boundFlipSwitch);
    this.$$("AudibleAlarmSwitch").addEventListener("click", this.boundFlipSwitch);
    this.$$("LockNormalSwitch").addEventListener("click", this.boundFlipSwitch);
    this.$$("StepContinuousSwitch").addEventListener("click", this.boundFlipSwitch);
    this.$$("FrequencyKnob").addEventListener("click", this.boundFlipSwitch);

    this.$$("StartBtn").addEventListener("click", this.boundStartBtn_Click);

    this.$$("ARegPanel").addEventListener("click", this.boundLamp_Click);
    this.$$("BRegPanel").addEventListener("click", this.boundLamp_Click);
    this.$$("CRegPanel").addEventListener("click", this.boundLamp_Click);
    this.$$("DRegPanel").addEventListener("click", this.boundLamp_Click);
    this.$$("RRegPanel").addEventListener("click", this.boundLamp_Click);
    controlDiv.addEventListener("click", this.boundLamp_Click);
    this.$$("AdderPanel").addEventListener("click", this.boundLamp_Click);
    this.$$("CarryPanel").addEventListener("click", this.boundLamp_Click);
    this.$$("TWA").addEventListener("click", this.boundLamp_Click);
    this.$$("3IO").addEventListener("click", this.boundLamp_Click);

    // Miscellaneous

    this.$$("ConfigName").textContent = this.config.getConfigName();
    this.$$("EmulatorVersion").textContent = D205Version.version;
    this.alarmSound = this.$$("AlarmSound");
    this.alarmSound.volume = 0.25;

    // Power on the system automatically by default...
    setCallback(this.mnemonic, this, 1000, function powerOnTimer() {
        this.powerOnSystem();
    });
};

/**************************************/
D205SupervisoryPanel.prototype.shutDown = function shutDown() {
    /* Shuts down the panel */

    if (this.intervalToken) {
        this.window.clearInterval(this.intervalToken);
    }
    this.window.removeEventListener("beforeunload", D205SupervisoryPanel.prototype.beforeUnload);
    this.window.close();
};