/***********************************************************************
* retro-205/emulator D205ConsoleOutput.js
************************************************************************
* Copyright (c) 2014, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* ElectroData/Burroughs Datatron 205 Flexowriter printer and
* High-Speed Paper Tape Punch devices.
************************************************************************
* 2014-12-26  P.Kimpel
*   Original version, from retro-B5500 B5500SPOUnit.js.
***********************************************************************/
"use strict";

/**************************************/
function D205ConsoleOutput(mnemonic) {
    /* Constructor for the Console Output object */

    this.maxScrollLines = 15000;        // Maximum amount of printer/punch scrollback
    this.punchPeriod = 1000/60;         // Punch speed, ms/c (60 cps)

    this.mnemonic = mnemonic;           // Unit mnemonic
    this.outTimer = 0;                  // output setCallback() token
    this.boundButton_Click = D205Util.bindMethod(this, D205ConsoleOutput.prototype.button_Click);
    this.boundFlipSwitch = D205Util.bindMethod(this, D205ConsoleOutput.prototype.flipSwitch);

    this.clear();

    // Close and destroy any previously-existing device windows
    this.flexWin = window.open("", "Flexowriter", "resizable,width=140,height=140");
    this.punchWin = window.open("", "PaperTapePunch", "resizable,width=140,height=140");
    this.shutDown();

    // Create the Flexowriter window and onload event
    this.flexDoc = null;
    this.flexPaper = null;
    this.flexEOP = null;
    this.flexCol = 0;
    this.flexWin = window.open("../webUI/D205Flexowriter.html", "Flexowriter",
            "location=no,scrollbars=no,resizable,width=668,height=370,left=0,top=0");
    this.flexWin.addEventListener("load", D205Processor.bindMethod(this,
            D205ConsoleOutput.prototype.flexOnload));

    // Create the Paper Tape Punch window and onload event
    this.punchDoc = null;
    this.punchTape = null;
    this.punchEOP = null;
    this.punchWin = window.open("../webUI/D205PaperTapePunch.html", "PaperTapePunch",
            "location=no,scrollbars=no,resizable,width=290,height=100,left=0,top=430");
    this.punchWin.addEventListener("load", D205Processor.bindMethod(this,
            D205ConsoleOutput.prototype.punchOnload));
}

/**************************************/
D205ConsoleOutput.offSwitch = "./resources/ToggleDown.png";
D205ConsoleOutput.midSwitch = "./resources/ToggleMid.png";
D205ConsoleOutput.onSwitch = "./resources/ToggleUp.png";

D205ConsoleOutput.cardatronXlate = [        // translate internal Cardatron code to ANSI
        " ", "?", "?", ".", "\u00A4", "?", "?", "?", "?", "?",  // 00-09
        "&", "?", "?", "$", "*", "?", "?", "?", "?", "?",       // 10-19
        "-", "/", "?", ",", "%", "?", "?", "?", "?", "?",       // 20-29
        "?", "?", "?", "#", "@", "?", "?", "?", "?", "?",       // 30-39
        "+", "A", "B", "C", "D", "E", "F", "G", "H", "I",       // 40-49
        "-", "J", "K", "L", "M", "N", "O", "P", "Q", "R",       // 50-59
        "?", "?", "S", "T", "U", "V", "W", "X", "Y", "Z",       // 60-69
        "?", "?", "?", "?", "?", "?", "?", "?", "?", "?",       // 70-79
        "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",       // 80-89
        "?", "?", "?", "?", "?", "?", "?", "?", "?", "?"];      // 90-99


/**************************************/
D205ConsoleOutput.prototype.clear = function clear() {
    /* Initializes (and if necessary, creates) the SPO unit state */

    this.ready = false;                 // ready status
    this.busy = false;                  // busy status

    this.formatDigit = 0;               // format digit from PO or POF C8
    this.alphaFirstDigit = 0;           // first digit of an alpha pair
    this.alphaLock = 0;                 // alpha translation enabled for format=4
    this.zeroSuppress = 0;              // currently suppressing leading zeroes
    this.stopPrintout = 0;              // idle processor if a printout command occurs

    this.wordCounter = 0;               // grouping words/line counter
    this.lineCounter = 0;               // grouping lines/group counter
    this.groupCounter = 0;              // grouping groups/page counter

    this.pendingSignalOK = null;        // pending I/O-complete successor function
    this.pendingOutputFcn = null;       // pending output function that was stopped
    this.pendingOutputUnit = 0;         // pending output unit designator
    this.pendingOutputDigit = 0;        // pending output digit
};

/**************************************/
D205ConsoleOutput.prototype.loadPrefs = function loadPrefs() {
    /* Loads, and if necessary initializes, the user's panel preferences */
    var prefs = null;
    var s = localStorage["retro-205-Flexowriter-Prefs"];

    try {
        if (s) {
            prefs = JSON.parse(s);
        }
    } finally {
        // nothing
    }

    return prefs || {
        zeroSuppressSwitch: 0,
        tabSpaceSwitch: 2,
        groupingCountersSwitch: 0,
        autoStopSwitch: 0,
        powerSwitch: 1,
        wordsKnob: 0,
        linesKnob: 0,
        groupsKnob: 0};
};

/**************************************/
D205ConsoleOutput.prototype.storePrefs = function storePrefs(prefs) {
    /* Stores the current panel preferences back to browser localStorage */

    localStorage["retro-205-Flexowriter-Prefs"] = JSON.stringify(prefs);
};

/**************************************/
D205ConsoleOutput.prototype.resetCounters = function resetCounters() {
    /* Resets the grouping counters and turns on the Reset lamp. If there is
    pending output function that was stopped earlier, it is now called */
    var outputFcn;
    var signalOK;

    this.wordCounter = 0;
    this.lineCounter = 0;
    this.groupCounter = 0;
    this.stopPrintout = 0;
    this.resetLamp.set(1);
    if (this.pendingOutputFcn) {
        outputFcn = this.pendingOutputFcn;
        this.pendingOutputFcn = null;
        signalOK = this.pendingSignalOK;
        this.pendingSignalOK = null;
        outputFcn.call(this, this.pendingOutputUnit, this.pendingOutputDigit, signalOK);
    }
};

/**************************************/
D205ConsoleOutput.prototype.beforeUnload = function beforeUnload(ev) {
    var msg = "Closing this window will make the device unusable.\n" +
              "Suggest you stay on the page and minimize this window instead";

    ev.preventDefault();
    ev.returnValue = msg;
    return msg;
};

/***********************************************************************
* Flexowriter Interface                                                *
***********************************************************************/

/**************************************/
D205ConsoleOutput.prototype.flex$$ = function flex$$(e) {
    return this.flexDoc.getElementById(e);
};

/**************************************/
D205ConsoleOutput.prototype.flexEmptyPaper = function flexEmptyPaper() {
    /* Empties the Flex output "paper" and initializes it for new output */

    while (this.flexPaper.firstChild) {
        this.flexPaper.removeChild(this.flexPaper.firstChild);
    }
    this.flexPaper.appendChild(this.flexDoc.createTextNode(""));
};

/**************************************/
D205ConsoleOutput.prototype.flexEmptyLine = function flexEmptyLine(text) {
    /* Removes excess lines already output, then appends a new text node
    to the <pre> element within the paper element */
    var paper = this.flexPaper;
    var line = text || "";

    while (paper.childNodes.length > this.maxScrollLines) {
        paper.removeChild(paper.firstChild);
    }
    paper.lastChild.nodeValue += "\n";     // newline
    paper.appendChild(this.flexDoc.createTextNode(line));
    this.flexCol = line.length;
    this.flexEOP.scrollIntoView();
};

/**************************************/
D205ConsoleOutput.prototype.flexChar = function flexChar(c) {
    /* Outputs the character "c" to the output device */
    var line = this.flexPaper.lastChild.nodeValue;
    var len = line.length;

    if (len < 1) {
        line = c;
        ++this.flexCol;
    } else if (len < 120) {
        line += c;
        ++this.flexCol;
    } else {
         line = line.substring(0, 119) + c;
    }
    this.flexPaper.lastChild.nodeValue = line;
};

/**************************************/
D205ConsoleOutput.prototype.flexResizeWindow = function flexResizeWindow(ev) {
    /* Handles the window onresize event by scrolling the "paper" so it remains at the end */

    this.flexEOP.scrollIntoView();
};

/**************************************/
D205ConsoleOutput.prototype.flexCopyPaper = function flexCopyPaper(ev) {
    /* Copies the text contents of the "paper" area of the device, opens a new
    temporary window, and pastes that text into the window so it can be copied
    or saved by the user */
    var text = this.flexPaper.textContent;
    var title = "D205 " + this.mnemonic + " Text Snapshot";
    var win = window.open("./D205FramePaper.html", "Flexowriter-Snapshot",
            "scrollbars,resizable,width=500,height=500");

    win.moveTo((screen.availWidth-win.outerWidth)/2, (screen.availHeight-win.outerHeight)/2);
    win.addEventListener("load", function() {
        var doc;

        doc = win.document;
        doc.title = title;
        doc.getElementById("Paper").textContent = text;
    });

    this.flexEmptyPaper();
    this.flexEmptyLine();
    ev.preventDefault();
    ev.stopPropagation();
};

/**************************************/
D205ConsoleOutput.prototype.button_Click = function button_Click(ev) {
    /* Handler for button clicks */

    switch (ev.target.id) {
    case "ResetBtn":
        this.resetCounters();
        break;
    } // switch ev.target.it

    ev.preventDefault();
    ev.stopPropagation();
    return false;
};

/**************************************/
D205ConsoleOutput.prototype.flipSwitch = function flipSwitch(ev) {
    /* Handler for switch clicks */
    var prefs = this.loadPrefs();

    switch (ev.target.id) {
    case "ZeroSuppressSwitch":
        this.zeroSuppressSwitch.flip();
        prefs.zeroSuppressSwitch = this.zeroSuppressSwitch.state;
        break;
    case "TabSpaceSwitch":
        this.tabSpaceSwitch.flip();
        prefs.tabSpaceSwitch = this.tabSpaceSwitch.state;
        break;
    case "GroupingCountersSwitch":
        this.groupingCountersSwitch.flip();
        prefs.groupingCountersSwitch = this.groupingCountersSwitch.state;
        break;
    case "AutoStopSwitch":
        this.autoStopSwitch.flip();
        prefs.autoStopSwitch = this.autoStopSwitch.state;
        break;
    case "PowerSwitch":
        this.powerSwitch.flip();
        prefs.powerSwitch = 1;          // always force on
        setCallback(null, this.powerSwitch, 250, this.powerSwitch.set, 1);
        break;
    case "WordsKnob":
        prefs.wordsKnob = ev.target.selectedIndex;
        break;
    case "LinesKnob":
        prefs.linesKnob = ev.target.selectedIndex;
        break;
    case "GroupsKnob":
        prefs.groupsKnob = ev.target.selectedIndex;
        break;
    }

    this.storePrefs(prefs);
    ev.preventDefault();
    return false;
};

/**************************************/
D205ConsoleOutput.prototype.flexOnload = function flexOnload() {
    /* Initializes the Flexowriter window and user interface */
    var body;
    var prefs = this.loadPrefs();

    this.flexDoc = this.flexWin.document;
    this.flexDoc.title = "retro-205 - Flexowriter";
    this.flexPaper = this.flex$$("Paper");
    this.flexEOP = this.flex$$("EndOfPaper");
    this.flexEmptyPaper();
    this.flexEmptyLine();

    body = this.flex$$("FormatControlsDiv");
    this.resetLamp = new ColoredLamp(body, null, null, "ResetLamp", "whiteLamp", "whiteLit");

    this.zeroSuppressSwitch = new ToggleSwitch(body, null, null, "ZeroSuppressSwitch",
            D205ConsoleOutput.offSwitch, D205ConsoleOutput.onSwitch);
    this.zeroSuppressSwitch.set(prefs.zeroSuppressSwitch);
    this.tabSpaceSwitch = new ThreeWaySwitch(body, null, null, "TabSpaceSwitch",
            D205ConsoleOutput.midSwitch, D205ConsoleOutput.offSwitch, D205ConsoleOutput.onSwitch);
    this.tabSpaceSwitch.set(prefs.tabSpaceSwitch);
    this.groupingCountersSwitch = new ThreeWaySwitch(body, null, null, "GroupingCountersSwitch",
            D205ConsoleOutput.midSwitch, D205ConsoleOutput.offSwitch, D205ConsoleOutput.onSwitch);
    this.groupingCountersSwitch.set(prefs.groupingCountersSwitch);
    this.autoStopSwitch = new ToggleSwitch(body, null, null, "AutoStopSwitch",
            D205ConsoleOutput.offSwitch, D205ConsoleOutput.onSwitch);
    this.autoStopSwitch.set(prefs.autoStopSwitch);
    this.powerSwitch = new ToggleSwitch(body, null, null, "PowerSwitch",
            D205ConsoleOutput.offSwitch, D205ConsoleOutput.onSwitch);
    this.powerSwitch.set(prefs.powerSwitch);

    this.wordsKnob = this.flex$$("WordsKnob");
    this.wordsKnob.selectedIndex = prefs.wordsKnob;
    this.linesKnob = this.flex$$("LinesKnob");
    this.linesKnob.selectedIndex = prefs.linesKnob;
    this.groupsKnob = this.flex$$("GroupsKnob");
    this.groupsKnob.selectedIndex = prefs.groupsKnob;

    this.flexWin.addEventListener("beforeunload",
            D205ConsoleOutput.prototype.beforeUnload);
    this.flexWin.addEventListener("resize",
            D205Processor.bindMethod(this, D205ConsoleOutput.prototype.flexResizeWindow));
    this.flexPaper.addEventListener("dblclick",
            D205Processor.bindMethod(this, D205ConsoleOutput.prototype.flexCopyPaper));

    this.flex$$("ResetBtn").addEventListener("click", this.boundButton_Click);

    this.flex$$("ZeroSuppressSwitch").addEventListener("click", this.boundFlipSwitch);
    this.flex$$("TabSpaceSwitch").addEventListener("click", this.boundFlipSwitch);
    this.flex$$("GroupingCountersSwitch").addEventListener("click", this.boundFlipSwitch);
    this.flex$$("AutoStopSwitch").addEventListener("click", this.boundFlipSwitch);
    this.flex$$("PowerSwitch").addEventListener("click", this.boundFlipSwitch);
    this.wordsKnob.addEventListener("change", this.boundFlipSwitch);
    this.linesKnob.addEventListener("change", this.boundFlipSwitch);
    this.groupsKnob.addEventListener("change", this.boundFlipSwitch);

    //this.flexWin.moveTo(screen.availWidth-this.flexWin.outerWidth,
    //                   screen.availHeight-this.flexWin.outerHeight);
    //this.flexWin.moveTo(0, 0);
    this.flexWin.focus();
};

/***********************************************************************
* Paper Tape Punch Interface                                           *
***********************************************************************/

/**************************************/
D205ConsoleOutput.prototype.punch$$ = function punch$$(e) {
    return this.punchDoc.getElementById(e);
};

/**************************************/
D205ConsoleOutput.prototype.punchEmptyPaper = function punchEmptyPaper() {
    /* Empties the punch output "paper" and initializes it for new output */

    while (this.punchTape.firstChild) {
        this.punchTape.removeChild(this.punchTape.firstChild);
    }
    this.punchTape.appendChild(this.punchDoc.createTextNode(""));
};

/**************************************/
D205ConsoleOutput.prototype.punchEmptyLine = function punchEmptyLine(text) {
    /* Removes excess lines already output, then appends a new text node
    to the <pre> element within the paper element */
    var paper = this.punchTape;
    var line = text || "";

    while (paper.childNodes.length > this.maxScrollLines) {
        paper.removeChild(paper.firstChild);
    }
    paper.lastChild.nodeValue += "\n";     // newline
    paper.appendChild(this.punchDoc.createTextNode(line));
};

/**************************************/
D205ConsoleOutput.prototype.punchChar = function punchChar(c) {
    /* Outputs the character "c" to the output device */
    var line = this.punchTape.lastChild.nodeValue;
    var len = line.length;

    if (len < 1) {
        line = c;
    } else {
        line += c;
    }
    this.punchTape.lastChild.nodeValue = line;
};

/**************************************/
D205ConsoleOutput.prototype.punchResizeWindow = function punchResizeWindow(ev) {
    /* Handles the window onresize event by scrolling the "paper" so it remains at the end */

    this.punchEOP.scrollIntoView();
};

/**************************************/
D205ConsoleOutput.prototype.punchCopyTape = function punchCopyTape(ev) {
    /* Copies the text contents of the "paper" area of the device, opens a new
    temporary window, and pastes that text into the window so it can be copied
    or saved by the user */
    var text = this.punchTape.textContent;
    var title = "D205 " + this.mnemonic + " Text Snapshot";
    var win = window.open("./D205FramePaper.html", "PaperTapePunch-Snapshot",
            "scrollbars,resizable,width=500,height=500");

    win.moveTo((screen.availWidth-win.outerWidth)/2, (screen.availHeight-win.outerHeight)/2);
    win.addEventListener("load", function() {
        var doc;

        doc = win.document;
        doc.title = title;
        doc.getElementById("Paper").textContent = text;
    });

    this.punchEmptyPaper();
    ev.preventDefault();
    ev.stopPropagation();
};

/**************************************/
D205ConsoleOutput.prototype.punchOnload = function punchOnload() {
    /* Initializes the Paper Tape Punch window and user interface */

    this.punchDoc = this.punchWin.document;
    this.punchDoc.title = "retro-205 - Paper Tape Punch";
    this.punchTape = this.punch$$("Paper");
    this.punchEOP = this.punch$$("EndOfPaper");
    this.punchEmptyPaper();

    this.punchWin.addEventListener("beforeunload",
            D205ConsoleOutput.prototype.beforeUnload);
    this.punchWin.addEventListener("resize",
            D205Processor.bindMethod(this, D205ConsoleOutput.prototype.punchResizeWindow));
    this.punchTape.addEventListener("dblclick",
            D205Processor.bindMethod(this, D205ConsoleOutput.prototype.punchCopyTape));

    //this.punchWin.moveTo(screen.availWidth-this.punchWin.outerWidth,
    //                   screen.availHeight-this.punchWin.outerHeight);
    //this.punchWin.moveTo(0, 430);
    this.punchWin.focus();
};

/***********************************************************************
* Output Entry Points                                                  *
***********************************************************************/

/**************************************/
D205ConsoleOutput.prototype.writeFormatDigit = function writeFormatDigit(
        outputUnit, formatDigit, signalOK) {
    /* Sets the format digit at the beginning of output for a word, or as the
    result of a POF instruction. Delays for an appropriate amount of time, then
    calls the Processor's signalOK function. */
    var delay = 120;                    // default character output delay, ms
    var tabCol;

    if (this.stopPrintout) {
        this.pendingOutputFcn = writeFormatDigit;
        this.pendingOutputUnit = outputUnit;
        this.pendingOutputDigit = formatDigit;
        this.pendingSignalOK = signalOK;
    } else {
        switch (outputUnit) {
        case 1:                         // Flexowriter
            switch (formatDigit) {
            case 2:                     // suppress sign, print decimal point instead
            case 3:                     // suppress sign, print space instead
            case 4:                     // translate alphanumerically
                this.alphaLock = 0;
                this.formatDigit = formatDigit;
                break;
            case 5:                     // actuate carriage return
                this.flexEmptyLine();
                delay = 200;
                break;
            case 6:                     // actuate tab key
                tabCol = Math.floor((this.flexCol + 8)/8)*8;
                while (this.flexCol < tabCol) {
                    this.flexChar(" ");
                }
                break;
            case 7:                     // set stop printout flag
                this.stopPrintout = 1;
                break;
            case 8:                     // actuate space bar
                this.flexChar(" ");
                break;
            } // switch formatDigit
            break;

        case 2:                         // Paper-tape punch
            // Format digit is used only to feed blank tape -- it isn't output by this implementation
            switch (formatDigit) {
            case 1:
                delay = this.punchPeriod*10;
                for (tabCol=0; tabCol<10; ++tabCol) {
                    this.punchChar(" ");
                }
                break;
            default:
                delay = this.punchPeriod;
                break;
            } // switch formatDigit
            break;
        } // switch outputUnit

        setCallback(this.mnemonic, this, delay, signalOK);
    }
};

/**************************************/
D205ConsoleOutput.prototype.writeSignDigit = function writeSignDigit(outputUnit, signDigit, signalOK) {
    /* Outputs (or not) the sign digit of a word. Delays for an appropriate
    amount of time, then calls the Processor's signalOK function */
    var delay = 70;                     // default character output delay, ms

    if (this.stopPrintout) {
        this.pendingOutputFcn = writeSignDigit;
        this.pendingOutputUnit = outputUnit;
        this.pendingOutputDigit = signDigit;
        this.pendingSignalOK = signalOK;
    } else {
        switch (outputUnit) {
        case 1:                         // Flexowriter
            this.zeroSuppress = this.zeroSuppressSwitch.state;
            switch (this.formatDigit) {
            case 2:                     // suppress sign, print decimal point instead
                this.zeroSuppress = 0;
                this.flexChar(".");
                break;
            case 3:                     // suppress sign, print space instead
                this.flexChar(" ");
                break;
            case 4:                     // translate alphanumerically -- ignore the sign
                break;
            default:
                this.flexChar((signDigit & 0x01) ? "-" : "+");
                break;
            } // switch formatDigit
            break;
        case 2:                         // Paper-tape punch
            delay = this.punchPeriod;
            this.punchChar(signDigit.toString());
            break;
        } // switch outputUnit

        setCallback(this.mnemonic, this, delay, signalOK);
    }
};

/**************************************/
D205ConsoleOutput.prototype.writeNumberDigit = function writeNumberDigit(outputUnit, digit, signalOK) {
    /* Sets the current digit in the translator and outputs it if appropriate */
    var charCode;
    var delay = 70;                     // default delay

    switch (outputUnit) {
    case 1:                             // Flexowriter
        if (this.formatDigit == 4) {    // translate alphanumerically
            if (this.alphaLock) {
                this.alphaLock = 0;
                charCode = this.alphaFirstDigit*10 + digit;
                this.flexChar(D205ConsoleOutput.cardatronXlate[charCode]);
                delay = 62;
            } else {
                this.alphaLock = 1;
                this.alphaFirstDigit = digit;
                delay = 48;
            }
        } else if (digit == 0 && this.zeroSuppress) {
            this.flexChar(" ");
        } else {
            this.zeroSuppress = 0;
            this.flexChar(digit.toString());
        }
        break;

    case 2:                             // Paper-tape punch
        delay = this.punchPeriod;
        this.punchChar(digit.toString());
        break;
    } // switch outputUnit

    setCallback(this.mnemonic, this, delay, signalOK);
};

/**************************************/
D205ConsoleOutput.prototype.writeFinish = function writeFinish(outputUnit, controlDigit, signalOK) {
    /* Signals end of output for a word. Delays for an appropriate amount of
    time, then calls the Processor's signalOK function */
    var delay = 140;                    // default delay, ms
    var tabCol;

    switch (outputUnit) {
    case 1:                             // Flexowriter
        this.formatDigit = this.alphaLock = 0;
        if (controlDigit & 0x08) {
            // suppress line/group counting
        } else if (this.groupingCountersSwitch.state) {
            // perform line/group counting -- note that .selectedIndex is zero-relative
            this.resetLamp.set(0);
            if (this.wordCounter < this.wordsKnob.selectedIndex) {
                ++this.wordCounter;
                switch (this.tabSpaceSwitch.state) {
                case 1:                         // output a tab
                    tabCol = Math.floor((this.flexCol + 8)/8)*8;
                    while (this.flexCol < tabCol) {
                        this.flexChar(" ");
                    }
                    break;
                case 2:                         // output a space
                    this.flexChar(" ");
                    break;
                } // switch this.tabSpaceSwitch.state
            } else {
                this.wordCounter = 0;
                if (this.groupingCountersSwitch.state == 2) {
                    this.flexEmptyLine();       // end of line: do new line
                }
                if (this.lineCounter < this.linesKnob.selectedIndex) {
                    ++this.lineCounter;
                } else {
                    this.lineCounter = 0;
                    if (this.groupingCountersSwitch.state == 2) {
                        delay += 100;           // end of group: do another new line
                        this.flexEmptyLine();
                    }
                    if (this.groupCounter < this.groupsKnob.selectedIndex) {
                        ++this.groupCounter;
                    } else {
                        this.groupCounter = 0;  // end of page
                        if (this.autoStopSwitch.state) {
                            this.stopPrintout = 1;      // stop before next output
                        }
                    }
                }
            }
        }
        break;
    case 2:                             // Paper-tape punch
        delay = this.punchPeriod;
        this.punchEmptyLine();
        this.punchEOP.scrollIntoView();
        break;
    } // switch outputUnit

    setCallback(this.mnemonic, this, delay, signalOK);
};

/**************************************/
D205ConsoleOutput.prototype.shutDown = function shutDown() {
    /* Shuts down the device */

    if (this.outTimer) {
        clearCallback(this.outTimer);
    }
    if (this.flexWin) {
        this.flexWin.removeEventListener("beforeunload", D205ConsoleOutput.prototype.beforeUnload);
        this.flexWin.close();
        this.flexWin = null;
    }
    if (this.punchWin) {
        this.punchWin.removeEventListener("beforeunload", D205ConsoleOutput.prototype.beforeUnload);
        this.punchWin.close();
        this.punchWin = null;
    }
};
