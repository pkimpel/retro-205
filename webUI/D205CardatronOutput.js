/***********************************************************************
* retro-205/webUI D205CardatronOutput.js
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
function D205CardatronOutput(mnemonic, unitIndex, config) {
    /* Constructor for the Cardatron Output object */
    var h = screen.availHeight*0.25;    // window height
    var tks = D205CardatronOutput.trackSize;
    var w;                              // window width
    var x;

    this.config = config;
    this.isPrinter = (mnemonic.indexOf("LP") == 0);
                                        // Whether printer (true) or punch (false)
    this.lineWidth = (this.isPrinter ? 120 : 80);
    this.linesPerMinute = (this.isPrinter ? 150 : 100);
                                        // IBM 407=150 LPM, IBM 523=100 CPM
    this.mnemonic = mnemonic;           // Unit mnemonic
    this.unitIndex = unitIndex;         // Output unit number

    this.timer = 0;                     // setCallback() token
    this.useAlgolGlyphs = false;        // output using special Algol chars
    this.useGreenbar = false;           // format "greenbar" shading on the paper (printer only)
    this.lpi = 6;                       // lines/inch (actually, lines per greenbar group, should be even)

    this.boundOutputFormatWord = D205CardatronOutput.prototype.outputFormatWord.bind(this);
    this.boundOutputWord = D205CardatronOutput.prototype.outputWord.bind(this);

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

    // Zero-Suppress controls
    this.zsWindow = null;               // handle for the tape loader window
    this.zsCol = [];                    // list of 1-relative zero-suppress column numbers

    // Device window
    this.doc = null;
    this.window = null;
    this.barGroup = null;               // current greenbar line group
    this.supplyDoc = null;              // the content document for the supply frame
    this.supply = null;                 // the "paper" or "cards" we print/punch on
    this.endOfSupply = null;            // dummy element used to control scrolling
    this.supplyMeter = null;            // <meter> element showing amount of paper/card supply remaining
    w = (this.isPrinter ? 790 : 608);

    D205Util.openPopup(window, "../webUI/D205CardatronOutput.html", mnemonic,
            "location=no,scrollbars,resizable,width=" + w + ",height=" + h +
            ",left=" + (screen.availWidth - w) +
            ",top=" + (screen.availHeight - h - (unitIndex-1)*24),
            this, D205CardatronOutput.prototype.deviceOnLoad);
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
// See U.S. Patent 3,072,328, January 8, 1963, L.L. Bewley et al, Figure 2;
// and ElectroData Technical Newsletter #5 of February 14, 1958.
D205CardatronOutput.prototype.outputXlate = [
        // 0    1    2    3    4    5    6    7    8    9   10   11   12
        [0x20,0x31,0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39,0x20,0x23,0x40],     // zone digit  0
        [0x26,0x41,0x42,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x20,0x2E,0xA4],     // zone digit  1
        [0x2D,0x4A,0x4B,0x4C,0x4D,0x4E,0x4F,0x50,0x51,0x52,0x20,0x24,0x2A],     // zone digit  2
        [0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20],     // zone digit  3
        [0x30,0x2F,0x53,0x54,0x55,0x56,0x57,0x58,0x59,0x5A,0x20,0x2C,0x25],     // zone digit  4
        [0x26,0x41,0x42,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x20,0x2E,0xA4],     // zone digit  5
        [0x2D,0x4A,0x4B,0x4C,0x4D,0x4E,0x4F,0x50,0x51,0x52,0x20,0x24,0x2A],     // zone digit  6
        [0x20,0x20,0x39,0x2E,0xA4,0xA4,0x2E,0xA4,0x20,0x20,0x20,0x2E,0xA4],     // zone digit  7
        [0x20,0x4A,0x49,0x24,0x2A,0x2A,0x24,0x2A,0x20,0x20,0x20,0x24,0x2A],     // zone digit  8
        [0x20,0x20,0x52,0x27,0x25,0x25,0x2C,0x25,0x20,0x20,0x20,0x27,0x25],     // zone digit  9
        [0x2D,0x20,0x52,0x20,0x20,0x40,0x23,0x40,0x20,0x20,0x20,0x20,0x20],     // zone digit 10
        [0x20,0x26,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20],     // zone digit 11
        [0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20,0x20]];    // zone digit 12

// Translate internal zone decades to buffer zone digits.
// Each row is indexed by the zone digit from the internal character code;
// each column is indexed by the PREVIOUS numeric digit from the character code.
// See U.S. Patent 3,072,328, January 8, 1963, L.L. Bewley et al, Figure 12;
// and ElectroData Technical Newsletter #5 of February 14, 1958.
D205CardatronOutput.prototype.zoneXlate = [         // numeric digit:0 1 2 3 4 5 6 7 8 9
        //0   1   2   3   4   5   6   7   8   9     //               = = = = = = = = = =
        [ 0,  1,  7,  1,  7,  7,  7,  7,  0,  1],   // zone digit 0:   A 9 . ¤ ¤ . ¤ 8 I
        [ 1,  8,  8,  8,  8,  8,  8,  8,  1,  2],   // zone digit 1: & J I $ * * $ * H R
        [ 2,  4,  9,  4,  4,  9,  9,  9,  2,  4],   // zone digit 2: - / R , % % , % Q Z
        [10,  0, 10,  0,  0, 10, 10, 10,  2,  0],   // zone digit 3: - 1 R # @ @ # @ Q 9
        [ 1,  1,  1,  1,  1,  1,  1,  1,  1,  1],   // zone digit 4: & A B C D E F G H I
        [ 6,  2,  2,  2,  2,  2,  2,  2,  2,  2],   // zone digit 5: - J K L M N O P Q R
        [ 4, 11,  4,  4,  4,  4,  4,  4,  4,  4],   // zone digit 6: 0 & S T U V W X Y Z
        [ 6,  2,  2,  2,  2,  2,  2,  2,  2,  2],   // zone digit 7: - J K L M N O P Q R
        [ 4,  0,  0,  0,  0,  0,  0,  0,  0,  0],   // zone digit 8: 0 1 2 3 4 5 6 7 8 9
        [ 1,  2,  1,  2,  2,  2,  2,  2,  1,  2]];  // zone digit 9: & J B L M N O P H R


// Truthset for leading-zero suppression in output lines. A 1 indicates the
// character is to be replaced by a space; a 0 indicates a non-suppressable
// code and the end of leading-zero suppression.
D205CardatronOutput.prototype.zeroSuppressSet = [
      //0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,         // 00-0F
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,         // 10-1F
        1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0,         // 20-2F
        1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,         // 30-3F
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,         // 40-4F
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,         // 50-5F
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,         // 60-6F
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,         // 70-7F
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,         // 80-8F
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,         // 90-9F
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,         // A0-AF
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,         // B0-BF
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,         // C0-CF
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,         // D0-DF
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,         // E0-EF
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];        // F0-FF


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
    this.atTopOfForm = false;           // start new page flag
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
        this.$$("COStartBtn").classList.add("greenLit")
        this.$$("COStopBtn").classList.remove("redLit");
        this.ready = true;
    } else if (!ready && this.ready) {
        this.$$("COStartBtn").classList.remove("greenLit")
        this.$$("COStopBtn").classList.add("redLit");
        this.ready = false;
    }
};

/**************************************/
D205CardatronOutput.prototype.runoutSupply = function runoutSupply(ev) {
    /* Handles an event to clear the supply from the printer/punch */

    this.runoutSupplyCount = 0;
    this.$$("COEndOfSupplyBtn").classList.remove("redLit");
    this.supplyMeter.value = this.supplyLeft = this.maxSupplyLines;
    this.groupLinesLeft = 0;
    while (this.supply.firstChild) {
        this.supply.removeChild(this.supply.firstChild);
    }
    if (!this.isPrinter) {
        this.barGroup = this.doc.createElement("pre");
        this.barGroup.className = "paper";
        this.supply.appendChild(this.barGroup);
    }
};

/**************************************/
D205CardatronOutput.prototype.copySupply = function copySupply(ev) {
    /* Copies the text contents of the "paper" area of the device, opens a new
    temporary window, and pastes that text into the window so it can be copied
    or saved by the user */
    var barGroup = this.supply.firstChild;
    var text = "";
    var title = "D205 " + this.mnemonic + " Text Snapshot";

    while (barGroup) {
        text += barGroup.textContent + "\n";
        barGroup = barGroup.nextSibling;
    }

    D205Util.openPopup(this.window, "./D205FramePaper.html", "",
            "scrollbars,resizable,width=500,height=500",
            this, function(ev) {
        var doc = ev.target;
        var win = doc.defaultView;

        doc.title = title;
        win.moveTo((screen.availWidth-win.outerWidth)/2, (screen.availHeight-win.outerHeight)/2);
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
    var skip = "";

    if (this.isPrinter) {
        if (this.groupLinesLeft <= 0) {
            // Start the green half of a greenbar group
            this.barGroup = this.doc.createElement("div");
            this.supply.appendChild(this.barGroup);
            this.groupLinesLeft = this.lpi;
            if (!this.atTopOfForm) {
                this.barGroup.className = "paper greenBar";
            } else {
                skip = "\f";               // prepend a form-feed to the line
                this.atTopOfForm = false;
                this.barGroup.className = "paper greenBar topOfForm";
            }
        } else if (this.groupLinesLeft*2 == this.lpi) {
            // Start the white half of a greenbar group
            this.barGroup = this.doc.createElement("div");
            this.supply.appendChild(this.barGroup);
            this.barGroup.className = "paper whiteBar";
        } else if (this.groupLinesLeft == 1) {
            feed = "";                  // no linefeed at end of a bar group
        } else if ((this.groupLinesLeft-1)*2 == this.lpi) {
            feed = "";                  // ditto
        }
    }

    this.barGroup.appendChild(this.doc.createTextNode(skip + text + feed));
    --this.groupLinesLeft;
};

/**************************************/
D205CardatronOutput.prototype.skipToChannel = function skipToChannel() {
    /* Finishes the current page and sets up for top-of-form formatting on the
    next line printed. Adjusts the supply of forms left */
    var lines = 0;

    while(this.groupLinesLeft > 0) {
        ++lines;
        this.appendLine("\xA0");
    }

    this.atTopOfForm = true;
    this.supplyMeter.value = this.supplyLeft -= lines;
};

/**************************************/
D205CardatronOutput.prototype.printLine = function printLine(text, spaceBefore) {
    /* Prints one line to the output, handling carriage control and greenbar
    group completion. For now, SPACE 0 (overprinting) is treated as single-spacing */
    var lines = spaceBefore;

    while (lines > 1) {                 // space before print
        --lines;
        --this.supplyLeft;
        this.appendLine("\xA0");
    }

    this.appendLine(text || "\xA0");
    if (this.supplyLeft > 0) {
        this.supplyMeter.value = this.supplyLeft -= 1;
    } else {
        this.setDeviceReady(false);
        this.$$("COEndOfSupplyBtn").classList.add("redLit");
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
        this.pendingCall = null;
    }
};

/**************************************/
D205CardatronOutput.prototype.initiateWrite = function initiateWrite() {
    /* Initiate formatting of the output line/card from the buffer drum and
    writing it to the output device. If zero-suppression has been configured,
    step through the list of zero-suppression starting columns and replace any
    suppressable leading characters in each field */
    var band = this.formatBand[this.selectedFormat];
    var fmax = band.length;             // max info/format band index
    var info = this.info;               // local reference to info band
    var lastNumeric = 0;                // last numeric digit
    var line;                           // ASCII line image
    var lx = this.lineBuffer.length;    // line image character index: start at end
    var nu = true;                      // numeric toggle: start as numeric
    var x = 0;                          // info/format band digit index
    var z;                              // zero-suppress list index
    var zLen = this.zsCol.length;       // length of zsCol[]
    var zNext;                          // 0-relative column index of next zero-suppress field

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

        // Apply zero suppression, if configured
        if (zLen) {
            z = 0;
            zNext = lx + this.zsCol[0] - 1;             // compute first 0-relative starting index
            do {
                x = zNext;                              // set the buffer starting index
                ++z;
                if (z < zLen) {
                    zNext = lx + this.zsCol[z] - 1;     // set the next starting index
                } else {
                    zNext = this.lineBuffer.length;     // set to end of buffer
                }

                for (; x<zNext; ++x) {
                    if (this.zeroSuppressSet[this.lineBuffer[x]]) {
                        this.lineBuffer[x] = 0x20;      // convert to a leading space
                    } else {
                        break;                          // end zero suppression for this field
                    }
                }
            } while (z < zLen);
        }

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
            this.skipToChannel();
            this.pendingSpaceBefore = 0;
            break;
        case 2:                         // Relay 2 (single space before and after printing)
            this.printLine(line, this.pendingSpaceBefore+1);
            this.pendingSpaceBefore = 1;
            break;
        case 3:                         // Relay 3 (eject page before printing)
        case 5:                         // Relay 5 (skip to channel 2 before printing)
        case 7:                         // Relay 3+5 (skip to channel 3 before printing)
            this.skipToChannel();
            this.printLine(line, 0);
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
                if (rule.selectorText.toLowerCase() == "div.greenbar") {
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
        this.$$("COEndOfSupplyBtn").classList.remove("redLit");
        this.setDeviceReady(true);
    }
};

/**************************************/
D205CardatronOutput.prototype.COAlgolGlyphsCheck_onClick = function COAlgolGlyphsCheck_onClick(ev) {
    /* Handle the click event for the Algol Glyphs checkbox */
    var prefs = this.config.getNode("Cardatron.units", this.unitIndex);

    this.setAlgolGlyphs(ev.target.checked);
    prefs.algolGlyphs = this.useAlgolGlyphs;
    this.config.putNode("Cardatron.units", prefs, this.unitIndex);
};

/**************************************/
D205CardatronOutput.prototype.COGreenbarCheck_onClick = function COGreenbarCheck_onClick(ev) {
    /* Handle the click event for the Greenbar checkbox */
    var prefs = this.config.getNode("Cardatron.units", this.unitIndex);

    this.setGreenbar(ev.target.checked);
    prefs.greenBar = this.useGreenbar;
    this.config.putNode("Cardatron.units", prefs, this.unitIndex);
};

/**************************************/
D205CardatronOutput.prototype.parseZeroSuppressList = function parseZeroSuppressList(text, alertWin) {
    /* Parses a comma-delimited list of zero-suppression starting columns. If the list is
    parsed successfully, returns an array of integers; otherwise returns null. An alert
    is displayed on the window for the first parsing or out-of-sequence error */
    var col;
    var cols;
    var copacetic = true;
    var lastCol = 0;
    var raw;
    var x;
    var zsCol = [];

    if (text.search(/\S/) >= 0) {
        cols = text.split(",");
        for (x=0; x<cols.length; ++x) {
            raw = cols[x].trim();
            if (raw.length > 0) {       // ignore empty fields
                col = parseInt(raw, 10);
                if (isNaN(col)) {
                    copacetic = false;
                    alertWin.alert("Item #" + (x+1) + " (\"" + cols[x] + "\") is not numeric");
                    break; // out of for loop
                } else if (col <= lastCol) {
                    copacetic = false;
                    alertWin.alert("Item #" + (x+1) + " (\"" + col + "\") is out of sequence");
                    break; // out of for loop
                } else {
                    lastCol = col;
                    zsCol.push(col);
                }
            }
        } // for x
    }

    return (copacetic ? zsCol : null);
};

/**************************************/
D205CardatronOutput.prototype.COSetZSBtn_onClick = function COSetZSBtn_onClick(ev) {
    /* Displays the Zero Suppress Panel window to capture a list of column numbers */
    var $$$ = null;                     // getElementById shortcut for loader window
    var doc = null;                     // zero-suppress window.document
    var tron = this;                    // this D205CardatronOutput device instance
    var win = null;                     // zero-suppress window defaultView

    function zsOK(ev) {
        /* Handler for the OK button. Parses the list of column numbers; if successful,
        sets tron.zsCol to the resulting array, stores the list in the system
        configuration object, and closes the window */
        var prefs;
        var text = $$$("COZSColumnList").value;
        var zsCol;

        zsCol = tron.parseZeroSuppressList(text, win);
        if (zsCol !== null) {
            tron.zsCol = zsCol;
            tron.$$("COSetZSBtn").classList.remove(zsCol.length > 0 ? "blackButton1" : "greenButton1");
            tron.$$("COSetZSBtn").classList.add(zsCol.length > 0 ? "greenButton1" : "blackButton1");

            // Store the new list in the system configuration object
            text = zsCol.join(",");
            prefs = tron.config.getNode("Cardatron.units", tron.unitIndex);
            prefs.zeroSuppressCols = text;
            tron.config.putNode("Cardatron.units", prefs, tron.unitIndex);
            win.close();
        }
    }

    function zsOnload(ev) {
        /* Driver for the tape loader window */
        var de;

        doc = ev.target;
        win = doc.defaultView;
        this.zsWindow = win;
        doc.title = "retro-205 " + tron.mnemonic + " Zero-Suppress Panel";
        de = doc.documentElement;
        $$$ = function $$$(id) {
            return doc.getElementById(id);
        };

        $$$("COZSColumnList").value = tron.zsCol.join(",");
        $$$("COZSOKBtn").addEventListener("click", zsOK, false);
        $$$("COZSCancelBtn").addEventListener("click", function zsCancelBtn(ev) {
            win.close();
        }, false);

        win.resizeBy(de.scrollWidth - win.innerWidth,
                     de.scrollHeight - win.innerHeight);
        $$$("COZSColumnList").focus();
        win.addEventListener("unload", function zsUnload(ev) {
            this.zsWindow = null;
        }, false);
    }

    // Outer block of COSetZSBtn_onClick
    if (this.zsWindow && !this.zsWindow.closed) {
        this.zsWindow.close();
    }

    D205Util.openPopup(this.window, "D205CardatronZeroSuppressPanel.html", this.mnemonic + "ZS",
            "location=no,scrollbars=no,resizable,width=508,height=120,left=" +
                (this.window.screenX+16) +",top=" + (this.window.screenY+16),
            this, zsOnload);
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
D205CardatronOutput.prototype.deviceOnLoad = function deviceOnLoad(ev) {
    /* Initializes the printer/punch window and user interface */
    var body;
    var de;
    var newChild;
    var prefs = this.config.getNode("Cardatron.units", this.unitIndex);
    var zsCol;

    this.doc = ev.target;
    this.window = this.doc.defaultView;
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
    if (!this.isPrinter) {
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

    this.setAlgolGlyphs(prefs.algolGlyphs);
    this.setGreenbar(prefs.greenBar);
    zsCol = this.parseZeroSuppressList(prefs.zeroSuppressCols || "", this.window);
    if (zsCol !== null) {
        this.zsCol = zsCol;
        if (zsCol.length > 0) {
            this.$$("COSetZSBtn").classList.remove(zsCol.length > 0 ? "blackButton1" : "greenButton1");
            this.$$("COSetZSBtn").classList.add(zsCol.length > 0 ? "greenButton1" : "blackButton1");
        }
    }

    this.supplyMeter.max = this.maxSupplyLines;
    this.supplyMeter.low = this.maxSupplyLines*0.1;
    this.supplyMeter.value = this.supplyLeft = this.maxSupplyLines;
    this.setDeviceReady(true);

    this.window.addEventListener("beforeunload",
            D205CardatronOutput.prototype.beforeUnload, false);
    this.supply.addEventListener("dblclick",
            D205CardatronOutput.prototype.copySupply.bind(this));
    this.$$("COStopBtn").addEventListener("click",
            D205CardatronOutput.prototype.COStopBtn_onClick.bind(this), false);
    this.$$("COStartBtn").addEventListener("click",
            D205CardatronOutput.prototype.COStartBtn_onClick.bind(this), false);
    this.$$("COEndOfSupplyBtn").addEventListener("click",
            D205CardatronOutput.prototype.COEndOfSupplyBtn_onClick.bind(this), false);
    this.$$("CORunoutSupplyBtn").addEventListener("click",
            D205CardatronOutput.prototype.CORunoutSupplyBtn_onClick.bind(this), false);
    this.$$("COAlgolGlyphsCheck").addEventListener("click",
            D205CardatronOutput.prototype.COAlgolGlyphsCheck_onClick.bind(this), false);
    this.$$("COSetZSBtn").addEventListener("click",
            D205CardatronOutput.prototype.COSetZSBtn_onClick.bind(this), false);
    this.$$("ClearBtn").addEventListener("click",
            D205CardatronOutput.prototype.ClearBtn_onClick.bind(this));

    if (!this.isPrinter) {
        this.$$("COEndOfSupplyBtn").innerHTML = "OUT OF<br>CARDS";
        this.$$("CORunoutSupplyBtn").innerHTML = "RUNOUT<br>CARDS";
        this.$$("COGreenbarSpan").style.display = "none";
        this.$$("COGreenbarCheck").disabled = true;
    } else {
        this.$$("COEndOfSupplyBtn").innerHTML = "OUT OF<br>PAPER";
        this.$$("CORunoutSupplyBtn").innerHTML = "FORM<br>FEED";
        this.$$("COGreenbarSpan").style.display = "inline";
        this.$$("COGreenbarCheck").addEventListener("click",
                D205CardatronOutput.prototype.COGreenbarCheck_onClick.bind(this), false);
    }
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
                        if (x > 9) {
                            // For a zone digit in the sign position, store a 5 (+) or 6 (-)
                            // so that the sign will be printed/punched as a zone 11/12.
                            info[ix] = d%2 + 5;
                        } else if (d > 3) {
                            info[ix] = this.zoneXlate[d][lastNumeric];
                        } else {
                            // If the prior numeric digit was 3 or 4 AND this zone is 0-3,
                            // store an 11 or 12 for the prior digit to indicate a 3-8 or 4-8 punch.
                            if (ix > 0 && (lastNumeric == 3 || lastNumeric == 4)) {
                                info[ix-1] = lastNumeric+8;
                            }
                            info[ix] = this.zoneXlate[d][lastNumeric];
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
            band[ix++] = d % 4;
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
    if (this.zsWindow && !this.zsWindow.closed) {
        this.zsWindow.close();
    }
};
