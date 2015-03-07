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
    var w = (isPrinter ? 840 : 560);    // window width
    var x;

    this.mnemonic = mnemonic;           // Unit mnemonic
    this.unitIndex = unitIndex;         // Output unit number
    this.isPrinter = isPrinter;         // Whether printer (true) or punch (false)
    this.lineWidth = (isPrinter ? 120 : 80);
    this.linesPerMinute = (isPrinter ? 150 : 100); // IBM 407=150 LPM, IBM 523=100 CPM

    this.timer = 0;                     // setCallback() token
    this.useAlgolGlyphs = false;        // format for special Algol chars
    this.useGreenbar = isPrinter;       // format "greenbar" shading on the paper (printer only)
    this.isGreenbarCapable = isPrinter; // whether to use greenbar <pre> groups
    this.lpi = 6;                       // lines/inch (actually, lines per greenbar group, should be even)
    this.boundOutputFormatWord = D205Util.bindMethod(this, D205CardatronOutput.prototype.outputFormatWord);
    this.boundOutputWord = D205Util.bindMethod(this, D205CardatronOutput.prototype.outputWord);

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
    this.supplyDoc = null;              // the content document for the supply frame
    this.supply = null;                 // the "paper" or "cards" we print/punch on
    this.endOfSupply = null;            // dummy element used to control scrolling
    this.supplyMeter = null;            // <meter> element showing amount of paper/card supply remaining
    this.window = window.open("../webUI/D205CardatronOutput.html", mnemonic,
            "location=no,scrollbars,resizable,width=" + w + ",height=" + h +
            ",left=" + (screen.availWidth - (7-unitIndex)*24) +
            ",top=" + (screen.availHeight - h - (7-unitIndex)*24));
    this.window.addEventListener("load",
            D205Util.bindMethod(this, D205CardatronOutput.prototype.deviceOnLoad), false);
}

/**************************************/

D205CardatronOutput.prototype.maxSupplyLines = 150000;  // maximum output scrollback (about a box of paper)
D205CardatronOutput.prototype.rtrimRex = /\s+$/;        // regular expression for right-trimming lines
D205CardatronOutput.prototype.theColorGreen = "#CFC";   // for greenbar shading

D205CardatronOutput.trackSize = 316;     // digits
D205CardatronOutput.digitTime = 60/21600/D205CardatronOutput.trackSize;
                                        // one digit time, about 8.8 µs at 21600rpm
D205CardatronOutput.digitsPerMilli = 0.001/D205CardatronOutput.digitTime;
                                        // digit times per millisecond: 113.8

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
        //0 1  2  3  4  5  6  7  8  9
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
    this.bufferReady = true;            // buffer drum info band is ready to accept data from Processor
    this.writeRequested = false;        // Processor has initiated a write, waiting for buffer
    this.togNumeric = false;            // current digit came from zone (false) or numeric (true) punches

    this.supplyLeft = this.maxSupplyLines; // lines/cards remaining in output supply
    this.runoutSupplyCount = 0;         // counter for triple-formfeed => rip paper/empty hopper
    this.groupLinesLeft = 0;            // lines remaining in current greenbar group
    this.topOfForm = false;             // start new page flag
    this.pendingSpaceBefore = -1;       // pending carriage control (eat the initial space-before)

    this.pendingCall = null;            // stashed pending function reference
    this.pendingParams = null;          // stashed pending function parameters
    this.kDigit = 0;                    // stashed reload-format band number
    this.tDigit = 0;                    // stashed Tab Select relay digit
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
D205CardatronOutput.prototype.setDeviceReady = function setDeviceReady(ready) {
    /* Controls the ready-state of the printer/punch */

    this.runoutSupplyCount = 0;
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
D205CardatronOutput.prototype.runoutSupply = function runoutSupply(ev) {
    /* Handles an event to clear the supply from the printer/punch */

    this.runoutSupplyCount = 0;
    D205Util.removeClass(this.$$("COEndOfSupplyBtn"), "redLit");
    this.supplyMeter.value = this.supplyLeft = this.maxSupplyLines;
    this.groupLinesLeft = 0;
    while (this.supply.firstChild) {
        this.supply.removeChild(this.supply.firstChild);
    }
    if (!this.isGreenbarCapable) {
        this.barGroup = this.doc.createElement("pre");
        this.barGroup.className = "paper";
        this.supply.appendChild(this.barGroup);
    }
};

/**************************************/
D205CardatronOutput.prototype.copySupply = function copySupply(ev) {
    /* Copies the text contents of the "paper" area of the device, opens a new
    temporary window, and pastes that text into the window so it can be copied
    or saved */
    var barGroup = this.supply.firstChild;
    var text = "";
    var title = "D205 " + this.mnemonic + " Text Snapshot";
    var win = window.open("./D205FramePaper.html", this.mnemonic + "-Snapshot",
            "scrollbars,resizable,width=500,height=500");

    while (barGroup) {
        text += barGroup.textContent + "\n";
        barGroup = barGroup.nextSibling;
    }

    win.moveTo((screen.availWidth-win.outerWidth)/2, (screen.availHeight-win.outerHeight)/2);
    win.addEventListener("load", function() {
        var doc;

        doc = win.document;
        doc.title = title;
        doc.getElementById("Paper").textContent = text;
    });

    this.runoutSupply();
    ev.preventDefault();
    ev.stopPropagation();
};

/**************************************/
D205CardatronOutput.prototype.appendLine = function appendLine(text) {
    /* Appends one line, with a trailing new-line character, to the current
    greenbar group, this.barGroup. This handles top-of-form and greenbar
    highlighting */
    var feed = "\n";

    if (this.isGreenbarCapable) {
        if (this.groupLinesLeft <= 0) {
            // Start the green half of a greenbar group
            this.barGroup = this.doc.createElement("pre");
            this.supply.appendChild(this.barGroup);
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
            this.supply.appendChild(this.barGroup);
            this.barGroup.className = "paper whiteBar";
        } else if (this.groupLinesLeft == 1) {
            feed = "";                  // no linefeed at end of a bar group
        } else if ((this.groupLinesLeft-1)*2 == this.lpi) {
            feed = "";                  // ditto
        }
    }

    this.barGroup.appendChild(this.doc.createTextNode(text + feed));
    --this.groupLinesLeft;
};

/**************************************/
D205CardatronOutput.prototype.printLine = function printLine(text, spaceBefore) {
    /* Prints one line to the output, handling carriage control and greenbar
    group completion. For now, SPACE 0 (overprinting) is treated as single-spacing */
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
            --this.supplyLeft;
            this.appendLine("\xA0");
        }
    }

    this.appendLine(text || "\xA0");
    if (this.supplyLeft > 0) {
        this.supplyMeter.value = this.supplyLeft -= lines;
    } else {
        this.setDeviceReady(false);
        D205Util.addClass(this.$$("COEndOfSupplyBtn"), "redLit");
    }
};

/**************************************/
D205CardatronOutput.prototype.finishWrite = function finishWrite() {
    /* Callback function activated after a line is printed/punched to set the
    buffer ready and reinitiate any pending write */

    this.bufferReady = true;
    this.startMachineLamp.set(0);
    this.setFormatSelectLamps(0);
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

    if (this.ready) {
        this.startMachineLamp.set(1);

        // Map buffer drum digits to ASCII character codes
        for (x=0; x<fmax; ++x) {
            switch (band[x]) {
            case 0:                     // insert zero digit
                if (nu) {
                    nu = false;
                    lastNumeric = 0;
                } else {
                    nu = true;
                    this.lineBuffer[--lx] = this.outputXlate[0][lastNumeric];
                }
                break;
            case 1:                     // translate alphanumerically
                if (nu) {
                    nu = false;
                    lastNumeric = info[x];
                } else {
                    nu = true;
                    this.lineBuffer[--lx] = this.outputXlate[info[x]][lastNumeric];
                }
                break;
            case 2:                     // translate numerically
                nu = true;
                this.lineBuffer[--lx] = (lastNumeric = info[x]) + 0x30;
                break;
            default:                    // (3) delete info band digit
                break;
            } // switch band[x]
        } // for x

        // Convert to ASCII line image and determine carriage control
        line = String.fromCharCode.apply(null, this.lineBuffer.subarray(lx, this.lineWidth+lx));
        if (this.useAlgolGlyphs) {
            line = D205Util.xlateASCIIToAlgol(line.replace(this.rtrimRex, ''));
        } else {
            line = line.replace(this.rtrimRex, '');
        }
        switch (this.tDigit) {
        case 1:                         // Relay 1 (eject page after printing)
        case 9:                         // same as 1
            this.printLine(line, this.pendingSpaceBefore);
            this.pendingSpaceBefore = 0;
            break;
        case 2:                         // Relay 2 (single space before and after printing)
            this.printLine(line, this.pendingSpaceBefore+1);
            this.pendingSpaceBefore = 1;
            break;
        case 3:                         // Relay 3 (eject page before printing)
        case 5:                         // Relay 5 (skip to channel 2 before printing)
        case 7:                         // Relay 3+5 (skip to channel 3 before printing)
            this.printLine(line, -1);
            this.pendingSpaceBefore = 0;
            break;
        case 4:                         // Relay 4 (double space before printing)
            this.printLine(line, this.pendingSpaceBefore+2);
            this.pendingSpaceBefore = 0;
            break;
        case 6:                         // Relay 2+4 (double space before and single space after printing)
            this.printLine(line, this.pendingSpaceBefore+2);
            this.pendingSpaceBefore = 1;
            break;
        default:                        // single space before printing
            this.printLine(line, this.pendingSpaceBefore+1);
            this.pendingSpaceBefore = 0;
            break;
        }

        this.endOfSupply.scrollIntoView();
        setCallback(this.mnemonic, this, 60000/this.linesPerMinute, this.finishWrite);
    }
};

/**************************************/
D205CardatronOutput.prototype.setAlgolGlyphs = function setAlgolGlyphs(makeItPretty) {
    /* Controls the display of Unicode glyphs for the special Algol characters */

    if (makeItPretty) {
        if (!this.useAlgolGlyphs) {
            D205Util.xlateDOMTreeText(this.supply, D205Util.xlateASCIIToAlgol);
        }
    } else {
        if (this.useAlgolGlyphs) {
            D205Util.xlateDOMTreeText(this.supply, D205Util.xlateAlgolToASCII);
        }
    }
    this.$$("COAlgolGlyphsCheck").checked = makeItPretty;
    this.useAlgolGlyphs = makeItPretty;
};

/**************************************/
D205CardatronOutput.prototype.setGreenbar = function setGreenbar(useGreen) {
    /* Controls the display of "greenbar" shading on the output */
    var rule = null;
    var rules = null;
    var sheet;
    var ss = this.supplyDoc.styleSheets;
    var x;

    // First, find the embedded style sheet for the output frame.
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

    if (!this.ready && this.supplyLeft > 0) {
        this.runoutSupplyCount = 0;
        this.setDeviceReady(true);
        if (!this.bufferReady) {
            this.initiateWrite();       // have a full buffer, so output it
        }
    }
};

/**************************************/
D205CardatronOutput.prototype.COStopBtn_onClick = function COStopBtn_onClick(ev) {
    /* Handle the click event for the STOP button */

    if (this.ready) {
        this.runoutSupplyCount = 0;
        this.setDeviceReady(false);
    }
};

/**************************************/
D205CardatronOutput.prototype.CORunoutSupplyBtn_onClick = function CORunoutSupplyBtn_onClick(ev) {
    /* Handle the click event for the Skip To Heading button */

    if (!this.ready) {
        this.printLine("", -1);
        this.endOfSupply.scrollIntoView();
        if (++this.runoutSupplyCount >= 3) {
            if (this.window.confirm("Do you want to clear the output from the device?")) {
                this.runoutSupply();
            }
        }
    }
};

/**************************************/
D205CardatronOutput.prototype.COEndOfSupplyBtn_onClick = function COEndOfSupplyBtn_onClick(ev) {
    /* Handle the click event for the End Of Supply button. If the printer/punch
    is in and end-of-supply condition, this will make the printer/punch ready,
    but it will still be in an EOS condition. The next time a print/punch line
    is received, the EOS condition will force it not-ready again. You can print/
    punch only one line at a time (presumably to the end of the current page).
    The EOS condition can be cleared by clicking Supply Feed three times to "rip"
    the paper or empty the punch hopper */

    if (this.supplyLeft <= 0 && !this.ready) {
        this.runoutSupplyCount = 0;
        D205Util.removeClass(this.$$("COEndOfSupplyBtn"), "redLit");
        this.setDeviceReady(true);
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
D205CardatronOutput.prototype.deviceOnLoad = function deviceOnLoad() {
    /* Initializes the printer/punch window and user interface */
    var body;
    var de;
    var newChild;

    this.doc = this.window.document;
    de = this.doc.documentElement;
    this.doc.title = "retro-205 Cardatron " +
            (this.isPrinter ? "Printer " : "Punch ") + this.mnemonic;

    body = this.$$("CODiv");
    this.supplyDoc = this.$$("COSupplyFrame").contentDocument;
    this.supply = this.supplyDoc.getElementById("Paper");
    this.endOfSupply = this.supplyDoc.getElementById("EndOfPaper");
    this.supplyMeter = this.$$("COSupplyMeter");

    newChild = this.supplyDoc.createElement("div");
    newChild.id = this.supply.id;
    this.supply.parentNode.replaceChild(newChild, this.supply);
    this.supply = newChild;
    if (!this.isGreenbarCapable) {
        this.barGroup = this.doc.createElement("pre");
        this.barGroup.className = "paper";
        this.supply.appendChild(this.barGroup);
    }

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
    this.supplyMeter.max = this.maxSupplyLines;
    this.supplyMeter.low = this.maxSupplyLines*0.1;
    this.supplyMeter.value = this.supplyLeft = this.maxSupplyLines;
    this.setDeviceReady(true);

    this.window.addEventListener("beforeunload",
            D205CardatronOutput.prototype.beforeUnload, false);
    this.$$("COStopBtn").addEventListener("click",
            D205Util.bindMethod(this, D205CardatronOutput.prototype.COStopBtn_onClick), false);
    this.$$("COStartBtn").addEventListener("click",
            D205Util.bindMethod(this, D205CardatronOutput.prototype.COStartBtn_onClick), false);
    this.$$("COEndOfSupplyBtn").addEventListener("click",
            D205Util.bindMethod(this, D205CardatronOutput.prototype.COEndOfSupplyBtn_onClick), false);
    this.$$("CORunoutSupplyBtn").addEventListener("click",
            D205Util.bindMethod(this, D205CardatronOutput.prototype.CORunoutSupplyBtn_onClick), false);
    this.$$("COAlgolGlyphsCheck").addEventListener("click",
            D205Util.bindMethod(this, D205CardatronOutput.prototype.COAlgolGlyphsCheck_onClick), false);
    this.$$("ClearBtn").addEventListener("click",
            D205Util.bindMethod(this, D205CardatronOutput.prototype.ClearBtn_onClick));

    this.supply.addEventListener("dblclick",
            D205Processor.bindMethod(this, D205CardatronOutput.prototype.copySupply));
    if (!this.isPrinter) {
        this.$$("COGreenbarCheck").disabled = true;
    } else {
        this.$$("COGreenbarSpan").style.display = "inline";
        this.$$("COGreenbarCheck").addEventListener("click",
                D205Util.bindMethod(this, D205CardatronOutput.prototype.COGreenbarCheck_onClick), false);
    }

    this.window.resizeBy(de.scrollWidth - this.window.innerWidth + 4, // kludge for right-padding/margin
                         de.scrollHeight - this.window.innerHeight);
};

/**************************************/
D205CardatronOutput.prototype.outputWord = function outputWord(
        word, requestNextWord, signalFinished) {
    /* Receives the next info band word from the Processor and stores its digits
    under control of the selected format band. requestNextWord is the callback function
    to request the next word from the Processor; signalFinished is the callback
    function to tell the Processor we are done with data transfer */
    var band;                           // local copy of format band
    var d;                              // current digit
    var eod;                            // done with current digit
    var eow = false;                    // done with current word
    var drumAddr;                       // buffer drum address
    var info = this.info;               // local reference to info band
    var ix = this.infoIndex;            // current info/format band index
    var lastNumeric = this.lastNumericDigit;
    var latency = 0;                    // drum latency for first digit of a word
    var nu = this.togNumeric;           // numeric vs. zone digit toggle
    var x = 0;                          // word-digit index

    band = this.formatBand[this.selectedFormat];
    // For the first digit of a word, note the current buffer drum digit address
    drumAddr = (performance.now()*D205CardatronOutput.digitsPerMilli) % D205CardatronOutput.trackSize;
    latency = (ix - drumAddr + D205CardatronOutput.trackSize) % D205CardatronOutput.trackSize;

    // Loop through the digits in the word, processing each one
    do {
        eod = false;
        d = word % 0x10;
        word = (word-d)/0x10;

        // Loop through the format band digits until the current word-digit is consumed
        do {
            if (ix >= info.length) {
                eow = eod = true;
            } else {
                // Translate the current digit
                switch (band[ix]) {
                case 0:                 // insert 0 digit
                    nu = !nu;
                    info[ix] = lastNumeric = 0;
                    ++ix;
                    // we are not done with the current word-digit yet...
                    break;
                case 1:                 // translate zone/numeric digit
                    if (nu) {
                        // Numeric digit: straight translation except for 3-8 and 4-8 punches
                        nu = false;             // next is a zone digit
                        info[ix] = lastNumeric = d;
                    } else {
                        // Zone digit: requires special handling in the sign-digit position
                        // and if the corresponding numeric digit came from a 3-8 or 4-8 punch
                        nu = true;              // next is a numeric digit
                        if (x < 10) {
                            // If the prior numeric digit was 3 or 4 AND this zone is 0-3,
                            // store an 11 or 12 for the numeric digit to indicate a 3-8 or 4-8 punch.
                            if (d < 4) {
                                if (ix > 0 && (lastNumeric == 3 || lastNumeric == 4)) {
                                    info[ix-1] = lastNumeric+8;
                                }
                            }
                            info[ix] = this.zoneXlate[d][lastNumeric];
                        } else {
                            // For a zone digit in the sign position, store a 5 (+) or 6 (-)
                            // so that the sign will be printed/punched as a zone 11/12.
                            info[ix] = (d & 0x01) + 5;
                        }
                    }
                    ++ix;
                    eod = true;
                    break;
                case 2:                 // translate numerically
                    nu = true;                  // next is forced to be another numeric digit
                    info[ix] = lastNumeric = d;
                    ++ix;
                    eod = true;
                    break;
                default:                // (3) delete the digit -- store nothing
                    ++ix;
                    eod = true;
                    break;
                } // switch band[ix]
            }
        } while (!eod);

        if (x < 10) {
            ++x;
        } else {
            eow = true;
        }
    } while (!eow);

    this.lastNumericDigit = lastNumeric;
    this.togNumeric = nu;
    this.infoIndex = ix;
    if (ix < info.length) {
        // Delay requesting the next word for the amount of time until buffer drum was in position
        setCallback(this.mnemonic, this, latency/D205CardatronOutput.digitsPerMilli,
                requestNextWord, this.boundOutputWord);
        // requestNextWord(this.boundOutputWord);  // until we get the timing fixed
    } else {
        // At end of info band -- finish the data transfer and start the I/O to the device
        this.initiateWrite();
        signalFinished();
    }
};

/**************************************/
D205CardatronOutput.prototype.outputInitiate = function outputInitiate(
        kDigit, tDigit, requestNextWord, signalFinished) {
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
    requestNextWord is the callback function that will request the next word from the
    processor. signalFinished is the callback function that tells the Processor
    we're done. If the buffer is not ready, simply sets the writeRequested flag
    and exits after stashing kDigit, tDigit, and the callbacks. Note that if the
    device is not ready, the buffer can still be loaded */

    if (!this.bufferReady) {
        this.writeRequested = true;     // wait for the buffer to be emptied
        this.pendingCall = outputInitiate;
        this.pendingParams = [kDigit, tDigit, requestNextWord, signalFinished];
    } else if (kDigit > 9) {
        signalFinished();
    } else {
        this.kDigit = kDigit;
        this.tDigit = (this.isPrinter ? tDigit : 0);
        this.selectedFormat = ((kDigit >>> 1) & 0x07) + 1;
        this.setFormatSelectLamps(this.selectedFormat);
        this.togNumeric = true;
        this.lastNumericDigit = 0;
        this.bufferReady = false;
        this.clearInfoBand();
        setCallback(this.mnemonic, this,
                D205CardatronOutput.trackSize/D205CardatronOutput.digitsPerMilli*2.5,
                requestNextWord, this.boundOutputWord); // request the first data word
    }
};

/**************************************/
D205CardatronOutput.prototype.outputReadyInterrogate = function outputReadyInterrogate() {
    /* Returns the current ready status of the output unit */

    return this.bufferReady;
};

/**************************************/
D205CardatronOutput.prototype.outputFormatInitiate = function outputFormatInitiate(
        kDigit, requestNextWord, signalFinished) {
    /* Initiates the loading of a format band on this unit. kDigit is the
    second numeric digit from the instruction word, the low-order bit is ignored
    and the remaining three bits indicate the format band to be loaded. requestNextWord
    is the callback function that will trigger the Processor to send the next word.
    signalFinished is the callback function that will signal the Processor to
    terminate the I/O */

    if (kDigit > 9) {
        signalFinished();
    } else {
        this.kDigit = kDigit;
        this.selectedFormat = ((kDigit >>> 1) & 0x07) + 1;
        this.infoIndex = 0;             // start at the beginning of the format band
        this.togNumeric = true;
        this.lastNumericDigit = 0;
        this.setFormatSelectLamps(this.selectedFormat);
        setCallback(this.mnemonic, this,
                D205CardatronOutput.trackSize/D205CardatronOutput.digitsPerMilli*2.5,
                requestNextWord, this.boundOutputFormatWord); // request the first format word
    }
};

/**************************************/
D205CardatronOutput.prototype.outputFormatWord = function outputFormatWord(
        word, requestNextWord, signalFinished) {
    /* Receives the next output format band word from the Processor and
    stores the digits from the word into the next 11 format band digits */
    var band = this.formatBand[this.selectedFormat];
    var d;                              // current format digit
    var ix = this.infoIndex;            // current format band digit index
    var x;                              // word-digit index

    for (x=0; x<11; ++x) {
        d = word % 0x10;
        word = (word-d)/0x10;
        if (ix < D205CardatronOutput.trackSize) {
            band[ix++] = d;
        } else {
            break;                      // out of for loop
        }
    } // for x

    this.infoIndex = ix;
    if (ix < D205CardatronOutput.trackSize) {
        requestNextWord(this.boundOutputFormatWord);
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
    this.setDeviceReady(true);
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
