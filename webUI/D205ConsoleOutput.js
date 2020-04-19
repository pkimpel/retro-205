/***********************************************************************
* retro-205/webUI D205ConsoleOutput.js
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
function D205ConsoleOutput(mnemonic, p) {
    /* Constructor for the Console Output object */

    this.config = p.config;             // System configuration object
    this.hasFlexowriter = p.config.getNode("ControlConsole.hasFlexowriter");
    this.hasPaperTapePunch = p.config.getNode("ControlConsole.hasPaperTapePunch");
    this.maxScrollLines = 15000;        // Maximum amount of printer/punch scrollback
    this.mnemonic = mnemonic;           // Unit mnemonic
    this.outTimer = 0;                  // output setCallback() token
    this.punchPeriod = 1000/60;         // Punch speed, ms/c (60 cps)

    this.boundButton_Click = D205ConsoleOutput.prototype.button_Click.bind(this);
    this.boundFlipSwitch = D205ConsoleOutput.prototype.flipSwitch.bind(this);

    this.clear();

    // Create the Flexowriter window and onload event
    if (this.hasFlexowriter) {
        this.flexUse204Codes = p.config.getNode("Flexowriter.use204FlexCodes") || false;
        this.flexDoc = null;
        this.flexWin = null;
        this.flexPaper = null;
        this.flexLine = null;
        this.flexEOP = null;
        this.flexCol = 0;
        D205Util.openPopup(window, "../webUI/D205Flexowriter.html", "Flexowriter",
                "location=no,scrollbars=no,resizable,width=668,height=370,left=0,top=0",
                this, D205ConsoleOutput.prototype.flexOnload);
    }

    // Create the Paper Tape Punch window and onload event
    if (this.hasPaperTapePunch) {
        this.punchDoc = null;
        this.punchWin = null;
        this.punchTape = null;
        this.punchEOP = null;
        D205Util.openPopup(window, "../webUI/D205PaperTapePunch.html", "PaperTapePunch",
                "location=no,scrollbars=no,resizable,width=290,height=100,left=0,top=430",
                this, D205ConsoleOutput.prototype.punchOnload);
    }
}

/**************************************/
D205ConsoleOutput.offSwitch = "./resources/ToggleDown.png";
D205ConsoleOutput.midSwitch = "./resources/ToggleMid.png";
D205ConsoleOutput.onSwitch = "./resources/ToggleUp.png";

D205ConsoleOutput.cardatronXlate = [    // translate internal Cardatron code to ANSI
        " ", "|", "|", ".", "|", "|", "|", "|", "|", "|",       // 00-09
        "&", "|", "|", "$", "&", "|", "|", "$", "&", "|",       // 10-19
        "-", "/", "|", ",", "%", "|", "|", "|", "|", "|",       // 20-29
        "|", "|", "|", "|", "\t", "\n", "|", "|", "|", "|",     // 30-39
        "|", "A", "B", "C", "D", "E", "F", "G", "H", "I",       // 40-49
        "|", "J", "K", "L", "M", "N", "O", "P", "Q", "R",       // 50-59
        "|", "|", "S", "T", "U", "V", "W", "X", "Y", "Z",       // 60-69
        "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",       // 70-79
        "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",       // 80-89
        "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];      // 90-99

D205ConsoleOutput.flex204XlateLower = [ // translate lower-case 203/204 Flexowriter codes to ANSI
        "|", "|", "|", "|", "\t","\n","|", "|", "|", "|",       // 00-09
        "|", "|", "|", "|", "|", "|", "|", "|", "|", "|",       // 10-19
        "a", "r", "s", "t", "+", "-", ";", "|", "|", "|",       // 20-29
        "|", ",", ".", "'", " ", "|", "l", "|", "|", "|",       // 30-39
        "0", "1", "2", "3", "4", "5", "6", "7", "|", "|",       // 40-49
        "8", "9", "u", "v", "w", "x", "y", "z", "|", "|",       // 50-59
        "|", "b", "c", "d", "e", "f", "g", "h", "|", "|",       // 60-69
        "i", "j", "k", "m", "n", "o", "p", "q", "|", "|",       // 70-79
        "|", "|", "|", "|", "|", "|", "|", "|", "|", "|",       // 80-89
        "|", "|", "|", "|", "|", "|", "|", "|", "|", "|"];      // 90-99

D205ConsoleOutput.flex204XlateUpper = [ // translate upper-case 203/204 Flexowriter codes to ANSI
        "|", "|", "|", "|", "\t","\n","|", "|", "|", "|",       // 00-09
        "|", "|", "|", "|", "|", "|", "|", "|", "|", "|",       // 10-19
        "A", "R", "S", "T", "=", "_", ":", "|", "|", "|",       // 20-29
        "|", ",", ".", "\""," ", "|", "L", "|", "|", "|",       // 30-39
        ")", "#", "&", "/", "$", "%", "?", "!", "|", "|",       // 40-49
        "*", "(", "U", "V", "W", "X", "Y", "Z", "|", "|",       // 50-59
        "|", "B", "C", "D", "E", "F", "G", "H", "|", "|",       // 60-69
        "I", "J", "K", "M", "N", "O", "P", "Q", "|", "|",       // 70-79
        "|", "|", "|", "|", "|", "|", "|", "|", "|", "|",       // 80-89
        "|", "|", "|", "|", "|", "|", "|", "|", "|", "|"];      // 90-99


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
    this.upperCase = 0;                 // current shift position (204 Flex encoding only)
    this.printRed = 0;                  // print in red color (204 Flex encoding only)

    this.wordCounter = 0;               // grouping words/line counter
    this.lineCounter = 0;               // grouping lines/group counter
    this.groupCounter = 0;              // grouping groups/page counter

    this.pendingSignalOK = null;        // pending I/O-complete successor function
    this.pendingOutputFcn = null;       // pending output function that was stopped
    this.pendingOutputUnit = 0;         // pending output unit designator
    this.pendingOutputDigit = 0;        // pending output digit
};

/**************************************/
D205ConsoleOutput.prototype.resetCounters = function resetCounters() {
    /* Resets the grouping counters and turns on the Reset lamp. If the carriage
    is not at the left margin, a new-line is issued. If there is pending output
    function that was stopped earlier, it is now called */
    var outputFcn;
    var signalOK;

    this.wordCounter = 0;
    this.lineCounter = 0;
    this.groupCounter = 0;
    this.stopPrintout = 0;
    this.resetLamp.set(1);
    if (this.flexCol > 0) {
        this.flexEmptyLine();
    }

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
D205ConsoleOutput.prototype.flexSetMode = function flexSetMode(mode204) {
    this.flex$$("FlexowriterMode").textContent =
                (mode204 ? "203/204 CODES" : "CARDATRON CODES");
};

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

    this.flexLine = this.flexDoc.createTextNode("");
    this.flexPaper.appendChild(this.flexLine);
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

    this.flexLine.nodeValue += "\n";    // newline
    paper = this.flexLine.parentNode;
    this.flexLine = this.flexDoc.createTextNode(line);
    paper.appendChild(this.flexLine);
    this.flexCol = line.length;
    this.flexEOP.scrollIntoView();
};

/**************************************/
D205ConsoleOutput.prototype.flexChar = function flexChar(c) {
    /* Outputs the character "c" to the output device */
    var line = this.flexLine.nodeValue;
    var len = line.length;

    if (len < 1) {
        line = c;
        ++this.flexCol;
    } else if (this.flexCol < 120) {
        line += c;
        ++this.flexCol;
    } else {
         line = line.substring(0, len-1) + c;
    }

    this.flexLine.nodeValue = line;
};

/**************************************/
D205ConsoleOutput.prototype.flexPrintRed = function flexPrintRed(enable) {
    /* Changes the printing color to/from red based on "enable" */
    var e = null;

    this.flexLine = this.flexDoc.createTextNode("");
    if (enable) {
        e = this.flexDoc.createElement("SPAN");
        e.className = "red";
        e.appendChild(this.flexLine);
        this.flexPaper.appendChild(e);
    } else {
        this.flexPaper.appendChild(this.flexLine);
    }
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
    D205Util.openPopup(window, "./D205FramePaper.html", "",
            "scrollbars,resizable,width=500,height=500",
            this, function(ev) {
        var doc = ev.target;
        var win = doc.defaultView;

        doc.title = title;
        win.moveTo((screen.availWidth-win.outerWidth)/2, (screen.availHeight-win.outerHeight)/2);
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
    case "FlexowriterMode":
        this.flexUse204Codes = !this.flexUse204Codes;
        this.flexSetMode(this.flexUse204Codes);
        break;
    } // switch ev.target.id

    ev.preventDefault();
    ev.stopPropagation();
    return false;
};

/**************************************/
D205ConsoleOutput.prototype.flipSwitch = function flipSwitch(ev) {
    /* Handler for switch clicks */

    switch (ev.target.id) {
    case "ZeroSuppressSwitch":
        this.zeroSuppressSwitch.flip();
        this.config.putNode("Flexowriter.zeroSuppressSwitch", this.zeroSuppressSwitch.state);
        break;
    case "TabSpaceSwitch":
        this.tabSpaceSwitch.flip();
        this.config.putNode("Flexowriter.tabSpaceSwitch", this.tabSpaceSwitch.state);
        break;
    case "GroupingCountersSwitch":
        this.groupingCountersSwitch.flip();
        this.config.putNode("Flexowriter.groupingCountersSwitch", this.groupingCountersSwitch.state);
        break;
    case "AutoStopSwitch":
        this.autoStopSwitch.flip();
        this.config.putNode("Flexowriter.autoStopSwitch", this.autoStopSwitch.state);
        break;
    case "PowerSwitch":
        this.powerSwitch.flip();
        this.config.putNode("Flexowriter.powerSwitch", 1);      // always force on
        setCallback(null, this.powerSwitch, 250, this.powerSwitch.set, 1);
        break;
    case "WordsKnob":
        this.config.putNode("Flexowriter.wordsKnob", ev.target.selectedIndex);
        break;
    case "LinesKnob":
        this.config.putNode("Flexowriter.linesKnob", ev.target.selectedIndex);
        break;
    case "GroupsKnob":
        this.config.putNode("Flexowriter.groupsKnob", ev.target.selectedIndex);
        break;
    }

    ev.preventDefault();
    return false;
};

/**************************************/
D205ConsoleOutput.prototype.flexOnload = function flexOnload(ev) {
    /* Initializes the Flexowriter window and user interface */
    var body;
    var prefs = this.config.getNode("Flexowriter");

    this.flexDoc = ev.target;
    this.flexWin = this.flexDoc.defaultView;
    this.flexDoc.title = "retro-205 - Flexowriter";
    this.flexPaper = this.flex$$("Paper");
    this.flexEOP = this.flex$$("EndOfPaper");
    this.flexEmptyPaper();
    this.flexEmptyLine();
    this.flexSetMode(this.flexUse204Codes);

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
            D205ConsoleOutput.prototype.flexResizeWindow.bind(this));
    this.flexPaper.addEventListener("dblclick",
            D205ConsoleOutput.prototype.flexCopyPaper.bind(this));

    this.flex$$("ResetBtn").addEventListener("click", this.boundButton_Click);
    this.flex$$("FlexowriterMode").addEventListener("click", this.boundButton_Click);

    this.flex$$("ZeroSuppressSwitch").addEventListener("click", this.boundFlipSwitch);
    this.flex$$("TabSpaceSwitch").addEventListener("click", this.boundFlipSwitch);
    this.flex$$("GroupingCountersSwitch").addEventListener("click", this.boundFlipSwitch);
    this.flex$$("AutoStopSwitch").addEventListener("click", this.boundFlipSwitch);
    this.flex$$("PowerSwitch").addEventListener("click", this.boundFlipSwitch);
    this.wordsKnob.addEventListener("change", this.boundFlipSwitch);
    this.linesKnob.addEventListener("change", this.boundFlipSwitch);
    this.groupsKnob.addEventListener("change", this.boundFlipSwitch);

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
    var win = null;

    D205Util.openPopup(window, "./D205FramePaper.html", "",
            "scrollbars,resizable,width=500,height=500",
            this, function(ev) {
        var doc = ev.target;
        var win = doc.defaultView;

        doc.title = title;
        win.moveTo((screen.availWidth-win.outerWidth)/2, (screen.availHeight-win.outerHeight)/2);
        doc.getElementById("Paper").textContent = text;
    });

    this.punchEmptyPaper();
    ev.preventDefault();
    ev.stopPropagation();
};

/**************************************/
D205ConsoleOutput.prototype.punchOnload = function punchOnload(ev) {
    /* Initializes the Paper Tape Punch window and user interface */

    this.punchDoc = ev.target;
    this.punchWin = this.punchDoc.defaultView;
    this.punchDoc.title = "retro-205 - Paper Tape Punch";
    this.punchTape = this.punch$$("Paper");
    this.punchEOP = this.punch$$("EndOfPaper");
    this.punchEmptyPaper();

    this.punchWin.addEventListener("beforeunload",
            D205ConsoleOutput.prototype.beforeUnload);
    this.punchWin.addEventListener("resize",
            D205ConsoleOutput.prototype.punchResizeWindow.bind(this));
    this.punchTape.addEventListener("dblclick",
            D205ConsoleOutput.prototype.punchCopyTape.bind(this));

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
    var delay = 1000/14;                // default character output delay, ms
    var tabCol = 0;                     // tabulation column

    if (this.stopPrintout) {
        this.pendingOutputFcn = writeFormatDigit;
        this.pendingOutputUnit = outputUnit;
        this.pendingOutputDigit = formatDigit;
        this.pendingSignalOK = signalOK;
    } else {
        switch (outputUnit) {
        case 1:                         // Flexowriter
            if (this.hasFlexowriter) {
                switch (formatDigit) {
                case 2:                     // suppress sign, print decimal point instead
                case 3:                     // suppress sign, print space instead
                case 4:                     // translate alphanumerically
                    this.alphaLock = 0;
                    delay = 120;
                    this.formatDigit = formatDigit;
                    break;
                case 5:                     // actuate carriage return
                    delay = this.flexCol/120*55 + 70;   // 70-125ms based on carriage position
                    this.flexEmptyLine();
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

                setCallback(this.mnemonic, this, delay, signalOK);
            }
            break;

        case 2:                         // Paper-tape punch
            if (this.hasPaperTapePunch) {
                // Format digit is used only to feed blank tape -- it isn't output by this implementation
                switch (formatDigit) {
                case 1:
                    delay = this.punchPeriod;
                    this.punchChar(" ");
                    break;
                default:
                    break;
                } // switch formatDigit

                setCallback(this.mnemonic, this, delay, signalOK);
            }
            break;
        } // switch outputUnit
    }
};

/**************************************/
D205ConsoleOutput.prototype.writeSignDigit = function writeSignDigit(outputUnit, signDigit, signalOK) {
    /* Outputs (or not) the sign digit of a word. Delays for an appropriate
    amount of time, then calls the Processor's signalOK function */
    var delay = 65;                     // default character output delay, ms

    if (this.stopPrintout) {
        this.pendingOutputFcn = writeSignDigit;
        this.pendingOutputUnit = outputUnit;
        this.pendingOutputDigit = signDigit;
        this.pendingSignalOK = signalOK;
    } else {
        switch (outputUnit) {
        case 1:                         // Flexowriter
            if (this.hasFlexowriter) {
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
                    delay = 62;
                    break;
                default:
                    this.flexChar((signDigit & 0x01) ? "-" : "+");
                    break;
                } // switch formatDigit

                setCallback(this.mnemonic, this, delay, signalOK);
            }
            break;
        case 2:                         // Paper-tape punch
            if (this.hasPaperTapePunch) {
                delay = this.punchPeriod;
                this.punchChar(signDigit.toString());
                setCallback(this.mnemonic, this, delay, signalOK);
            }
            break;
        } // switch outputUnit
    }
};

/**************************************/
D205ConsoleOutput.prototype.writeNumberDigit = function writeNumberDigit(outputUnit, digit, signalOK) {
    /* Sets the current digit in the translator and outputs it if appropriate */
    var char = "";                      // ASCII character to output
    var delay = 70;                     // default delay
    var tabCol = 0;                     // tabulation column

    switch (outputUnit) {
    case 1:                             // Flexowriter
        if (this.hasFlexowriter) {
            if (this.formatDigit == 4) {    // translate alphanumerically
                if (this.alphaLock) {
                    this.alphaLock = 0;
                    delay = 75;
                    digit += this.alphaFirstDigit*10;
                    if (!this.flexUse204Codes) {
                        char = D205ConsoleOutput.cardatronXlate[digit];
                    } else {
                        char = this.upperCase ? D205ConsoleOutput.flex204XlateUpper[digit]
                                              : D205ConsoleOutput.flex204XlateLower[digit];
                        switch (digit) {
                        case 1:         // backspace
                            if (this.flexCol > 0) {
                                --this.flexCol;
                                tabCol = this.flexLine.nodeValue.length;
                                if (tabCol > 0) {
                                    this.flexLine.nodeValue =
                                        this.flexLine.nodeValue.substring(0, tabCol-1);
                                }
                            }
                            break;
                        case 27:        // lower case
                            this.upperCase = false;
                            break;
                        case 30:        // upper case
                            this.upperCase = true;
                            break;
                        case 35:        // color shift
                            this.printRed = 1 - this.printRed;
                            this.flexPrintRed(this.printRed);
                            break;
                        default:
                            break;
                        }
                    }

                    switch (char) {
                    case "|":       // some characters are just ignored by the Flex
                        break;
                    case "\t":      // tabulate
                        tabCol = Math.floor((this.flexCol + 8)/8)*8;
                        while (this.flexCol < tabCol) {
                            this.flexChar(" ");
                        }
                        break;
                    case "\n":      // carriage return
                        delay = this.flexCol/120*55 + 70;   // 70-125ms based on carriage position
                        this.flexEmptyLine();
                        break;
                    default:        // all printable characters
                        this.flexChar(char);
                        break;
                    }
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

            setCallback(this.mnemonic, this, delay, signalOK);
        }
        break;

    case 2:                             // Paper-tape punch
        if (this.hasPaperTapePunch) {
            delay = this.punchPeriod;
            this.punchChar(digit.toString());
            setCallback(this.mnemonic, this, delay, signalOK);
        }
        break;
    } // switch outputUnit
};

/**************************************/
D205ConsoleOutput.prototype.writeFinish = function writeFinish(outputUnit, controlDigit, signalOK) {
    /* Signals end of output for a word. Delays for an appropriate amount of
    time, then calls the Processor's signalOK function */
    var delay = 140;                    // default delay, ms
    var tabCol = 0;                     // TCU tabulation column

    switch (outputUnit) {
    case 1:                             // Flexowriter
        if (this.hasFlexowriter) {
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

            setCallback(this.mnemonic, this, delay, signalOK);
        }
        break;
    case 2:                             // Paper-tape punch
        if (this.hasPaperTapePunch) {
            delay = this.punchPeriod;
            this.punchEmptyLine();
            this.punchEOP.scrollIntoView();
            setCallback(this.mnemonic, this, delay, signalOK);
        }
        break;
    } // switch outputUnit
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
