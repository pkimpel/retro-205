/***********************************************************************
* retro-205/webUI D205CardatronInput.js
************************************************************************
* Copyright (c) 2015, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* Datatron 205 Cardatron Input Unit module.
*
* Defines a card reader peripheral unit type.
*
************************************************************************
* 2015-01-31  P.Kimpel
*   Original version, from retro-b5500 B5500CardReader.js.
***********************************************************************/
"use strict";

/**************************************/
function D205CardatronInput(mnemonic, unitIndex, config) {
    /* Constructor for the Cardatron Input object */
    var h = 160;                        // window height
    var left = 0;                       // (temporary window x-offset)
    var tks = D205CardatronInput.trackSize;
    var w = 560;                        // window width
    var x;

    this.config = config;               // System configuration object
    this.mnemonic = mnemonic;           // Unit mnemonic
    this.unitIndex = unitIndex;         // Input unit number

    this.timer = 0;                     // setCallback() token
    this.boundInputFormatWord = D205CardatronInput.prototype.inputFormatWord.bind(this);

    this.clear();

    // Buffer drum: information band is [0], format bands are [1]-[6], [7] is a dummy for indexing only
    this.bufferDrum = new ArrayBuffer(tks*8);
    this.info = new Uint8Array(this.bufferDrum, 0, tks);        // information band
    this.formatBand = [
            null,                                               // no format band 0
            new Uint8Array(this.bufferDrum, tks*1, tks),        // format band 1
            new Uint8Array(this.bufferDrum, tks*2, tks),        // format band 2
            new Uint8Array(this.bufferDrum, tks*3, tks),        // format band 3
            new Uint8Array(this.bufferDrum, tks*4, tks),        // format band 4
            new Uint8Array(this.bufferDrum, tks*5, tks),        // format band 5
            new Uint8Array(this.bufferDrum, tks*6, tks),        // format band 6 (fixed)
            new Uint8Array(this.bufferDrum, tks*7, tks)];       // format band 7 (dummy)

    // Initialize format band 6 for all-numeric transfer.
    for (x=0; x<160; x+=2) {                    // transfer 80 numeric digits
        this.formatBand[6][x] = 1;
        this.formatBand[6][x+1] = 3;
    }

    // Fill 77 digits of zeroes (8 to complete the word from cols 1-3, 66 to supply six
    // computer words of zeroes, and three "pusher" digits to release the last word from D
    // (note that ArrayBuffer storage is initialized to zero, so band[160..236] == 0).

    for (x=237; x<this.info.length; ++x) {      // fill inactive segment with delete codes
        this.formatBand[6][x] = 3;
    }

    this.doc = null;
    this.window = null;
    this.hopperBar = null;
    this.outHopperFrame = null;
    this.outHopper = null;
    this.formatCol = 0;                 // current format-determination column
    this.formatColumnList = null;
    this.formatSelect = 0;              // current format selection
    this.formatSelectList = null;

    D205Util.openPopup(window, "../webUI/D205CardatronInput.html", mnemonic,
            "location=no,scrollbars,resizable,width=" + w + ",height=" + h +
                ",left=" + (unitIndex*24) + ",top=" + (unitIndex*24),
            this, D205CardatronInput.prototype.readerOnLoad);
}

/**************************************/

D205CardatronInput.prototype.eolRex = /([^\n\r\f]*)((:?\r[\n\f]?)|\n|\f)?/g;
D205CardatronInput.prototype.cardsPerMinute = 240;      // IBM Type 087/089 collator
D205CardatronInput.prototype.eodBias = -0x900000000000; // signals end-of-data to Processor

D205CardatronInput.trackSize = 315;     // digits
D205CardatronInput.digitTime = 60/21600/D205CardatronInput.trackSize;
                                        // one digit time, about 8.8 µs at 21600rpm
D205CardatronInput.digitsPerMilli = 0.001/D205CardatronInput.digitTime;
                                        // digit times per millisecond: 113.4

// Filter ASCII character values to buffer drum info band zone/numeric digits.
// See U.S. Patent 3,000,556, September 16, 1961, L.L. Bewley et al, Figure 2.
D205CardatronInput.prototype.cardFilter = [
        // 0    1    2    3    4    5    6    7    8    9   10   11   12   13   14   15
        0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,  // 00-0F
        0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,  // 10-1F
        0x00,0x60,0x07,0x0B,0x2B,0x4C,0x10,0x0C,0x4C,0x1C,0x2C,0x10,0x4B,0x20,0x1B,0x41,  // 20-2F
        0x40,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x02,0x2B,0x1C,0x0B,0x00,0x00,  // 30-3F
        0x0C,0x11,0x12,0x13,0x14,0x15,0x16,0x17,0x18,0x19,0x21,0x22,0x23,0x24,0x25,0x26,  // 40-4F
        0x27,0x28,0x29,0x42,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x00,0x00,0x00,0x00,0x00,  // 50-5F
        0x01,0x11,0x12,0x13,0x14,0x15,0x16,0x17,0x18,0x19,0x21,0x22,0x23,0x24,0x25,0x26,  // 60-6F
        0x27,0x28,0x29,0x42,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x50,0x05,0x06,0x07,0x00]; // 70-7F

// Translate buffer zone digits to internal zone decades.
// Each row is indexed by the zone digit from the buffer drum info band;
// each column is indexed by the PREVIOUS numeric digit from the info band.
// See U.S. Patent 3,000,556, September 16, 1961, L.L. Bewley et al, Figure 9.
D205CardatronInput.prototype.zoneXlate = [
        //0 1  2  3  4  5  6  7  8  9 10 11 12
        [0, 8, 8, 8, 8, 8, 8, 8, 8, 8, 0, 3, 3],        // zone digit 0
        [1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 0, 0, 0],        // zone digit 1
        [2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 1, 1],        // zone digit 2
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],        // there no zone=3 digits
        [8, 2, 6, 6, 6, 6, 6, 6, 6, 6, 0, 2, 2],        // zone digit 4
        [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],        // zone digit 5
        [5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],        // zone digit 6
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],        // there no zone=7 digits
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],        // there no zone=8 digits
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];       // there no zone=9 digits


/**************************************/
D205CardatronInput.prototype.clear = function clear() {
    /* Initializes (and if necessary, creates) the reader unit state */

    this.ready = false;                 // ready status
    this.bufferReady = false;           // buffer drum info band is ready to send data to Processor
    this.noFormatAlarm = false;         // No Formal Alarm toggle
    this.noReload = false;              // Reload/Format Lockout was set on last op or card
    this.reloadLockout = false;         // Reload Lockout toggle
    this.formatLockout = false;         // Format Lockout toggle
    this.readRequested = false;         // Processor has initiated a read, waiting for buffer
    this.togNumeric = false;            // current digit came from zone (false) or numeric (true) punches

    this.buffer = "";                   // card reader "input hopper"
    this.bufLength = 0;                 // current input buffer length (characters)
    this.bufIndex = 0;                  // 0-relative offset to next "card" to be read

    this.digitCount = 0;                // digit within word being returned (sign=10)
    this.infoIndex = 0;                 // 0-relative offset into info band on drum
    this.kDigit = 0;                    // stashed reload-lockout/format band number
    this.lastNumericDigit = 0;          // last numeric digit encountered
    this.pendingInputWord = 0;          // partially-accumulated input word
    this.selectedFormat = 0;            // currently-selected format band

    this.pendingCall = null;            // stashed pending function reference
    this.pendingParams = null;          // stashed pending function parameters
};

/**************************************/
D205CardatronInput.prototype.$$ = function $$(e) {
    return this.doc.getElementById(e);
};

/**************************************/
D205CardatronInput.prototype.setFormatColumn = function setFormatColumn(index) {
    /* Determines the zero-relative format-selection column from the selectedIndex
    of the FormatColumn select list and sets this.formatCol */

    if (index < 0) {
        this.formatCol = 0;         // treat unselected as column 1
    } else if (index == 0) {
        this.formatCol = 79;        // column 80
    } else if (index < 80) {
        this.formatCol = index-1;   // columns 1-79
    } else {
        this.formatCol = 0;         // treat everything else as col 1
    }
};

/**************************************/
D205CardatronInput.prototype.clearInfoBand = function clearInfoBand() {
    /* Clears the entire info band to zeroes */
    var x;

    this.infoIndex = 0;                 // restart at the beginning of the format band
    for (x=this.info.length-1; x>=0; --x) {
        this.info[x] = 0;
    }
};

/**************************************/
D205CardatronInput.prototype.setReaderReady = function setReaderReady(ready) {
    /* Controls the ready-state of the card reader */

    this.$$("CIFileSelector").disabled = ready;
    if (ready && !this.ready) {
        this.$$("CIStartBtn").classList.add("greenLit")
        this.$$("CIStopBtn").classList.remove("redLit");
        this.ready = true;
    } else if (this.ready && !ready) {
        this.$$("CIStartBtn").classList.remove("greenLit")
        this.$$("CIStopBtn").classList.add("redLit");
        this.ready = false;
    }
};

/**************************************/
D205CardatronInput.prototype.setNoFormatAlarm = function setNoFormatAlarm(noFormat) {
    /* Controls the state of the No Format alarm and lamp */

    this.noFormatAlarm = noFormat;
    if (noFormat) {
        this.setReaderReady(false);
        this.noFormatLamp.set(1);
    } else {
        this.noFormatLamp.set(0);
    }
};

/**************************************/
D205CardatronInput.prototype.setReloadLockout = function setReloadLockout(lockout) {
    /* Controls the state of the Reload Lockout (RLO) toggle and lamp */

    this.reloadLockout = lockout;
    if (lockout) {
        this.reloadLockoutLamp.set(1);
    } else {
        this.bufferReady = false;
        this.setFormatLockout(false);
        this.reloadLockoutLamp.set(0);
    }
};

/**************************************/
D205CardatronInput.prototype.setFormatLockout = function setFormatLockout(lockout) {
    /* Controls the state of the Format Lockout (FLO) toggle and lamp.
    Setting Format Lockout implicitly sets Reload Lockout */

    this.formatLockout = lockout;
    if (lockout) {
        this.setReloadLockout(true);
        this.formatLockoutLamp.set(1);
    } else {
        this.formatLockoutLamp.set(0);
    }
};

/**************************************/
D205CardatronInput.prototype.setFormatSelectLamps = function setFormatSelectLamps(format) {
    /* Sets the FS lamps on the panel from the low-order three bits of "format" */

    this.formatSelect1Lamp.set(format & 0x01);
    this.formatSelect2Lamp.set((format >>> 1) & 0x01);
    this.formatSelect4Lamp.set((format >>> 2) & 0x01);
};

/**************************************/
D205CardatronInput.prototype.CIStartBtn_onClick = function CIStartBtn_onClick(ev) {
    /* Handle the click event for the START button */

    if (!this.ready) {
        this.setNoFormatAlarm(false);
        if (this.bufIndex < this.bufLength) {
            this.setReaderReady(true);
            if (!this.bufferReady) {
                this.initiateCardRead();
            }
        }
    }
};

/**************************************/
D205CardatronInput.prototype.CIStopBtn_onClick = function CIStopBtn_onClick(ev) {
    /* Handle the click event for the STOP button */

    this.$$("CIFileSelector").value = null;     // reset the control so the same file can be reloaded
    if (this.ready) {
        this.setReaderReady(false);
        this.startMachineLamp.set(0);
    }
};

/**************************************/
D205CardatronInput.prototype.ClearBtn_onClick = function ClearBtn_onClick(ev) {
    /* Handle the click event for the CLEAR button */

    this.clearUnit();
};

/**************************************/
D205CardatronInput.prototype.CIHopperBar_onClick = function CIHopperBar_onClick(ev) {
    /* Handle the click event for the "input hopper" meter bar */

    if (this.bufIndex < this.bufLength && !this.ready) {
        if (this.window.confirm((this.bufLength-this.bufIndex).toString() + " of " + this.bufLength.toString() +
                     " characters remaining to read.\nDo you want to clear the input hopper?")) {
            this.buffer = "";
            this.bufLength = 0;
            this.bufIndex = 0;
            this.hopperBar.value = 0;
            this.clearUnit();
            this.$$("CIFileSelector").value = null;     // reset the control
            while (this.outHopper.childNodes.length > 0) {
                this.outHopper.removeChild(this.outHopper.firstChild);
            }
        }
    }
};

/**************************************/
D205CardatronInput.prototype.fileSelector_onChange = function fileSelector_onChange(ev) {
    /* Handle the <input type=file> onchange event when files are selected. For each
    file, load it and add it to the "input hopper" of the reader */
    var deck;
    var f = ev.target.files;
    var that = this;
    var x;

    function fileLoader_onLoad(ev) {
        /* Handle the onLoad event for a Text FileReader */

        if (that.bufIndex >= that.bufLength) {
            that.buffer = ev.target.result;
        } else {
            switch (that.buffer.charAt(that.buffer.length-1)) {
            case "\r":
            case "\n":
            case "\f":
                break;                  // do nothing -- the last card has a delimiter
            default:
                that.buffer += "\n";    // so the next deck starts on a new line
                break;
            }
            that.buffer = that.buffer.substring(that.bufIndex) + ev.target.result;
        }

        that.bufIndex = 0;
        that.bufLength = that.buffer.length;
        that.$$("CIHopperBar").value = that.bufLength;
        that.$$("CIHopperBar").max = that.bufLength;
    }

    for (x=f.length-1; x>=0; x--) {
        deck = new FileReader();
        deck.onload = fileLoader_onLoad;
        deck.readAsText(f[x]);
    }
};

/**************************************/
D205CardatronInput.prototype.format_onChange = function format_onChange(ev) {
    /* Event handler for changes to the FormatColumn and FormatSelect lists */
    var prefs = this.config.getNode("Cardatron.units", this.unitIndex);
    var x;

    switch (ev.target.id) {
    case "FormatColumn":
        x = this.formatColumnList.selectedIndex;
        this.setFormatColumn(x);
        prefs.formatCol = x;
        this.config.putNode("Cardatron.units", prefs, this.unitIndex);
        break;
    case "FormatSelect":
        x = this.formatSelectList.selectedIndex;
        prefs.formatSelect = this.formatSelect = x;
        this.config.putNode("Cardatron.units", prefs, this.unitIndex);
        break;
    }
};

/**************************************/
D205CardatronInput.prototype.readCardImage = function readCardImage() {
    /* Reads one card image from the buffer; pads or trims the image as necessary
    to 80 characters. Detects empty buffer (hopper) and sets the reader not ready
    after reading the last card. Updates the progress bar. Returns the raw ASCII
    card image as a string */
    var card;                           // card image
    var match;                          // result of eolRex.exec()

    this.eolRex.lastIndex = this.bufIndex;
    match = this.eolRex.exec(this.buffer);
    if (!match) {
        card = "";
    } else {
        this.bufIndex += match[0].length;
        card = match[1].toUpperCase();
    }

    if (card.length > 80) {
        card = card.substring(0, 80);
    } else {
        while (card.length <= 70) {
            card += "          ";       // pad with spaces
        }
        while (card.length < 80) {
            card += " ";
        }
    }

    if (this.bufIndex < this.bufLength) {
        this.hopperBar.value = this.bufLength-this.bufIndex;
    } else {
        this.hopperBar.value = 0;
        this.buffer = "";               // discard the input buffer
        this.bufLength = 0;
        this.bufIndex = 0;
        this.setReaderReady(false);
        this.$$("CIFileSelector").value = null; // reset the control so the same file can be reloaded
    }

    while (this.outHopper.childNodes.length > 1) {
        this.outHopper.removeChild(this.outHopper.firstChild);
    }
    this.outHopper.appendChild(this.doc.createTextNode("\n"));
    this.outHopper.appendChild(this.doc.createTextNode(card));

    return card;
};

/**************************************/
D205CardatronInput.prototype.determineFormatBand = function determineFormatBand(card) {
    /* Determines the format band number to be applied to the current card.
    Returns the format band number or zero if No Format Alarm is set */
    var c;                              // selected column character code
    var format;                         // selected format band

    // Check for format override on the reader panel
    format = this.formatSelect;
    if (format > 6) {
        format = 0;
        this.setNoFormatAlarm(true);
    } else if (format <= 0) {
        // No format override, so determine format from a card column
        c = card.charAt(this.formatCol);
        switch (c) {
        case "1":
            format = 1;
            break;
        case "2":
            format = 2;
            break;
        case "3":
            format = 3;
            break;
        case "4":
            format = 4;
            break;
        case "5":
            format = 5;
            break;
        case "6":
            format = 6;
            break;
        case "7":
            format = 7;
            break;
        case "\`":                      // 1-8 punch
            format = 1;
            this.noReload = true;
            this.setFormatLockout(true);
            break;
        case ":":                       // 2-8 punch
            format = 2;
            this.noReload = true;
            this.setFormatLockout(true);
            break;
        case "#":                       // 3-8 punch
            format = 3;
            this.noReload = true;
            this.setFormatLockout(true);
            break;
        case "@":                       // 4-8 punch
            format = 4;
            this.noReload = true;
            this.setFormatLockout(true);
            break;
        case "\'":                      // 5-8 punch
        case "|":                           // translates to a 5-numeric digit
            format = 5;
            this.noReload = true;
            this.setFormatLockout(true);
            break;
        case "=":                       // 6-8 punch
        case "}":                           // translates to a 6-numeric digit
            format = 6;
            this.noReload = true;
            this.setFormatLockout(true);
            break;
        case "\"":                      // 7-8 punch -- reject plus lockout
        case "~":                           // translates to a 7-numeric digit
            format = 7+8;
            this.noReload = true;
            this.setFormatLockout(true);
            break;
        default:
            format = 0;
            this.setNoFormatAlarm(true);
            break;
        } // switch c
    }

    this.setFormatSelectLamps(format);
    return format;
};

/**************************************/
D205CardatronInput.prototype.finishCardRead = function finishCardRead() {
    /* Processes a card image after the delay to read the card. Establishes the
    format band to be used and encodes the data from the card image onto the
    info band of the buffer drum per Figure 2 in US Patent 3,000,556 */
    var band;                           // local copy of selected format band
    var c;                              // current character code
    var card = this.readCardImage();    // the card image in ASCII
    var col;                            // current card column
    var format;                         // selected format band
    var fmax;                           // length of format band
    var info = this.info;               // local copy of info band on buffer drum
    var nu;                             // numeric (true), zone (false) toggle
    var x;                              // info/format band digit index

    this.startMachineLamp.set(0);
    format = this.determineFormatBand(card);
    if ((format & 0x07) == 7) {
        // Reject format -- clear the information band and read next card
        this.selectedFormat = 7;
        // If reject+lockout was imposed by a 7-8 punch, read next card and lock out its successor
        if ((format & 0x08) || !this.reloadLockout) {
            this.initiateCardRead();
        }
    } else if (format > 0) {
        this.selectedFormat = format;
        band = this.formatBand[format];
        fmax = band.length;
        col = card.length-1;            // start with last column on card
        nu = true;                      // start with the numeric digit

        for (x=0; x<fmax; ++x) {
            if (band[x] == 0) {
                info[x] = 0;
            } else {
                if (nu) {
                    c = card.charCodeAt(col);   // translate char to buffer code
                    if (c < 0x80) {
                        c = this.cardFilter[c];
                    } else if (c == 0xA4) {     // the "lozenge" ("¤")
                        c = this.cardFilter[0x3C];  // use the code for "<"
                    } else {
                        c = 0;
                    }
                    info[x] = c & 0x0F;         // take the numeric half
                    nu = false;                 // next will be the zone digit
                } else {
                    info[x] = (c >>> 4) & 0x0F; // take the zone half
                    nu = true;                  // next will be the numeric digit
                    if (col > 0) {              // advance to next card column
                        --col;
                    }
                }
            }
        } // for x

        this.bufferReady = true;
        if (this.readRequested) {       // fire up any pending read from Processor
            this.readRequested = false;
            this.pendingCall.apply(this, this.pendingParams);
            this.pendingCall = null;
        }
    }
};

/**************************************/
D205CardatronInput.prototype.initiateCardRead = function initiateCardRead() {
    /* Initiates the read of the next card into the buffer drum */

    if (this.ready) {
        this.startMachineLamp.set(1);
        this.setNoFormatAlarm(false);
        this.clearInfoBand();
        this.timer = setCallback(this.mnemonic, this,
            60000/this.cardsPerMinute, this.finishCardRead);
    }
};

/**************************************/
D205CardatronInput.prototype.beforeUnload = function beforeUnload(ev) {
    var msg = "Closing this window will make the device unusable.\n" +
              "Suggest you stay on the page and minimize this window instead";

    ev.preventDefault();
    ev.returnValue = msg;
    return msg;
};

/**************************************/
D205CardatronInput.prototype.readerOnLoad = function readerOnLoad(ev) {
    /* Initializes the reader window and user interface */
    var body;
    var de;
    var prefs = this.config.getNode("Cardatron.units", this.unitIndex);

    this.doc = ev.target;
    this.window = this.doc.defaultView;
    de = this.doc.documentElement;
    this.doc.title = "retro-205 Cardatron Reader " + this.mnemonic;

    body = this.$$("CIDiv");
    this.hopperBar = this.$$("CIHopperBar");
    this.outHopperFrame = this.$$("CIOutHopperFrame");
    this.outHopper = this.outHopperFrame.contentDocument.getElementById("Paper");

    this.formatColumnList = this.$$("FormatColumn");
    this.formatColumnList.selectedIndex = prefs.formatCol;
    this.setFormatColumn(prefs.formatCol);
    this.formatSelectList = this.$$("FormatSelect");
    this.formatSelectList.selectedIndex = this.formatSelect = prefs.formatSelect;

    this.noFormatLamp = new ColoredLamp(body, null, null, "NoFormatLamp", "redLamp", "redLit");
    this.noFormatLamp.setCaption("NO FORMAT", true);

    this.startMachineLamp = new NeonLamp(body, null, null, "StartMachineLamp");
    this.startMachineLamp.setCaption("SM", true);
    this.reloadLockoutLamp = new NeonLamp(body, null, null, "ReloadLockoutLamp");
    this.reloadLockoutLamp.setCaption("RLO", true);
    this.formatLockoutLamp = new NeonLamp(body, null, null, "FormatLockoutLamp");
    this.formatLockoutLamp.setCaption("FLO", true);

    this.formatSelect1Lamp = new NeonLamp(body, null, null, "FormatSelect1Lamp");
    this.formatSelect1Lamp.setCaption("FS1", true);
    this.formatSelect2Lamp = new NeonLamp(body, null, null, "FormatSelect2Lamp");
    this.formatSelect2Lamp.setCaption("FS2", true);
    this.formatSelect4Lamp = new NeonLamp(body, null, null, "FormatSelect4Lamp");
    this.formatSelect4Lamp.setCaption("FS4", true);

    this.ready = true;                  // so that setReaderReady called from clearUnit
    this.clearUnit();                   // will actually set the state and lamps correctly

    this.window.addEventListener("beforeunload",
            D205CardatronInput.prototype.beforeUnload);
    this.$$("CIFileSelector").addEventListener("change",
            D205CardatronInput.prototype.fileSelector_onChange.bind(this));
    this.$$("FormatColumn").addEventListener("change",
            D205CardatronInput.prototype.format_onChange.bind(this));
    this.$$("FormatSelect").addEventListener("change",
            D205CardatronInput.prototype.format_onChange.bind(this));
    this.$$("CIStartBtn").addEventListener("click",
            D205CardatronInput.prototype.CIStartBtn_onClick.bind(this));
    this.$$("CIStopBtn").addEventListener("click",
            D205CardatronInput.prototype.CIStopBtn_onClick.bind(this));
    this.$$("ClearBtn").addEventListener("click",
            D205CardatronInput.prototype.ClearBtn_onClick.bind(this));
    this.hopperBar.addEventListener("click",
            D205CardatronInput.prototype.CIHopperBar_onClick.bind(this));

    this.window.resizeBy(de.scrollWidth - this.window.innerWidth + 4, // kludge for right-padding/margin
                         de.scrollHeight - this.window.innerHeight);
};

/**************************************/
D205CardatronInput.prototype.inputWord = function inputWord(wordReceiver) {
    /* Reads the next word of digits from the info band of the buffer drum,
    translating the digits to Datatron Processor code and sending the word to the
    Processor via the wordReceiver callback function. If at end of band, returns any
    partially-accumulated word minus 0x900000000000 to signal end of I/O. Note that
    sign digits must be translated from zone digits specially. Also note that a
    completed word is not returned until the next digit is obtained from the info band */
    var band;                           // local copy of format band
    var d;                              // result digit
    var drumAddr = 0;                   // buffer drum address
    var eod;                            // finished with current digit
    var eow = false;                    // finished with word
    var info = this.info;               // local reference to info band
    var ix = this.infoIndex;            // current info/format band index
    var latency;                        // drum latency for first digit of a word
    var lastNumeric = this.lastNumericDigit;
    var nu = this.togNumeric;           // numeric/zone digit toggle
    var word = this.pendingInputWord;   // word being assembled
    var x = this.digitCount;            // word-digit index

    band = this.formatBand[this.selectedFormat];
    // For the first digit of a word, note the current buffer drum digit address
    drumAddr = (performance.now()*D205CardatronInput.digitsPerMilli) % D205CardatronInput.trackSize;
    latency = (ix - drumAddr + D205CardatronInput.trackSize) % D205CardatronInput.trackSize;

    do {
        eod = false;

        do {
            if (ix >= info.length) {
                // At end of info band -- finish the I/O
                this.inputStop();
                d = 0;
                word = word + this.eodBias; // flag this as the final word of the I/O
                eow = eod = true;
            } else {
                // Translate or delete the current digit
                switch (band[ix]) {
                case 0:                 // insert 0 digit
                    d = 0;
                    ++ix;
                    eod = true;
                    break;
                case 1:                 // translate zone/numeric digit
                    d = info[ix];
                    if (nu) {
                        // Numeric digit: straight translation except for 3-8 and 4-8 punches
                        nu = false;             // next is a zone digit
                        lastNumeric = d;
                        if (d > 9) {
                            d -= 8;
                        }
                    } else {
                        // Zone digit: requires special handling in the sign-digit position
                        nu = true;              // next is a numeric digit
                        d = this.zoneXlate[d][lastNumeric];
                        if (x == 10) {
                            d &= 0x0B;          // zero the 4-bit in the sign digit
                        }
                    }
                    ++ix;
                    eod = true;
                    break;
                case 2:                 // replace zone/numeric digit with zero
                    if (nu) {
                        nu = false;             // next is a zone digit
                        lastNumeric = 0;
                    } else {
                        nu = true;              // next is a numeric digit
                    }
                    d = 0;
                    ++ix;
                    eod = true;
                    break;
                default:                // (3) delete the digit
                    if (nu) {
                        nu = false;             // next is a zone digit
                        lastNumeric = info[ix];
                    } else {
                        nu = true;              // next is a numeric digit
                    }
                    ++ix;
                    // We are not yet done producing the next digit...
                    break;
                } // switch band[ix]
            }
        } while (!eod);

        if (x < 11) {
            // Increment the digit index and shift this digit into the word
            ++x;
            word = word/0x10 + d*0x10000000000;
        } else {
            // Word has overflowed -- send the word to the Processor and save
            // this digit for the next word
            eow = true;
            this.pendingInputWord = d*0x10000000000;
            this.digitCount = 1;
        }
    } while (!eow);

    this.lastNumericDigit = lastNumeric;
    this.togNumeric = nu;
    this.infoIndex = ix;

    // Delay sending the word for the amount of time until buffer drum was in position
    setCallback(this.mnemonic, this, latency/D205CardatronInput.digitsPerMilli,
            wordReceiver, word);
};

/**************************************/
D205CardatronInput.prototype.inputInitiate = function inputInitiate(kDigit, wordReceiver) {
    /* Initiates a read against the buffer drum on this unit. kDigit is the
    second numeric digit from the instruction word, with odd values indicating
    reload-lockout should be imposed at the end of the read. wordReceiver is the
    callback function that will receive one word at a time for return to the
    Processor. If the buffer is not ready, simply sets the readRequested flag
    and exits after stashing kDigit and the wordReceiver callback */

    if (!this.bufferReady) {
        this.readRequested = true;      // wait for the buffer to be filled
        this.pendingCall = inputInitiate;
        this.pendingParams = [kDigit, wordReceiver];
        if (!this.ready) {
            this.window.focus();
        }
    } else {
        this.kDigit = kDigit;
        this.noReload |= (kDigit%2 == 1);
        this.infoIndex = 0;             // start at the beginning of the info band
        this.digitCount = 0;
        this.pendingInputWord = 0;
        this.togNumeric = true;
        this.lastNumericDigit = 0;
        setCallback(this.mnemonic, this,
                D205CardatronInput.trackSize/D205CardatronInput.digitsPerMilli*1.5,
                this.inputWord, wordReceiver); // return the first word from the drum
    }
};

/**************************************/
D205CardatronInput.prototype.inputStop = function inputStop() {
    /* Terminates data transfer from the input unit and releases the card */

    this.setFormatSelectLamps(0);
    if (this.noReload) {                // set reload-lockout
        this.noReload = false;
        if (!this.reloadLockout) {
            this.setReloadLockout(true);
        }
    } else if (this.reloadLockout) {    // reset reload-lockout
        this.setReloadLockout(false);
    }

    if (!this.reloadLockout) {
        this.bufferReady = false;
        this.initiateCardRead();
    }
};

/**************************************/
D205CardatronInput.prototype.inputReadyInterrogate = function inputReadyInterrogate() {
    /* Returns the current ready status of the input unit */

    return this.bufferReady;
};

/**************************************/
D205CardatronInput.prototype.inputFormatInitiate = function inputFormatInitiate(
        kDigit, requestNextWord, signalFinished) {
    /* Initiates the loading of a format band on this unit. kDigit is the
    second numeric digit from the instruction word, with odd values indicating
    reload-lockout should be imposed at the end of the read and the remaining
    three bits indicating the format band to be loaded. requestNextWord is the
    callback function that will trigger the Processor to send the next word.
    signalFinished is the callback function that will signal the Processor to
    terminate the I/O */

    if (kDigit > 9) {
        signalFinished();
    } else {
        this.kDigit = kDigit;
        this.noReload |= (kDigit%2 == 1);
        this.selectedFormat = ((kDigit >>> 1) & 0x07) + 1;
        this.infoIndex = 0;             // start at the beginning of the format band
        this.setFormatSelectLamps(this.selectedFormat);
        setCallback(this.mnemonic, this,
                D205CardatronInput.trackSize/D205CardatronInput.digitsPerMilli*2.5,
                requestNextWord, this.boundInputFormatWord); // request the first format digit
    }
};

/**************************************/
D205CardatronInput.prototype.inputFormatWord = function inputFormatWord(
        word, requestNextWord, signalFinished) {
    /* Receives the next input format band word from the Processor and
    stores the digits from the word into the next 11 format band digits */
    var band = this.formatBand[this.selectedFormat];
    var d;                              // current format digit
    var ix = this.infoIndex;            // current format band digit index
    var x;                              // word-digit index

    for (x=0; x<11; ++x) {
        d = word % 0x10;
        word = (word-d)/0x10;
        if (ix < D205CardatronInput.trackSize) {
            band[ix++] = d % 4;
        } else {
            break;                      // out of for loop
        }
    } // for x

    this.infoIndex = ix;
    if (ix < D205CardatronInput.trackSize) {
        requestNextWord(this.boundInputFormatWord);
    } else {
        this.setFormatSelectLamps(0);
        if (this.noReload) {                // set reload-lockout
            this.noReload = false;
            if (!this.reloadLockout) {
                this.setReloadLockout(true);
            }
        } else if (this.reloadLockout) {    // reset reload-lockout
            this.setReloadLockout(false);
            this.initiateCardRead();
        }
        signalFinished();
    }
};

/**************************************/
D205CardatronInput.prototype.clearUnit = function clearUnit() {
    /* Clears the input unit and resets all internal state */

    this.$$("CIFileSelector").value = null;     // reset the control so the same file can be reloaded
    this.bufferReady = false;
    this.setReaderReady(false);
    this.setNoFormatAlarm(false);
    this.setReloadLockout(false);
    this.setFormatLockout(false);
    this.startMachineLamp.set(0);
    this.setFormatSelectLamps(7);

    // If there is a pending read, confirm that this.pendingParams[1] is a
    // function and call it with the end-of-data signal. We assume it's the
    // Processor's wordReceiver function. This will prevent the Processor
    // from hanging on an I/O to a cleared input unit.
    if (this.readRequested) {
        if (Object.prototype.toString.call(this.pendingParams) === "[object Array]") {
            if (Object.prototype.toString.call(this.pendingParams[1]) === "[object Function]") {
                this.pendingParams[1](this.eodBias);
            }
        }
    }

    this.clear();
    if (this.timer) {
        clearCallback(this.timer);
        this.timer = 0;
    }
};

/**************************************/
D205CardatronInput.prototype.shutDown = function shutDown() {
    /* Shuts down the device */

    if (this.timer) {
        clearCallback(this.timer);
    }
    this.window.removeEventListener("beforeunload", D205CardatronInput.prototype.beforeUnload);
    this.window.close();
};
