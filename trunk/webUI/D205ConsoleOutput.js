/***********************************************************************
* retro-205/emulator D205ConsoleOutput.js
************************************************************************
* Copyright (c) 2014, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* Electrodata/Burroughs Datatron 205 Flexowriter printer device.
************************************************************************
* 2014-12-26  P.Kimpel
*   Original version, from retro-B5500 B5500SPOUnit.js.
***********************************************************************/
"use strict";

/**************************************/
function D205ConsoleOutput(mnemonic) {
    /* Constructor for the Console Output object */

    this.maxScrollLines = 1500;         // Maximum amount of printer scrollback
    this.charPeriod = 100;              // Printer speed, milliseconds per character

    this.mnemonic = mnemonic;           // Unit mnemonic

    this.outTimer = 0;                  // output setCallback() token
    this.successor = null;              // current successor function

    this.fswZeroSuppress = 0;           // zero suppress switch: 0=off, 1=on
    this.fswTabSpace = 0;               // tab/space switch: 0=off, 1=tab, 2=space
    this.fswGroupingCounters = 0;       // grouping counters switch: 0=off/off, 1=off/on, 2=on/on
    this.fswAutoStop = 0;               // auto-stop switch: 0=off, 1=on
    this.fswWordsPerLine = 1;           // words/line switch
    this.fswLinesPerGroup = 1;          // lines/group switch
    this.fswGroupsPerPage = 1;          // groups/per/page switch
    this.fswPower = 0;                  // power switch 0=off, 1=on

    this.clear();

    this.window = window.open("", mnemonic);
    if (this.window) {
        this.shutDown();                // destroy any previously-existing window
        this.window = null;
    }
    this.doc = null;
    this.paper = null;
    this.endOfPaper = null;
    this.window = window.open("../webUI/D205ConsoleOutput.html", mnemonic,
            "location=no,scrollbars=no,resizable,width=688,height=508");
    this.window.addEventListener("load", D205Processor.bindMethod(this,
            D205ConsoleOutput.prototype.onload), false);
}

D205ConsoleOutput.prototype.keyFilter = [    // Filter keyCode values to valid BIC ones
        0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,  // 00-0F
        0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,0x3F,  // 10-1F
        0x20,0x21,0x22,0x23,0x24,0x25,0x26,0x3F,0x28,0x29,0x2A,0x2B,0x2C,0x2D,0x2E,0x2F,  // 20-2F
        0x30,0x31,0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39,0x3A,0x3B,0x3C,0x3D,0x3E,0x3F,  // 30-3F
        0x40,0x41,0x42,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x4A,0x4B,0x4C,0x4D,0x4E,0x4F,  // 40-4F
        0x50,0x51,0x52,0x53,0x54,0x55,0x56,0x57,0x58,0x59,0x5A,0x5B,0x3F,0x5D,0x3F,0x7E,  // 50-5F
        0x3F,0x41,0x42,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x4A,0x4B,0x4C,0x4D,0x4E,0x4F,  // 60-6F
        0x50,0x51,0x52,0x53,0x54,0x55,0x56,0x57,0x58,0x59,0x5A,0x7B,0x7C,0x7D,0x7E,0x3F]; // 70-7F

D205ConsoleOutput.cardaTronXlate = [        // translate internal CardaTron code to ANSI
        " ", "?", "?", ".", "¤", "?", "?", "?", "?", "?",       // 00-09
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
D205ConsoleOutput.prototype.$$ = function $$(e) {
    return this.doc.getElementById(e);
};

/**************************************/
D205ConsoleOutput.prototype.clear = function clear() {
    /* Initializes (and if necessary, creates) the SPO unit state */

    this.ready = false;                 // ready status
    this.busy = false;                  // busy status

    this.formatDigit = 0;               // format digit from PO or POF C8
    this.suppressCount = 0;             // suppress format control counter increment
    this.alphaFirstDigit = 0;           // first digit of an alpha pair
    this.alphaLock = 0;                 // alpha translation enabled for format=4
    this.zeroSuppress = 0;              // currently suppressing leading zeroes
    this.stopPrintout = 0;              // idle processor if a printout command occurs
    this.printCol = 0;                  // current print column (0-relative)
    this.nextCharTime = 0;
};

/**************************************/
D205ConsoleOutput.prototype.appendEmptyLine = function appendEmptyLine(text) {
    /* Removes excess lines already printed, then appends a new text node
    to the <pre> element within the <iframe> */
    var count = this.paper.childNodes.length;
    var line = text || "";

    while (--count > this.maxScrollLines) {
        this.paper.removeChild(this.paper.firstChild);
    }
    this.paper.lastChild.nodeValue += "\n";     // newline
    this.paper.appendChild(this.doc.createTextNode(line));
    this.printCol = line.length;
};

/**************************************/
D205ConsoleOutput.prototype.printChar = function printChar(c) {
    /* Echoes the character "c" to the output device */
    var line = this.paper.lastChild.nodeValue;
    var len = line.length;

    if (len < 1) {
        line = c;
        ++this.printCol;
    } else if (len < 120) {
        line += c;
        ++this.printCol;
    } else {
         line = line.substring(0, 119) + c;
    }
    this.paper.lastChild.nodeValue = line;
};

/**************************************/
D205ConsoleOutput.prototype.outputChar = function outputChar() {
    /* Outputs one character from the buffer to the SPO. If more characters remain
    to be printed, schedules itself 100 ms later to print the next one, otherwise
    calls finished(). If the column counter exceeds 72, a CR/LF pair is output.
    A CR/LF pair is also output at the end of the message */
    var nextTime = this.nextCharTime + this.charPeriod;
    var delay = nextTime - performance.now();

    this.nextCharTime = nextTime;
    if (this.printCol < 72) {           // print the character
        if (this.bufIndex < this.bufLength) {
            this.printChar(this.buffer[this.bufIndex++]);
            this.outTimer = setCallback(this.mnemonic, this, delay, this.outputChar);
        } else {                        // set up for the final CR/LF
            this.printCol = 72;
            this.outTimer = setCallback(this.mnemonic, this, delay, this.outputChar);
        }
    } else if (this.printCol == 72) {   // delay to fake the output of a carriage-return
        ++this.printCol;
        this.outTimer = setCallback(this.mnemonic, this, delay+this.charPeriod, this.outputChar);
    } else {                            // actually output the CR/LF
        this.printCol = 0;
        this.endOfPaper.scrollIntoView();
        if (this.bufIndex < this.bufLength) {
            this.outTimer = setCallback(this.mnemonic, this, delay, this.outputChar);
        } else {                        // message text is exhausted
            this.finish(this.errorMask, this.bufLength);  // report finish with any errors
            if (this.spoLocalRequested) {
                this.setLocal();
            } else {
                this.spoState = this.spoRemote;
            }
        }
    }
};

/**************************************/
D205ConsoleOutput.prototype.requestInput = function requestInput() {
    /* Handles the request for keyboard input, from either the Input Request
    button or the ESC key */

    if (this.spoState == this.spoRemote || this.spoState == this.spoOutput) {
        B5500Util.addClass(this.$$("SPOInputRequestBtn"), "yellowLit");
        this.signal();
    }
};

/**************************************/
D205ConsoleOutput.prototype.terminateInput = function terminateInput() {
    /* Handles the End of Message event. Turns off the Ready lamp, transfers
    the message text from the input element to the "paper", then calls
    outputChar(), which will find bufIndex==bufLength, output a new-line,
    set the state to Remote, and call finish() for us. Slick, eh? */
    var text = this.inputBox.value;
    var len = text.length;
    var x;

    if (this.spoState == this.spoInput) {
        B5500Util.removeClass(this.$$("SPOReadyBtn"), "yellowLit");
        B5500Util.removeClass(this.inputBox, "visible");
        this.appendEmptyLine(text.substring(0, 72));
        for (x=0; x<len; ++x) {
            this.buffer[this.bufIndex++] = text.charCodeAt(x);
        }
        this.endOfPaper.scrollIntoView();
        this.inputBox.value = "";
        this.bufLength = this.bufIndex;
        this.nextCharTime = performance.now();
        this.outputChar();
        this.window.focus();
    }
};

/**************************************/
D205ConsoleOutput.prototype.keyPress = function keyPress(ev) {
    /* Handles keyboard character events. Depending on the state of the unit,
    either buffers the character for transmission to the I/O Unit, simply echos
    it to the printer, or ignores it altogether */
    var c = ev.charCode;
    var len = ev.target.value.length;
    var x;

    switch (this.spoState) {
    case this.spoInput:
        if (c == 0x7E || c == 0x5F) {   // "~" or "_" (B5500 group-mark)
            ev.preventDefault();
            ev.stopPropagation();
            c = this.keyFilter[c];
            this.terminateInput();
        } else if (c >= 0x20 && c < 0x7E) {
            ev.preventDefault();
            ev.stopPropagation();
            c = this.keyFilter[c];
            if (len < 72) {
                ev.target.value += String.fromCharCode(c);
            } else {
                this.appendEmptyLine(ev.target.value);
                this.endOfPaper.scrollIntoView();
                for (x=0; x<len; ++x) {
                    this.buffer[this.bufIndex++] = ev.target.value.charCodeAt(x);
                }
                ev.target.value = String.fromCharCode(c);
            }
        }
        break;

    case this.spoLocal:
        if (c >= 0x20 && c <= 0x7E) {
            ev.preventDefault();
            ev.stopPropagation();
            c = this.keyFilter[c];
            if (len < 72) {
                ev.target.value += String.fromCharCode(c);
            } else {
                this.appendEmptyLine(ev.target.value);
                this.endOfPaper.scrollIntoView();
                ev.target.value = String.fromCharCode(c);
            }
        }
        break;
    }
};

/**************************************/
D205ConsoleOutput.prototype.keyDown = function keyDown(ev) {
    /* Handles key-down events in the window to capture ESC and Enter
    keystrokes */
    var c = ev.keyCode;

    switch (c) {
    case 0x1B:                  // ESC
        switch (this.spoState) {
        case this.spoRemote:
        case this.spoOutput:
            this.requestInput();
            break;
        case this.spoInput:
            this.cancelInput();
            break;
        }
        ev.preventDefault();
        ev.stopPropagation();
        break;
    case 0x0D:                  // Enter
        switch (this.spoState) {
        case this.spoInput:
            this.terminateInput();
            break;
        case this.spoLocal:
            this.endOfPaper.scrollIntoView();
            this.appendEmptyLine(this.inputBox.value.substring(0, 72));
            this.inputBox.value = "";
            break;
        }
        ev.preventDefault();
        ev.stopPropagation();
        break;
    }
};

/**************************************/
D205ConsoleOutput.prototype.copyPaper = function copyPaper(ev) {
    /* Copies the text contents of the "paper" area of the SPO, opens a new
    temporary window, and pastes that text into the window so it can be copied
    or saved */
    var text = ev.target.textContent;
    var title = "D205 " + this.mnemonic + " Text Snapshot";
    var win = window.open("./D205FramePaper.html", this.mnemonic + "-Snapshot",
            "scrollbars,resizable,width=500,height=500");

    win.moveTo((screen.availWidth-win.outerWidth)/2, (screen.availHeight-win.outerHeight)/2);
    win.addEventListener("load", function() {
        var doc;

        doc = win.document;
        doc.title = title;
        doc.getElementById("Paper").textContent = text;
    });

    ev.preventDefault();
    ev.stopPropagation();
};

/**************************************/
D205ConsoleOutput.prototype.resizeWindow = function resizeWindow(ev) {
    /* Handles the window onresize event by scrolling the "paper" so it remains at the end */

    this.endOfPaper.scrollIntoView();
};

/**************************************/
D205ConsoleOutput.prototype.beforeUnload = function beforeUnload(ev) {
    var msg = "Closing this window will make the device unusable.\n" +
              "Suggest you stay on the page and minimize this window instead";

    ev.preventDefault();
    ev.returnValue = msg;
    return msg;
};

/**************************************/
D205ConsoleOutput.prototype.onload = function onload() {
    /* Initializes the Console Output window and user interface */
    var x;

    this.doc = this.window.document;
    this.doc.title = "retro-205 " + this.mnemonic;
    this.paper = this.$$("Paper");
    this.endOfPaper = this.$$("EndOfPaper");
    this.appendEmptyLine();

    this.window.addEventListener("beforeunload",
            D205ConsoleOutput.prototype.beforeUnload, false);
    this.window.addEventListener("resize",
            D205Processor.bindMethod(this, D205ConsoleOutput.prototype.resizeWindow), false);
    this.window.addEventListener("keydown",
            D205Processor.bindMethod(this, D205ConsoleOutput.prototype.keyDown), false);
    this.window.addEventListener("keypress",
            D205Processor.bindMethod(this, D205ConsoleOutput.prototype.keyPress), false);
    this.$$("FlexowriterPlaten").addEventListener("keydown",
            D205Processor.bindMethod(this, D205ConsoleOutput.prototype.keyDown), false);
    this.paper.addEventListener("dblclick",
            D205Processor.bindMethod(this, D205ConsoleOutput.prototype.copyPaper), false);

    //this.window.moveTo(screen.availWidth-this.window.outerWidth,
    //                   screen.availHeight-this.window.outerHeight);
    this.window.moveTo(0, 0);
    this.window.focus();
};

/**************************************/
D205ConsoleOutput.prototype.setFormat = function setFormat(outputUnit, formatDigit, successor) {
    /* Sets the format digit at the beginning of output for a word, or as the
    result of a POF instruction. Delays for an appropriate amount of time, then
    calls the Processor's successor function. The outputUnit is not used */
    var delay = 120;                    // default delay, ms
    var tabCol;

    switch (formatDigit) {
    case 2:                             // suppress sign, print decimal point instead
    case 3:                             // suppress sign, print space instead
    case 4:                             // translate alphanumerically
        this.alphaLock = 0;
        this.formatDigit = formatDigit;
        break;
    case 1:                             // feed one inch of blank tape
        // paper tape punch only
        break;
    case 5:                             // actuate carriage return
        this.appendEmptyLine();
        this.endOfPaper.scrollIntoView();
        delay = 200;
        break;
    case 6:                             // actuate tab key
        tabCol = Math.floor((this.printCol + 8)/8)*8;
        while (this.printCol < tabCol) {
            this.printChar(" ");
        }
        break;
    case 7:                             // set stop printout flag
        this.stopPrintout = 1;
        break;
    case 8:                             // actuate space bar
        this.printChar(" ");
        break;
    }
    this.nextCharTime = performance.now() + delay;
    setCallback(this.mnemonic, this, delay, successor);
};

/**************************************/
D205ConsoleOutput.prototype.setSignDigit = function setSignDigit(outputUnit, signDigit, successor) {
    /* Outputs (or not) the sign digit of a word. Delays for an appropriate amount of time, then
    calls the Processor's successor function */
    var delay = 70;                     // default delay, ms

    this.zeroSuppress = this.fswZeroSuppress;
    switch (this.formatDigit) {
    case 2:                             // suppress sign, print decimal point instead
        this.zeroSuppress = 0;
        this.printChar(".");
        break;
    case 3:                             // suppress sign, print space instead
        this.printChar(" ");
        break;
    case 4:                             // translate alphanumerically -- ignore the sign
        break;
    default:
        this.printChar((signDigit & 0x01) ? "-" : "+");
        break;
    }
    this.nextCharTime = performance.now() + delay;
    setCallback(this.mnemonic, this, delay, successor);
};

/**************************************/
D205ConsoleOutput.prototype.setNumberDigit = function setNumberDigit(outputUnit, digit, successor) {
    /* Sets the current digit in the translator and outputs it if appropriate */
    var charCode;
    var delay = 70;                     // default delay

    if (this.formatDigit == 4) {        // translate alphanumerically
        if (this.alphaLock) {
            charCode = this.alphaFirstDigit*10 + digit;
            this.printChar(D205ConsoleOutput.cardaTronXlate[charCode]);
            delay = 62;
        } else {
            this.alphaLock = 1;
            this.alphaFirstDigit = digit;
            delay = 48;
        }
    } else if (digit == 0 && this.zeroSuppress) {
        this.printChar(" ");
    } else {
        this.zeroSuppress = 0;
        this.printChar(digit.toString());
    }
    this.nextCharTime = performance.now() + delay;
    setCallback(this.mnemonic, this, delay, successor);
};

/**************************************/
D205ConsoleOutput.prototype.setFinish = function setFinish(outputUnit, controlDigit, successor) {
    /* Signals end of output for a word. Delays for an appropriate amount of time, then
    calls the Processor's successor function. The outputUnit is not used */
    var delay = 140;                    // default delay, ms

    this.formatDigit = this.alphaLock = 0;

    this.printChar(" ");                // >>>>>>>>>> TEMPORARY UNTIL FORMAT CONTROL WORKS <<<<<<<<<<

    if (controlDigit & 0x80) {
        // suppress line/group counting
    } else {
        // perform line/group counting
    }
    this.nextCharTime = performance.now() + delay;
    setCallback(this.mnemonic, this, delay, successor);
};

/**************************************/
D205ConsoleOutput.prototype.shutDown = function shutDown() {
    /* Shuts down the device */

    if (this.outTimer) {
        clearCallback(this.outTimer);
    }
    this.window.removeEventListener("beforeunload", D205ConsoleOutput.prototype.beforeUnload, false);
    this.window.close();
};
