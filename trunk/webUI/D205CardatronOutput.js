/***********************************************************************
* retro-205/emulator D205CardatronOutput.js
************************************************************************
* Copyright (c) 2015, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* Datatron 205 Cardatron Output Unit module.
*
* Defines a line-printer/card-punch peripheral unit type.
*
************************************************************************
* 2015-02-15  P.Kimpel
*   Original version, from retro-b5500 B5500LinePrinter.js and D205CardatronInput.js.
***********************************************************************/
"use strict";

/**************************************/
function D205CardatronOutput(mnemonic, unitIndex, isPrinter) {
    /* Constructor for the Cardatron Output object */
    var h = screen.availHeight*0.25;    // window height
    var left = 0;                       // (temporary window x-offset)
    var tks = D205CardatronOutput.trackSize;
    var w = (isPrinter ? 820 : 650);    // window width
    var x;

    this.mnemonic = mnemonic;           // Unit mnemonic
    this.unitIndex = unitIndex;         // Output unit number
    this.isPrinter = isPrinter;         // Whether printer (true) or punch (false)
    this.lineWidth = (isPrinter ? 120 : 80);

    this.timer = 0;                     // setCallback() token
    this.useAlgolGlyphs = false;        // format for special Algol chars
    this.useGreenbar = isPrinter;       // format "greenbar" shading on the paper
    this.lpi = 6;                       // lines/inch (actually, lines per greenbar group, should be even)
    this.boundOutputFormatDigit = D205Util.bindMethod(this, D205CardatronOutput.prototype.outputFormatDigit);
    this.boundOutputDigit = D205Util.bindMethod(this, D205CardatronOutput.prototype.outputDigit);

    this.clear();

    // Line buffer for assembling the print/punch line
    this.lineBuffer = new Uint8Array(D205CardatronOutput.trackSize + 4);

    // Buffer drum: information band is [0], format bands are [1]-[5]
    this.bufferDrum = new ArrayBuffer(tks*6);
    this.info = new Uint8Array(this.bufferDrum, 0, tks);        // information band
    this.formatBand = [
            null,                                               // no format band 0
            new Uint8Array(this.bufferDrum, tks*1, tks),        // format band 1
            new Uint8Array(this.bufferDrum, tks*2, tks),        // format band 2
            new Uint8Array(this.bufferDrum, tks*3, tks),        // format band 3
            new Uint8Array(this.bufferDrum, tks*4, tks),        // format band 4
            new Uint8Array(this.bufferDrum, tks*5, tks)];       // format band 5

    // Device window
    this.window = window.open("", mnemonic);
    if (this.window) {
        this.shutDown();                // destroy the previously-existing window
        this.window = null;
    }
    this.doc = null;
    this.barGroup = null;               // current greenbar line group
    this.paperDoc = null;               // the content document for the paper frame
    this.paper = null;                  // the "paper" we print on
    this.endOfPaper = null;             // dummy element used to control scrolling
    this.paperMeter = null;             // <meter> element showing amount of paper remaining
    this.window = window.open("../webUI/D205CardatronOutput.html", mnemonic,
            "location=no,scrollbars,resizable,width=" + w + ",height=" + h +
            ",left=" + (screen.availWidth - (7-unitIndex)*24) +
            ",top=" + (screen.availHeight - h - (7-unitIndex)*24));
    this.window.addEventListener("load",
            D205Util.bindMethod(this, D205CardatronOutput.prototype.printerOnLoad), false);
}

/**************************************/

D205CardatronOutput.prototype.linesPerMinute = 150;     // IBM Type 407 tabulator
D205CardatronOutput.prototype.maxPaperLines = 150000;   // maximum printer scrollback (about a box of paper)
D205CardatronOutput.prototype.rtrimRex = /\s+$/;        // regular expression for right-trimming lines
D205CardatronOutput.prototype.theColorGreen = "#CFC";   // for greenbar shading

D205CardatronOutput.trackSize = 316;     // digits
D205CardatronOutput.digitTime = 60/21600/D205CardatronOutput.trackSize;
                                        // one digit time, about 8.8 µs at 21600rpm
D205CardatronOutput.digitsPerMilli = 0.001/D205CardatronOutput.digitTime;
                                        // digit times per millisecond: 113.4

// Translate info band zone & numeric digits to ASCII character codes.
// See U.S. Patent 3,072,328, January 8, 1963, L.L. Bewley et al, Figure 2.
D205CardatronOutput.prototype.outputXlate = [
        // 0    1    2    3    4    5    6    7    8    9   10   11   12
        [0x20,0x31,0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39,0x20,0x23,0x40],     // zone digit 0
        [0x26,0x41,0x42,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x20,0x2E,0xA4],     // zone digit 1
        [0x2D,0x4A,0x4B,0x4C,0x4D,0x4E,0x4F,0x50,0x51,0x52,0x20,0x24,0x2A],     // zone digit 2
        [0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20],     // zone digit 3
        [0x30,0x2F,0x53,0x54,0x55,0x56,0x57,0x58,0x59,0x5A,0x20,0x2C,0x25],     // zone digit 4
        [0x7B,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20],     // zone digit 5
        [0x21,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20],     // zone digit 6
        [0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20],     // zone digit 7
        [0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20],     // zone digit 8
        [0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20],     // zone digit 9
        [0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20],     // zone digit 10
        [0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20],     // zone digit 11
        [0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20]];    // zone digit 12

// Translate buffer zone digits to internal zone decades.
// Each row is indexed by the zone digit from the buffer drum info band;
// each column is indexed by the PREVIOUS numeric digit from the info band.
// See U.S. Patent 3,072,328, January 8, 1963, L.L. Bewley et al, Figure 12.
D205CardatronOutput.prototype.zoneXlate = [
        [0, 0, 0, 1, 1, 0, 0, 0, 0, 0],         // zone digit 0
        [1, 0, 0, 2, 2, 0, 0, 0, 0, 0],         // zone digit 1
        [2, 4, 0, 4, 4, 0, 0, 0, 0, 0],         // zone digit 2
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],         // zone digit 3
        [5, 1, 1, 1, 1, 1, 1, 1, 1, 1],         // zone digit 4
        [6, 2, 2, 2, 2, 2, 2, 2, 2, 2],         // zone digit 5
        [0, 0, 4, 4, 4, 4, 4, 4, 4, 4],         // zone digit 6
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],         // there are no zone=7 digits
        [4, 0, 0, 0, 0, 0, 0, 0, 0, 0],         // zone digit 8
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];        // there are no zone=9 digits


/**************************************/
D205CardatronOutput.prototype.clear = function clear() {
    /* Initializes (and if necessary, creates) the reader unit state */

    this.ready = false;                 // ready status
    this.bufferReady = true;            // buffer drum info band is ready for write
    this.writeRequested = false;        // Processor has initiated a write, waiting for buffer
    this.togNumeric = false;            // current digit came from zone (false) or numeric (true) punches

    this.paperLeft = this.maxPaperLines;// lines remaining in paper supply
    this.formFeedCount = 0;             // counter for triple-formfeed => rip paper
    this.groupLinesLeft = 0;            // lines remaining in current greenbar group
    this.topOfForm = false;             // start new page flag
    this.pendingSpaceBefore = -1;       // pending carriage control (eat the initial space-before)

    this.pendingCall = null;            // stashed pending function reference
    this.pendingParams = null;          // stashed pending function parameters
    this.kDigit = 0;                    // stashed reload-format band number
    this.tDigit = 0;                    // stashed Tab Select relay digit
    this.digitCount = 0;                // digit within word being returned (sign=10)
    this.lastNumericDigit = 0;          // last numeric digit encountered
    this.infoIndex = 0;                 // 0-relative offset into info band on drum
    this.selectedFormat = 0;            // currently-selected format band
};

/**************************************/
D205CardatronOutput.prototype.$$ = function $$(e) {
    return this.doc.getElementById(e);
};

/**************************************/
D205CardatronOutput.prototype.setFormatSelectLamps = function setFormatSelectLamps(format) {
    /* Sets the FS lamps on the panel from the low-order three bits of "format" */

    this.formatSelect1Lamp.set(format & 0x01);
    this.formatSelect2Lamp.set((format >>> 1) & 0x01);
    this.formatSelect4Lamp.set((format >>> 2) & 0x01);
};

/**************************************/
D205CardatronOutput.prototype.clearInfoBand = function clearInfoBand() {
    /* Clears the entire info band to zeroes */
    var x;

    this.infoIndex = 0;                 // restart at the beginning of the format band
    for (x=this.info.length-1; x>=0; --x) {
        this.info[x] = 0;
    }
};

/**************************************/
D205CardatronOutput.prototype.ClearBtn_onClick = function ClearBtn_onClick(ev) {
    /* Handle the click event for the CLEAR button */

    this.clearUnit();
};

/**************************************/
D205CardatronOutput.prototype.setPrinterReady = function setPrinterReady(ready) {
    /* Controls the ready-state of the line printer */

    this.formFeedCount = 0;
    if (ready && !this.ready) {
        D205Util.addClass(this.$$("COStartBtn"), "greenLit")
        D205Util.removeClass(this.$$("COStopBtn"), "redLit");
        this.ready = true;
    } else if (!ready && this.ready) {
        D205Util.removeClass(this.$$("COStartBtn"), "greenLit")
        D205Util.addClass(this.$$("COStopBtn"), "redLit");
        this.ready = false;
    }
};

/**************************************/
D205CardatronOutput.prototype.ripPaper = function ripPaper(ev) {
    /* Handles an event to clear the "paper" from the printer */

    this.formFeedCount = 0;
    if (this.window.confirm("Do you want to clear the \"paper\" from the printer?")) {
        D205Util.removeClass(this.$$("COEndOfPaperBtn"), "redLit");
        this.paperMeter.value = this.paperLeft = this.maxPaperLines;
        while (this.paper.firstChild) {
            this.paper.removeChild(this.paper.firstChild);
        }
    }
};

/**************************************/
D205CardatronOutput.prototype.appendLine = function appendLine(text) {
    /* Appends one line, with a trailing new-line character, to the current
    greenbar group, this.barGroup. This handles top-of-form and greenbar
    highlighting */
    var feed = "\n";

    if (this.groupLinesLeft <= 0) {
        // Start the green half of a greenbar group
        this.barGroup = this.doc.createElement("pre");
        this.paper.appendChild(this.barGroup);
        this.groupLinesLeft = this.lpi;
        if (!this.atTopOfForm) {
            this.barGroup.className = "paper greenBar";
        } else {
            this.atTopOfForm = false;
            this.barGroup.className = "paper greenBar topOfForm";
        }
    } else if (this.groupLinesLeft*2 == this.lpi) {
        // Start the white half of a greenbar group
        this.barGroup = this.doc.createElement("pre");
        this.paper.appendChild(this.barGroup);
        this.barGroup.className = "paper whiteBar";
    } else if (this.groupLinesLeft == 1) {
        feed = "";                      // no linefeed at end of a bar group
    } else if ((this.groupLinesLeft-1)*2 == this.lpi) {
        feed = "";                      // ditto
    }

    this.barGroup.appendChild(this.doc.createTextNode(text + feed));
    --this.groupLinesLeft;
};

/**************************************/
D205CardatronOutput.prototype.printLine = function printLine(text, spaceBefore) {
    /* Prints one line to the "paper", handling carriage control and greenbar
    group completion. For now, SPACE 0 (overprintng) is treated as single-spacing */
    var lines = 0;

    if (spaceBefore < 0) {              // skip to channel 1
        while(this.groupLinesLeft > 0) {
            ++lines;
            this.appendLine("\xA0");
        }
        this.atTopOfForm = true;
    } else {                            // space before print
        lines = spaceBefore;
        while (lines > 1) {
            --lines;
            --this.paperLeft;
            this.appendLine("\xA0");
        }
    }

    this.appendLine(text || "\xA0");
    if (this.paperLeft > 0) {
        this.paperMeter.value = this.paperLeft -= lines;
    } else {
        this.setPrinterReady(false);
        D205Util.addClass(this.$$("COEndOfPaperBtn"), "redLit");
    }
};

/**************************************/
D205CardatronOutput.prototype.finishWrite = function finishWrite() {
    /* Callback function activated after a line is printed/punched to set the
    buffer ready and reinitiate any pending write */

    this.bufferReady = true;
    this.startMachineLamp.set(0);
    this.setFormatSelectLamps(0);
    this.endOfPaper.scrollIntoView();
    if (this.writeRequested) {
        this.writeRequested = false;
        this.pendingCall.apply(this, this.pendingParams);
    }
};

/**************************************/
D205CardatronOutput.prototype.initiateWrite = function initiateWrite() {
    /* Initiate formatting of the output line/card from the buffer drum and
    writing it to the output device */
    var band = this.formatBand[this.selectedFormat];
    var fmax = band.length;             // max info/format band index
    var info = this.info;               // local reference to info band
    var lastNumeric = 0;                // last numeric digit
    var line;                           // ASCII line image
    var lx = this.lineBuffer.length;    // line image character index: start at end
    var nu = true;                      // numeric toggle: start as numeric
    var x = 0;                          // info/format band digit index

    // Map buffer drum digits to ASCII character codes
    for (x=0; x<fmax; ++x) {
        switch (band[x]) {
        case 0:                         // insert zero digit
            if (nu) {
                nu = false;
                lastNumeric = 0;
            } else {
                nu = true;
                this.lineBuffer[--lx] = this.outputXlate[0][lastNumeric];
            }
            break;
        case 1:                         // translate alphanumerically
            if (nu) {
                nu = false;
                lastNumeric = info[x];
            } else {
                nu = true;
                this.lineBuffer[--lx] = this.outputXlate[info[x]][lastNumeric];
            }
            break;
        case 2:                         // translate numerically
            nu = true;
            this.lineBuffer[--lx] = (lastNumeric = info[x]) + 0x30;
            break;
        default:                        // (3) delete info band digit
            break;
        } // switch band[x]
    } // for x

    // Convert to ASCII line image and determine carriage control
    line = String.fromCharCode.apply(null, this.lineBuffer.subarray(lx, this.lineWidth+lx));
    switch (this.tDigit) {
    case 1:                             // Relay 1 (eject page after printing)
    case 9:                             // same as 1
        this.printLine(line, this.pendingSpaceBefore);
        this.pendingSpaceBefore = 0;
        break;
    case 2:                             // Relay 2 (single space before and after printing)
        this.printLine(line, this.pendingSpaceBefore+1);
        this.pendingSpaceBefore = 1;
        break;
    case 3:                             // Relay 3 (eject page before printing)
    case 5:                             // Relay 5 (skip to channel 2 before printing)
    case 7:                             // Relay 3+5 (skip to channel 3 before printing)
        this.printLine(line, -1);
        this.pendingSpaceBefore = 0;
        break;
    case 4:                             // Relay 4 (double space before printing)
        this.printLine(line, this.pendingSpaceBefore+2);
        this.pendingSpaceBefore = 0;
        break;
    case 6:                             // Relay 2+4 (double space before and single space after printing)
        this.printLine(line, this.pendingSpaceBefore+2);
        this.pendingSpaceBefore = 1;
        break;
    default:                            // single space before printing
        this.printLine(line, this.pendingSpaceBefore+1);
        this.pendingSpaceBefore = 0;
        break;
    }

    setCallback(this.mnemonic, this, 60000/D205CardatronOutput.linesPerMinute, this.finishWrite);
};

/**************************************/
D205CardatronOutput.prototype.setAlgolGlyphs = function setAlgolGlyphs(makeItPretty) {
    /* Controls the display of Unicode glyphs for the special Algol characters */

    if (makeItPretty) {
        if (!this.useAlgolGlyphs) {
            D205Util.xlateDOMTreeText(this.paper, D205Util.xlateASCIIToAlgol);
        }
    } else {
        if (this.useAlgolGlyphs) {
            D205Util.xlateDOMTreeText(this.paper, D205Util.xlateAlgolToASCII);
        }
    }
    this.$$("COAlgolGlyphsCheck").checked = makeItPretty;
    this.useAlgolGlyphs = makeItPretty;
};

/**************************************/
D205CardatronOutput.prototype.setGreenbar = function setGreenbar(useGreen) {
    /* Controls the display of "greenbar" shading on the paper */
    var rule = null;
    var rules = null;
    var sheet;
    var ss = this.paperDoc.styleSheets;
    var x;

    // First, find the embedded style sheet for the paper frame.
    for (x=ss.length-1; x>=0; --x) {
        sheet = ss[x];
        if (sheet.ownerNode.id == "PaperFrameStyles") {
            rules = sheet.cssRules;
            // Next, search through the rules for the one that controls greenbar shading.
            for (x=rules.length-1; x>=0; --x) {
                rule = rules[x];
                if (rule.selectorText.toLowerCase() == "pre.greenbar") {
                    // Found it: now flip the background color.
                    rule.style.backgroundColor = (useGreen ? this.theColorGreen : "white");
                }
            }
            break;      // out of for loop
        }
    }
    this.$$("COGreenbarCheck").checked = useGreen;
    this.useGreenbar = useGreen;
};

/**************************************/
D205CardatronOutput.prototype.COStartBtn_onClick = function COStartBtn_onClick(ev) {
    /* Handle the click event for the START button */

    if (!this.ready && this.paperLeft > 0) {
        this.formFeedCount = 0;
        this.setPrinterReady(true);
    }
};

/**************************************/
D205CardatronOutput.prototype.COStopBtn_onClick = function COStopBtn_onClick(ev) {
    /* Handle the click event for the STOP button */

    if (this.ready) {
        this.formFeedCount = 0;
        this.setPrinterReady(false);
    }
};

/**************************************/
D205CardatronOutput.prototype.COFormFeedBtn_onClick = function COFormFeedBtn_onClick(ev) {
    /* Handle the click event for the Skip To Heading button */

    if (!this.ready) {
        this.printLine("", -1);
        this.endOfPaper.scrollIntoView();
        if (++this.formFeedCount >= 3) {
            this.ripPaper();
        }
    }
};

/**************************************/
D205CardatronOutput.prototype.COEndOfPaperBtn_onClick = function COEndOfPaperBtn_onClick(ev) {
    /* Handle the click event for the End Of Paper button. If the printer is in
    and end-of-paper condition, this will make the printer ready, but it will
    still be in an EOP condition. The next time a print line is received, the
    EOP condition will force it not-ready again. You can print only one line
    at a time (presumably to the end of the current page). The EOP condition can
    be cleared by clicking Skip To Heading three times to "rip" the paper */

    if (this.paperLeft <= 0 && !this.ready) {
        this.formFeedCount = 0;
        D205Util.removeClass(this.$$("COEndOfPaperBtn"), "redLit");
        this.setPrinterReady(true);
    }
};

/**************************************/
D205CardatronOutput.prototype.COAlgolGlyphsCheck_onClick = function COAlgolGlyphsCheck_onClick(ev) {
    /* Handle the click event for the Algol Glyphs checkbox */

    this.setAlgolGlyphs(ev.target.checked);
};

/**************************************/
D205CardatronOutput.prototype.COGreenbarCheck_onClick = function COGreenbarCheck_onClick(ev) {
    /* Handle the click event for the Greenbar checkbox */

    this.setGreenbar(ev.target.checked);
};

/**************************************/
D205CardatronOutput.prototype.beforeUnload = function beforeUnload(ev) {
    var msg = "Closing this window will make the device unusable.\n" +
              "Suggest you stay on the page and minimize this window instead";

    ev.preventDefault();
    ev.returnValue = msg;
    return msg;
};

/**************************************/
D205CardatronOutput.prototype.printerOnLoad = function printerOnLoad() {
    /* Initializes the line printer window and user interface */
    var body;
    var de;
    var newChild;

    this.doc = this.window.document;
    de = this.doc.documentElement;
    this.doc.title = "retro-205 Cardatron Output " + this.mnemonic;

    body = this.$$("CODiv");
    this.paperDoc = this.$$("COPaperFrame").contentDocument;
    this.paper = this.paperDoc.getElementById("Paper");
    this.endOfPaper = this.paperDoc.getElementById("EndOfPaper");
    this.paperMeter = this.$$("COPaperMeter");

    newChild = this.paperDoc.createElement("div");
    newChild.id = this.paper.id;
    this.paper.parentNode.replaceChild(newChild, this.paper);
    this.paper = newChild;

    this.startMachineLamp = new NeonLamp(body, null, null, "StartMachineLamp");
    this.startMachineLamp.setCaption("SM", true);

    this.formatSelect1Lamp = new NeonLamp(body, null, null, "FormatSelect1Lamp");
    this.formatSelect1Lamp.setCaption("FS1", true);
    this.formatSelect2Lamp = new NeonLamp(body, null, null, "FormatSelect2Lamp");
    this.formatSelect2Lamp.setCaption("FS2", true);
    this.formatSelect4Lamp = new NeonLamp(body, null, null, "FormatSelect4Lamp");
    this.formatSelect4Lamp.setCaption("FS4", true);

    this.setAlgolGlyphs(this.useAlgolGlyphs);
    this.setGreenbar(this.useGreenbar);
    this.paperMeter.max = this.maxPaperLines;
    this.paperMeter.low = this.maxPaperLines*0.1;
    this.paperMeter.value = this.paperLeft = this.maxPaperLines;
    this.setPrinterReady(true);

    this.window.addEventListener("beforeunload",
            D205CardatronOutput.prototype.beforeUnload, false);
    this.$$("COStopBtn").addEventListener("click",
            D205Util.bindMethod(this, D205CardatronOutput.prototype.COStopBtn_onClick), false);
    this.$$("COStartBtn").addEventListener("click",
            D205Util.bindMethod(this, D205CardatronOutput.prototype.COStartBtn_onClick), false);
    this.$$("COEndOfPaperBtn").addEventListener("click",
            D205Util.bindMethod(this, D205CardatronOutput.prototype.COEndOfPaperBtn_onClick), false);
    this.$$("COFormFeedBtn").addEventListener("click",
            D205Util.bindMethod(this, D205CardatronOutput.prototype.COFormFeedBtn_onClick), false);
    this.$$("COAlgolGlyphsCheck").addEventListener("click",
            D205Util.bindMethod(this, D205CardatronOutput.prototype.COAlgolGlyphsCheck_onClick), false);
    this.$$("ClearBtn").addEventListener("click",
            D205Util.bindMethod(this, D205CardatronOutput.prototype.ClearBtn_onClick));

    if (!this.isPrinter) {
        this.$$("COGreenbarCheck").disabled = true;
    } else {
        this.$$("COGreenbarCheck").addEventListener("click",
                D205Util.bindMethod(this, D205CardatronOutput.prototype.COGreenbarCheck_onClick), false);
    }

    this.window.resizeBy(de.scrollWidth - this.window.innerWidth + 4, // kludge for right-padding/margin
                         de.scrollHeight - this.window.innerHeight);
};

/**************************************/
D205CardatronOutput.prototype.outputDigit = function outputDigit(
        d, signalOK, signalFinished) {
    /* Receives the next info band digit from the Processor and stores it under
    control of the selected format band. signalOK is the callback function to
    request the next digit from the Processor; signalFinished is the callback
    function to tell the Processor we are done with data transfer */
    var band;                           // local copy of format band
    var done = false;                   // loop control
    var drumAddr;                       // buffer drum address
    var info = this.info;               // local reference to info band
    var latency = 0;                    // drum latency for first digit of a word
    var x = this.infoIndex;             // current info/format band index

    band = this.formatBand[this.selectedFormat];
    if (this.digitCount == 0) {
        // For the first digit of a word, note the current buffer drum digit address
        drumAddr = (performance.now()*D205CardatronOutput.digitsPerMilli) % D205CardatronOutput.trackSize;
        latency = (x - drumAddr + D205CardatronOutput.trackSize) % D205CardatronOutput.trackSize;
    }

    do {
        if (x >= info.length) {
            done = true;
        } else {
            // Translate the current digit
            switch (band[x]) {
            case 0:                     // insert 0 digit
                this.togNumeric = !this.togNumeric;
                info[x] = this.lastNumericDigit = 0;
                ++x;
                // we are not done yet...
                break;
            case 1:                     // translate zone/numeric digit
                if (this.togNumeric) {
                    // Numeric digit: straight translation except for 3-8 and 4-8 punches
                    this.togNumeric = false;    // next is a zone digit
                    info[x] = this.lastNumericDigit = d;
                } else {
                    // Zone digit: requires special handling in the sign-digit position
                    this.togNumeric = true;     // next is a numeric digit
                    if (this.digitCount < 10) {
                        // If the prior numeric digit was 3 or 4 AND this zone is 0-3,
                        // store an 11 or 12 for the numeric digit to indicate a 3-8 or 4-8 punch.
                        if (d < 4) {
                            if (x > 0 && (this.lastNumericDigit == 3 || this.lastNumericDigit == 4)) {
                                info[x-1] = this.lastNumericDigit+8;
                            }
                        }
                        info[x] = this.zoneXlate[d][this.lastNumericDigit];
                    } else {
                        // For a zone digit in the sign position, store a 5 (+) or 6 (-)
                        // so that the sign will be printed/punched as a zone 11/12.
                        info[x] = (d & 0x01) + 5;
                    }
                }
                ++x;
                done = true;
                break;
            case 2:                     // translate numerically
                this.togNumeric = true; // next is forced to be another numeric digit
                info[x] = this.lastNumericDigit = d;
                ++x;
                done = true;
                break;
            default:                    // (3) delete the digit -- store nothing
                ++x;
                done = true;
                break;
            } // switch band[x]
        }
    } while (!done);

    if (x >= info.length) {
        // At end of info band -- finish the data transfer and start the I/O
        this.initiateWrite();
        signalFinished();
    } else {
        this.infoIndex = x;
        if (this.digitCount < 10) {
            ++this.digitCount;
        } else {
            this.digitCount = 0;        // end of word
        }

        if (latency == 0) {
            signalOK(this.boundOutputDigit);
        } else {
            // For the first digit of the word, delay until buffer drum was in position
            setCallback(this.mnemonic, this, latency/D205CardatronOutput.digitsPerMilli,
                   signalOK, this.boundOutputDigit);
        }
    }
};

/**************************************/
D205CardatronOutput.prototype.outputInitiate = function outputInitiate(
        kDigit, tDigit, signalOK, signalFinished) {
    /* Initiates a write to the buffer drum on this unit. kDigit is the
    second numeric digit from the instruction word containing the format number.
    tDigit is the first numeric digit from the instruction word and sets the
    Tab Select relays for the IBM device. We use it for carriage control as
    implemented by the standard Burroughs 205/220 plugboard for the 407:
        0 = No relays (single space before printing)
        1 = Relay 1 (eject page after printing)
        2 = Relay 2 (single space before and after printing)
        3 = Relay 3 (eject page before printing)
        4 = Relay 4 (double space before printing)
        5 = Relay 5 (skip to channel 2 before printing)
        6 = Relay 2+4 (double space before and single space after printing)
        7 = Relay 3+5 (skip to channel 3 before printing)
        8 = same as 0
        9 = same as 1
    Carriage control is ignored for punch devices and always set to single spacing.
    signalOK is the callback function that will request the next digit from the
    processor. signalFinished is the callback function that tells the Processor
    we're done. If the buffer is not ready, simply sets the writeRequested flag
    and exits after stashing kDigit and the callbacks */

    if (!this.bufferReady) {
        this.writeRequested = true;     // wait for the buffer to be emptied
        this.pendingCall = outputInitiate;
        this.pendingParams = [kDigit, tDigit, signalOK, signalFinished];
    } else if (kDigit > 9) {
        signalFinished();
    } else {
        this.kDigit = kDigit;
        this.tDigit = (this.isPrinter ? tDigit : 0);
        this.selectedFormat = ((kDigit >>> 1) & 0x07) + 1;
        this.startMachineLamp.set(1);
        this.setFormatSelectLamps(this.selectedFormat);
        this.digitCount = 0;
        this.togNumeric = true;
        this.lastNumericDigit = 0;
        this.bufferReady = false;
        this.clearInfoBand();
        setCallback(this.mnemonic, this,
                D205CardatronOutput.trackSize/D205CardatronOutput.digitsPerMilli*2.5,
                signalOK, this.boundOutputDigit); // request the first data digit
    }
};

/**************************************/
D205CardatronOutput.prototype.outputReadyInterrogate = function outputReadyInterrogate() {
    /* Returns the current ready status of the output unit */

    return this.bufferReady;
};

/**************************************/
D205CardatronOutput.prototype.outputFormatInitiate = function outputFormatInitiate(
        kDigit, signalOK, signalFinished) {
    /* Initiates the loading of a format band on this unit. kDigit is the
    second numeric digit from the instruction word, the low-order bit is ignored
    and the remaining three bits indicate the format band to be loaded. signalOK
    is the callback function that will trigger the Processor to send the next digit.
    signalFinished is the callback function that will signal the Processor to
    terminate the I/O */

    if (kDigit > 9) {
        signalFinished();
    } else {
        this.kDigit = kDigit;
        this.selectedFormat = ((kDigit >>> 1) & 0x07) + 1;
        this.infoIndex = 0;             // start at the beginning of the format band
        this.digitCount = 0;
        this.togNumeric = true;
        this.lastNumericDigit = 0;
        this.setFormatSelectLamps(this.selectedFormat);
        setCallback(this.mnemonic, this,
                D205CardatronOutput.trackSize/D205CardatronOutput.digitsPerMilli*2.5,
                signalOK, this.boundOutputFormatDigit); // request the first format digit
    }
};

/**************************************/
D205CardatronOutput.prototype.outputFormatDigit = function outputFormatDigit(
        d, signalOK, signalFinished) {
    /* Receives the next output format band digit from the Processor and stores it */

    this.formatBand[this.selectedFormat][this.infoIndex] = d;
    if (this.infoIndex < D205CardatronOutput.trackSize) {
        ++this.infoIndex;
        signalOK(this.boundOutputFormatDigit);
    } else {
        this.setFormatSelectLamps(0);
        signalFinished();
    }
};

/**************************************/
D205CardatronOutput.prototype.clearUnit = function clearUnit() {
    /* Clears the output unit and resets all internal state */

    this.$$("CRFileSelector").value = null;     // reset the control so the same file can be reloaded
    this.bufferReady = true;
    this.SetPrinterReady(true);
    this.startMachineLamp.set(0);
    this.setFormatSelectLamps(0);

    this.clear();
    if (this.timer) {
        clearCallback(this.timer);
        this.timer = 0;
    }
};

/**************************************/
D205CardatronOutput.prototype.shutDown = function shutDown() {
    /* Shuts down the device */

    if (this.timer) {
        clearCallback(this.timer);
    }
    this.window.removeEventListener("beforeunload", D205CardatronOutput.prototype.beforeUnload);
    this.window.close();
};
